import { Injectable, signal, computed, inject, NgZone, OnDestroy, effect } from '@angular/core';
import { AuthService } from './auth.service';
import { CloudWorkspaceService } from './cloud-workspace.service';
import { UnifiedCollectionService } from './unified-collection.service';
import { environment } from '../../../environments/environment';

export type RealtimeConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface OnlineUser {
  user_id: string;
  user_name: string;
  avatar_url: string;
}

@Injectable({ providedIn: 'root' })
export class RealtimeService implements OnDestroy {
  private ngZone = inject(NgZone);
  private authService = inject(AuthService);
  private cloudWorkspace = inject(CloudWorkspaceService);
  private unifiedCollection = inject(UnifiedCollectionService);

  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private intentionalClose = false;
  private subscribedWorkspaces = new Set<string>();

  private _state = signal<RealtimeConnectionState>('disconnected');
  private _clientId = signal<string | null>(null);
  private _presence = signal<Map<string, OnlineUser[]>>(new Map());
  private _lastAction = signal<{ message: string; timestamp: number } | null>(null);
  private lastActionTimer: ReturnType<typeof setTimeout> | null = null;

  readonly state = this._state.asReadonly();
  readonly clientId = this._clientId.asReadonly();
  readonly isConnected = computed(() => this._state() === 'connected');
  readonly lastAction = this._lastAction.asReadonly();
  readonly presence = this._presence.asReadonly();

  readonly statusTooltip = computed(() => {
    switch (this._state()) {
      case 'connected': return 'Realtime: Connected';
      case 'connecting': return 'Realtime: Connecting...';
      case 'reconnecting': return `Realtime: Reconnecting (attempt ${this.reconnectAttempts})...`;
      case 'disconnected': return 'Realtime: Disconnected';
    }
  });

