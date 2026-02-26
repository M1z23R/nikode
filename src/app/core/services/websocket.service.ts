import { Injectable, inject, signal, OnDestroy } from '@angular/core';
import { TabsService, ToastService } from '@m1z23r/ngx-ui';
import { isIpcError } from '@shared/ipc-types';
import { ApiService } from './api.service';
import { UnifiedCollectionService } from './unified-collection.service';
import { EnvironmentService } from './environment.service';
import { CollectionItem, KeyValue, WebSocketSavedMessage } from '../models/collection.model';
import {
  OpenWebSocketConnection,
  WebSocketMessage,
  WebSocketConnectionStatus,
  WebSocketConnectedEvent,
  WebSocketMessageEvent,
  WebSocketCloseEvent,
  WebSocketErrorEvent,
} from '../models/websocket.model';
import { resolveVariables } from '../utils/variable-resolver';
import { WebSocketTabContentComponent, WebSocketTabData } from '../../features/websocket-editor/websocket-tab-content.component';

@Injectable({ providedIn: 'root' })
export class WebSocketService implements OnDestroy {
  private api = inject(ApiService);
  private unifiedCollectionService = inject(UnifiedCollectionService);
  private environmentService = inject(EnvironmentService);
  private toastService = inject(ToastService);
  private tabsService = inject(TabsService);

  private openConnections = signal<OpenWebSocketConnection[]>([]);
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly connections = this.openConnections.asReadonly();

  // Bound callback functions for IPC events
  private onConnectedCallback = this.handleConnected.bind(this);
  private onMessageCallback = this.handleMessage.bind(this);
  private onCloseCallback = this.handleClose.bind(this);
  private onErrorCallback = this.handleError.bind(this);

  constructor() {
    // Register IPC event listeners
    this.api.onWsConnected(this.onConnectedCallback);
    this.api.onWsMessage(this.onMessageCallback);
    this.api.onWsClose(this.onCloseCallback);
    this.api.onWsError(this.onErrorCallback);

    // Provide dirty tab data for remote update merges
    this.unifiedCollectionService.onGetDirtyTabUpdates((collectionPath) =>
      this.openConnections()
        .filter(c => c.collectionPath === collectionPath && c.dirty)
        .map(c => ({
          itemId: c.itemId,
          updates: {
            name: c.name, url: c.url, headers: c.headers,
            wsProtocols: c.protocols, wsAutoReconnect: c.autoReconnect,
            wsReconnectInterval: c.reconnectInterval, wsSavedMessages: c.savedMessages,
          }
        }))
    );

    // Refresh open connections when a collection is updated after merge resolution
    this.unifiedCollectionService.onCollectionRefreshed((collectionId, force) => {
      this.refreshOpenConnectionsForCollection(collectionId, force);
    });
  }

  ngOnDestroy(): void {
    // Remove IPC event listeners
    this.api.removeWsConnectedListener(this.onConnectedCallback);
    this.api.removeWsMessageListener(this.onMessageCallback);
    this.api.removeWsCloseListener(this.onCloseCallback);
    this.api.removeWsErrorListener(this.onErrorCallback);

    // Clear reconnect timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
  }

  openWebSocket(collectionPath: string, itemId: string): void {
    const item = this.unifiedCollectionService.findItem(collectionPath, itemId);
    if (!item || item.type !== 'websocket') return;

    const connectionId = `${collectionPath}:${itemId}`;

    // Check if already open
    if (this.tabsService.getTab(connectionId)) {
      this.tabsService.activateById(connectionId);
      return;
    }

    const openConnection = this.createOpenConnection(collectionPath, item);
    this.openConnections.update(conns => [...conns, openConnection]);

    // Open tab
    const tabRef = this.tabsService.open<WebSocketTabContentComponent, WebSocketTabData, void>(
      WebSocketTabContentComponent,
      {
        id: connectionId,
        label: item.name,
        data: { connectionId },
        closable: true,
        activate: true,
      }
    );

    // Handle tab close
    tabRef.afterClosed().then(() => {
      // Disconnect if connected
      const conn = this.getConnection(connectionId);
      if (conn && conn.status === 'connected') {
        this.disconnect(connectionId);
      }
      this.openConnections.update(conns => conns.filter(c => c.id !== connectionId));
    });
  }

  private createOpenConnection(collectionPath: string, item: CollectionItem): OpenWebSocketConnection {
    return {
      id: `${collectionPath}:${item.id}`,
      collectionPath,
      itemId: item.id,
      name: item.name,
      url: item.url || '',
      headers: item.headers || [],
      protocols: item.wsProtocols || [],
      autoReconnect: item.wsAutoReconnect ?? false,
      reconnectInterval: item.wsReconnectInterval ?? 5000,
      status: 'disconnected',
      messages: [],
      stats: {
        messagesSent: 0,
        messagesReceived: 0,
        bytesSent: 0,
        bytesReceived: 0,
      },
      dirty: false,
      savedMessages: item.wsSavedMessages || [],
    };
  }

