import { Injectable, inject, signal, computed, NgZone } from '@angular/core';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

export interface TunnelConfig {
  subdomain: string;
  localPort: number;
  url: string;
}

interface TunnelRequest {
  id: string;
  subdomain: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}

export type TunnelConnectionState = 'disconnected' | 'connecting' | 'connected';

@Injectable({ providedIn: 'root' })
export class TunnelService {
  private ngZone = inject(NgZone);
  private authService = inject(AuthService);

  private socket: WebSocket | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  // Track multiple active tunnels
  readonly activeTunnels = signal<TunnelConfig[]>([]);
  readonly hasTunnels = computed(() => this.activeTunnels().length > 0);
  readonly connectionState = signal<TunnelConnectionState>('disconnected');
  readonly isConnected = computed(() => this.connectionState() === 'connected');

  private checkCallbacks = new Map<string, (available: boolean) => void>();

  constructor() {
    // Clear tunnels on logout
    this.authService.onLogout(() => {
      this.disconnect();
    });
  }

  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const token = this.authService.getAccessToken();
    if (!token) return;

    this.connectionState.set('connecting');

    // Derive tunnel WebSocket URL from the base URL pattern
    const tunnelWsUrl = environment.wsBaseUrl.replace('/sync', '/tunnel');
    const url = `${tunnelWsUrl}?token=${encodeURIComponent(token)}`;
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.ngZone.run(() => {
        this.connectionState.set('connected');
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
        this.connectionState.set('disconnected');
        this.activeTunnels.set([]);
      });
    };

    this.socket.onerror = () => {
      // onclose will fire after onerror
    };
  }

  disconnect(): void {
    this.stopPing();
    this.activeTunnels.set([]);

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.connectionState.set('disconnected');
  }

  registerTunnel(subdomain: string, localPort: number): void {
    this.send({
      action: 'register',
      subdomain,
      local_port: localPort,
    });
  }

  unregisterTunnel(subdomain: string): void {
    this.send({
      action: 'unregister',
      subdomain,
    });
  }

  checkSubdomain(subdomain: string): Promise<boolean> {
    return new Promise((resolve) => {
      // Store callback
      this.checkCallbacks.set(subdomain, resolve);

      // Send check request
      this.send({ action: 'check', subdomain });

      // Timeout after 5s
      setTimeout(() => {
        if (this.checkCallbacks.has(subdomain)) {
          this.checkCallbacks.delete(subdomain);
          resolve(false);
        }
      }, 5000);
    });
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
        case 'connected':
          // Connection established
          break;

        case 'registered':
          this.activeTunnels.update(tunnels => [
            ...tunnels,
            { subdomain: message.subdomain, localPort: message.local_port, url: message.url }
          ]);
          break;

        case 'unregistered':
          this.activeTunnels.update(tunnels =>
            tunnels.filter(t => t.subdomain !== message.subdomain)
          );
          break;

        case 'check_result': {
          const callback = this.checkCallbacks.get(message.subdomain);
          if (callback) {
            callback(message.available);
            this.checkCallbacks.delete(message.subdomain);
          }
          break;
        }

        case 'tunnel_request':
          this.handleTunnelRequest(message as TunnelRequest);
          break;

        case 'pong':
          break;

        case 'error':
          console.error('[Tunnel] Server error:', message.message, message.ref_action);
          break;

        default:
          console.warn('[Tunnel] Unhandled message type:', message.type);
      }
    } catch {
      console.error('[Tunnel] Failed to parse message:', raw);
    }
  }

  private async handleTunnelRequest(request: TunnelRequest): Promise<void> {
    const tunnel = this.activeTunnels().find(t => t.subdomain === request.subdomain);
    if (!tunnel) return;

    // Forward to Electron main process
    const electronAPI = (window as unknown as { electronAPI: {
      invoke: (channel: string, ...args: unknown[]) => Promise<{ success: boolean; data?: unknown; error?: unknown }>;
    } }).electronAPI;

    const result = await electronAPI.invoke('tunnel-forward-request', {
      requestId: request.id,
      localPort: tunnel.localPort,
      method: request.method,
      path: request.path,
      headers: request.headers,
      body: request.body,
    });

    if (result.success) {
      const data = result.data as {
        requestId: string;
        statusCode: number;
        headers: Record<string, string>;
        body: string;
        error?: string;
      };
      this.send({
        action: 'response',
        request_id: data.requestId,
        status_code: data.statusCode,
        resp_headers: data.headers,
        resp_body: data.body,
        resp_error: data.error || '',
      });
    } else {
      // Send error response
      this.send({
        action: 'response',
        request_id: request.id,
        status_code: 502,
        resp_headers: {},
        resp_body: '',
        resp_error: 'Failed to forward request',
      });
    }
  }

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
}