  constructor() {
    this.authService.onLogin(() => this.connect());
    this.authService.onLogout(() => this.disconnect());

    // Auto-subscribe to active workspace changes
    effect(() => {
      const workspace = this.cloudWorkspace.activeWorkspace();
      if (!this.isConnected()) return;

      // Unsubscribe from workspaces no longer active
      for (const id of this.subscribedWorkspaces) {
        if (!workspace || workspace.id !== id) {
          this.unsubscribe(id);
        }
      }

      // Subscribe to new active workspace
      if (workspace && !this.subscribedWorkspaces.has(workspace.id)) {
        this.subscribe(workspace.id);
      }
    });

    // Auto-connect if already authenticated
    if (this.authService.isAuthenticated()) {
      this.connect();
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  /** Get online users for a workspace */
  getPresence(workspaceId: string): OnlineUser[] {
    return this._presence().get(workspaceId) ?? [];
  }

  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const token = this.authService.getAccessToken();
    if (!token) return;

    this.intentionalClose = false;
    this._state.set(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    const url = `${environment.wsBaseUrl}?token=${encodeURIComponent(token)}`;
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.ngZone.run(() => {
        this.reconnectAttempts = 0;
        this._state.set('connected');
        this.startPing();
      });
    };

    this.socket.onmessage = (event) => {
      this.ngZone.run(() => {
        this.handleMessage(event.data);
      });
    };

    this.socket.onclose = () => {
      this.ngZone.run(() => {
        this.socket = null;
        this.stopPing();
        if (!this.intentionalClose) {
          this._state.set('reconnecting');
          this.scheduleReconnect();
        } else {
          this._state.set('disconnected');
        }
      });
    };

    this.socket.onerror = () => {
      // onclose will fire after onerror, so reconnect logic is handled there
    };
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    this.stopPing();
    this.reconnectAttempts = 0;
    this.subscribedWorkspaces.clear();
    this._presence.set(new Map());
    this._clientId.set(null);
    if (this.lastActionTimer) {
      clearTimeout(this.lastActionTimer);
      this.lastActionTimer = null;
    }
    this._lastAction.set(null);

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this._state.set('disconnected');
  }

  subscribe(workspaceId: string): void {
    this.send({ action: 'subscribe', workspace_id: workspaceId });
  }

  unsubscribe(workspaceId: string): void {
    this.send({ action: 'unsubscribe', workspace_id: workspaceId });
  }

  private send(message: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private handleMessage(raw: string): void {
    try {
      const message = JSON.parse(raw);

      switch (message.type) {
        // --- System ---
        case 'connected':
          this._clientId.set(message.client_id);
          this.resubscribe();
          break;

        case 'subscribed':
          this.subscribedWorkspaces.add(message.workspace_id);
          break;

        case 'unsubscribed':
          this.subscribedWorkspaces.delete(message.workspace_id);
          this._presence.update(m => { const n = new Map(m); n.delete(message.workspace_id); return n; });
          break;

        case 'pong':
          break;

        case 'error':
          console.error('[Realtime] Server error:', message.message, message.ref_action);
          break;

        // --- Presence ---
        case 'presence_update':
          this._presence.update(m => new Map(m).set(message.workspace_id, message.data.online_users));
          break;

        // --- Collection events ---
        case 'collection_created':
          this.handleCollectionEvent(message);
          this.setLastAction(`Collection "${message.data?.name || 'unknown'}" created`);
          break;
        case 'collection_updated':
          this.handleCollectionEvent(message);
          this.setLastAction(`Collection "${message.data?.name || 'unknown'}" updated`);
          break;
        case 'collection_deleted':
          this.handleCollectionEvent(message);
          this.setLastAction(`Collection deleted`);
          break;

        // --- Workspace events ---
        case 'workspace_updated':
          this.handleWorkspaceUpdated(message);
          this.setLastAction(`Workspace renamed to "${message.data?.name}"`);
          break;

        case 'member_joined':
          this.setLastAction(`${message.data?.user_name || 'Someone'} joined the workspace`);
          break;
        case 'member_left':
          this.setLastAction(`${message.data?.user_name || 'Someone'} left the workspace`);
          break;

        case 'workspaces_changed':
          this.handleWorkspacesChanged(message);
          break;

        default:
          console.warn('[Realtime] Unhandled message type:', message.type);
      }
    } catch {
      console.error('[Realtime] Failed to parse message:', raw);
    }
  }

  /** Re-subscribe to workspaces after reconnect */
  private resubscribe(): void {
    const activeWorkspace = this.cloudWorkspace.activeWorkspace();
    if (activeWorkspace) {
      this.subscribe(activeWorkspace.id);
    }
  }

  private async handleCollectionEvent(message: any): Promise<void> {
    const activeWs = this.cloudWorkspace.activeWorkspace();
    if (!activeWs || activeWs.id !== message.workspace_id) return;

    const collectionId = message.data?.id;

    // For deleted collections or missing ID, do full reload
    if (message.type === 'collection_deleted' || !collectionId) {
      await this.cloudWorkspace.loadCollections(activeWs.id);
      return;
    }

    // For created/updated with known ID, use smart handler with merge support
    await this.unifiedCollection.handleRemoteCollectionUpdate(
      activeWs.id,
      collectionId
    );
  }

  private handleWorkspaceUpdated(message: any): void {
    const { workspace_id, data } = message;
    this.cloudWorkspace.workspaces.update(ws =>
      ws.map(w => w.id === workspace_id ? { ...w, name: data.name as string } : w)
    );
    const active = this.cloudWorkspace.activeWorkspace();
    if (active && active.id === workspace_id) {
      this.cloudWorkspace.activeWorkspace.set({ ...active, name: data.name as string });
    }
  }

  private handleWorkspacesChanged(message: any): void {
    const { reason } = message.data || {};

    // Reload workspaces and pending invites
    this.cloudWorkspace.loadWorkspaces();
    this.cloudWorkspace.loadPendingInvites();

    // Show appropriate message based on reason
    switch (reason) {
      case 'invite_accepted':
        this.setLastAction('You joined a new workspace');
        break;
      case 'invite_received':
        this.setLastAction('You received a workspace invite');
        break;
      case 'removed_from_workspace':
        this.setLastAction('You were removed from a workspace');
        break;
      case 'workspace_deleted':
        this.setLastAction('A workspace was deleted');
        break;
      default:
        this.setLastAction('Workspaces updated');
    }
  }

  // --- Keep-alive ---
  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      this.send({ action: 'ping' });
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // --- Reconnection ---
  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this._state.set('disconnected');
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.ngZone.run(() => {
        this.connect();
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setLastAction(message: string): void {
    if (this.lastActionTimer) {
      clearTimeout(this.lastActionTimer);
    }
    this._lastAction.set({ message, timestamp: Date.now() });
    this.lastActionTimer = setTimeout(() => {
      this._lastAction.set(null);
      this.lastActionTimer = null;
    }, 5000);
  }
}