  getConnection(connectionId: string): OpenWebSocketConnection | undefined {
    return this.openConnections().find(c => c.id === connectionId);
  }

  updateConnection(connectionId: string, updates: Partial<OpenWebSocketConnection>): void {
    this.openConnections.update(conns =>
      conns.map(c => c.id === connectionId ? { ...c, ...updates, dirty: true } : c)
    );
  }

  async connect(connectionId: string): Promise<void> {
    const conn = this.getConnection(connectionId);
    if (!conn) return;

    // Clear any existing reconnect timer
    this.clearReconnectTimer(connectionId);

    // Update status
    this.updateConnectionStatus(connectionId, 'connecting');

    // Resolve variables in URL and headers
    const variables = this.environmentService.resolveVariables(conn.collectionPath);
    const resolvedUrl = resolveVariables(conn.url, variables);

    const headers: Record<string, string> = {};
    for (const h of conn.headers) {
      if (h.enabled && h.key) {
        headers[h.key] = resolveVariables(h.value, variables);
      }
    }

    const result = await this.api.wsConnect({
      connectionId,
      url: resolvedUrl,
      headers,
      protocols: conn.protocols,
    });

    if (isIpcError(result)) {
      this.toastService.error(result.error.userMessage);
      this.updateConnectionStatus(connectionId, 'error', result.error.message);
      return;
    }

    if (!result.data.success) {
      this.updateConnectionStatus(connectionId, 'error', result.data.error);
    }
  }

  async disconnect(connectionId: string, code?: number, reason?: string): Promise<void> {
    const conn = this.getConnection(connectionId);
    if (!conn) return;

    // Clear any reconnect timer
    this.clearReconnectTimer(connectionId);

    // Disable auto-reconnect temporarily to prevent reconnection after manual disconnect
    this.openConnections.update(conns =>
      conns.map(c => c.id === connectionId ? { ...c, autoReconnect: false } : c)
    );

    const result = await this.api.wsDisconnect({ connectionId, code, reason });

    if (isIpcError(result)) {
      this.toastService.error(result.error.userMessage);
    }
  }

  async send(connectionId: string, type: 'text' | 'binary', data: string): Promise<void> {
    const conn = this.getConnection(connectionId);
    if (!conn || conn.status !== 'connected') {
      this.toastService.error('Not connected');
      return;
    }

    const result = await this.api.wsSend({ connectionId, type, data });

    if (isIpcError(result)) {
      this.toastService.error(result.error.userMessage);
      return;
    }

    if (!result.data.success) {
      this.toastService.error(result.data.error || 'Failed to send message');
      return;
    }

    // Add sent message to log
    const size = type === 'binary' ? Math.ceil(data.length * 0.75) : data.length;
    const message: WebSocketMessage = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      direction: 'sent',
      type,
      data,
      size,
    };

    this.openConnections.update(conns =>
      conns.map(c => c.id === connectionId ? {
        ...c,
        messages: [...c.messages, message],
        stats: {
          ...c.stats,
          messagesSent: c.stats.messagesSent + 1,
          bytesSent: c.stats.bytesSent + size,
        },
      } : c)
    );
  }

  saveMessage(connectionId: string, message: WebSocketSavedMessage): void {
    const conn = this.getConnection(connectionId);
    if (!conn) return;

    this.openConnections.update(conns =>
      conns.map(c => c.id === connectionId ? {
        ...c,
        savedMessages: [...c.savedMessages, message],
        dirty: true,
      } : c)
    );
  }

  deleteSavedMessage(connectionId: string, messageId: string): void {
    const conn = this.getConnection(connectionId);
    if (!conn) return;

    this.openConnections.update(conns =>
      conns.map(c => c.id === connectionId ? {
        ...c,
        savedMessages: c.savedMessages.filter(m => m.id !== messageId),
        dirty: true,
      } : c)
    );
  }

  clearMessages(connectionId: string): void {
    this.openConnections.update(conns =>
      conns.map(c => c.id === connectionId ? {
        ...c,
        messages: [],
      } : c)
    );
  }

  saveConnection(connectionId: string): void {
    const conn = this.getConnection(connectionId);
    if (!conn) return;

    const updates: Partial<CollectionItem> = {
      name: conn.name,
      url: conn.url,
      headers: conn.headers,
      wsProtocols: conn.protocols,
      wsAutoReconnect: conn.autoReconnect,
      wsReconnectInterval: conn.reconnectInterval,
      wsSavedMessages: conn.savedMessages,
    };

    this.unifiedCollectionService.updateItem(conn.collectionPath, conn.itemId, updates);
    this.unifiedCollectionService.save(conn.collectionPath);

    this.openConnections.update(conns =>
      conns.map(c => c.id === connectionId ? { ...c, dirty: false } : c)
    );

    this.tabsService.updateLabel(connectionId, conn.name);
  }

  /**
   * Refresh open connections that belong to a collection from the collection data.
   * When force=true, also refreshes dirty tabs and clears their dirty flag.
   */
  private refreshOpenConnectionsForCollection(collectionPath: string, force = false): void {
    this.openConnections.update(conns =>
      conns.map(conn => {
        if (conn.collectionPath !== collectionPath) return conn;

        const item = this.unifiedCollectionService.findItem(collectionPath, conn.itemId);
        if (!item || item.type !== 'websocket') return conn;

        // Skip dirty connections unless force is set
        if (conn.dirty && !force) return conn;

        return {
          ...conn,
          name: item.name,
          url: item.url || '',
          headers: item.headers || [],
          protocols: item.wsProtocols || [],
          autoReconnect: item.wsAutoReconnect ?? false,
          reconnectInterval: item.wsReconnectInterval ?? 5000,
          savedMessages: item.wsSavedMessages || [],
          dirty: force ? false : conn.dirty,
        };
      })
    );

    // Update tab labels for refreshed connections
    for (const conn of this.openConnections()) {
      if (conn.collectionPath === collectionPath && !conn.dirty) {
        this.tabsService.updateLabel(conn.id, conn.name);
      }
    }
  }

  private handleConnected(event: WebSocketConnectedEvent): void {
    const conn = this.getConnection(event.connectionId);
    if (!conn) return;

    // Add connection opened message
    const message: WebSocketMessage = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      direction: 'received',
      type: 'open',
      size: 0,
    };

    this.openConnections.update(conns =>
      conns.map(c => c.id === event.connectionId ? {
        ...c,
        status: 'connected' as WebSocketConnectionStatus,
        errorMessage: undefined,
        messages: [...c.messages, message],
        stats: {
          ...c.stats,
          connectedAt: Date.now(),
        },
      } : c)
    );
  }

  private handleMessage(event: WebSocketMessageEvent): void {
    const conn = this.getConnection(event.connectionId);
    if (!conn) return;

    const message: WebSocketMessage = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      direction: 'received',
      type: event.type,
      data: event.data,
      size: event.size,
    };

    this.openConnections.update(conns =>
      conns.map(c => c.id === event.connectionId ? {
        ...c,
        messages: [...c.messages, message],
        stats: {
          ...c.stats,
          messagesReceived: c.stats.messagesReceived + 1,
          bytesReceived: c.stats.bytesReceived + event.size,
        },
      } : c)
    );
  }

  private handleClose(event: WebSocketCloseEvent): void {
    const conn = this.getConnection(event.connectionId);
    if (!conn) return;

    // Add close message
    const message: WebSocketMessage = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      direction: 'received',
      type: 'close',
      size: 0,
      closeCode: event.code,
      closeReason: event.reason,
    };

    this.openConnections.update(conns =>
      conns.map(c => c.id === event.connectionId ? {
        ...c,
        status: 'disconnected' as WebSocketConnectionStatus,
        messages: [...c.messages, message],
        stats: {
          ...c.stats,
          connectedAt: undefined,
        },
      } : c)
    );

    // Schedule reconnect if enabled
    if (conn.autoReconnect && !event.wasClean) {
      this.scheduleReconnect(event.connectionId);
    }
  }

  private handleError(event: WebSocketErrorEvent): void {
    const conn = this.getConnection(event.connectionId);
    if (!conn) return;

    // Add error message
    const message: WebSocketMessage = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      direction: 'received',
      type: 'error',
      size: 0,
      error: event.message,
    };

    this.openConnections.update(conns =>
      conns.map(c => c.id === event.connectionId ? {
        ...c,
        messages: [...c.messages, message],
        errorMessage: event.message,
      } : c)
    );
  }

  private updateConnectionStatus(connectionId: string, status: WebSocketConnectionStatus, errorMessage?: string): void {
    this.openConnections.update(conns =>
      conns.map(c => c.id === connectionId ? {
        ...c,
        status,
        errorMessage,
      } : c)
    );
  }

  private scheduleReconnect(connectionId: string): void {
    const conn = this.getConnection(connectionId);
    if (!conn) return;

    this.updateConnectionStatus(connectionId, 'reconnecting');

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(connectionId);
      this.connect(connectionId);
    }, conn.reconnectInterval);

    this.reconnectTimers.set(connectionId, timer);
  }

  private clearReconnectTimer(connectionId: string): void {
    const timer = this.reconnectTimers.get(connectionId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(connectionId);
    }
  }
}
