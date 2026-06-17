import { Injectable, inject, signal, computed, NgZone } from '@angular/core';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

export interface IWebhookEndpoint {
  subdomain: string;
  url: string;
}

export interface IWebhookRequest {
  id: string;
  subdomain: string;
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
  remoteAddr: string;
  receivedAt: number;
}

export type WebhookConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

const MAX_REQUESTS = 500;

@Injectable({ providedIn: 'root' })
export class WebhookService {
  private ngZone = inject(NgZone);
  private authService = inject(AuthService);

  private socket: WebSocket | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly baseReconnectDelay = 1000;
  private readonly maxReconnectDelay = 30000;
  private intentionalClose = false;

  private pendingEndpoints: IWebhookEndpoint[] = [];

  readonly endpoints = signal<IWebhookEndpoint[]>([]);
  readonly requests = signal<IWebhookRequest[]>([]);
  readonly connectionState = signal<WebhookConnectionState>('disconnected');
  readonly hasWebhooks = computed(() => this.endpoints().length > 0 || this.pendingEndpoints.length > 0);
  readonly isConnected = computed(() => this.connectionState() === 'connected');
  readonly isReconnecting = computed(() => this.connectionState() === 'reconnecting');

  private checkCallbacks = new Map<string, (available: boolean) => void>();

  constructor() {
    this.authService.onLogout(() => this.disconnect());
  }

  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }
    const token = this.authService.getAccessToken();
    if (!token) return;

    this.intentionalClose = false;
    this.connectionState.set(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    const webhookWsUrl = environment.wsBaseUrl.replace('/sync', '/webhook');
    const url = `${webhookWsUrl}?token=${encodeURIComponent(token)}`;
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.ngZone.run(() => {
        this.reconnectAttempts = 0;
        this.connectionState.set('connected');
        this.startPing();
        this.reregisterEndpoints();
      });
    };

    this.socket.onmessage = (event) => {
      this.ngZone.run(() => this.handleMessage(event.data));
    };

    this.socket.onclose = () => {
      this.ngZone.run(() => {
        this.socket = null;
        this.stopPing();
        if (!this.intentionalClose) {
          const current = this.endpoints();
          if (current.length > 0) this.pendingEndpoints = [...current];
          this.endpoints.set([]);
          this.connectionState.set('reconnecting');
          this.scheduleReconnect();
        } else {
          this.endpoints.set([]);
          this.connectionState.set('disconnected');
        }
      });
    };

    this.socket.onerror = () => {};
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    this.stopPing();
    this.reconnectAttempts = 0;
    this.pendingEndpoints = [];
    this.endpoints.set([]);
    this.requests.set([]);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connectionState.set('disconnected');
  }

  registerWebhook(subdomain: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send({ action: 'register', subdomain });
    } else {
      if (!this.pendingEndpoints.some(e => e.subdomain === subdomain)) {
        this.pendingEndpoints.push({ subdomain, url: '' });
      }
      this.connect();
    }
  }

  unregisterWebhook(subdomain: string): void {
    this.pendingEndpoints = this.pendingEndpoints.filter(e => e.subdomain !== subdomain);
    this.send({ action: 'unregister', subdomain });
  }

  createSample(): void {
    this.registerWebhook(this.randomSubdomain());
  }

  checkSubdomain(subdomain: string): Promise<boolean> {
    this.connect();
    return new Promise((resolve) => {
      this.checkCallbacks.set(subdomain, resolve);
      this.send({ action: 'check', subdomain });
      setTimeout(() => {
        if (this.checkCallbacks.has(subdomain)) {
          this.checkCallbacks.delete(subdomain);
          resolve(false);
        }
      }, 5000);
    });
  }

  clearRequests(subdomain?: string): void {
    if (subdomain) {
      this.requests.update(rs => rs.filter(r => r.subdomain !== subdomain));
    } else {
      this.requests.set([]);
    }
  }

  private randomSubdomain(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return `wh-${s}`;
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
          break;
        case 'registered':
          this.endpoints.update(eps =>
            eps.some(e => e.subdomain === message.subdomain)
              ? eps
              : [...eps, { subdomain: message.subdomain, url: message.url }]
          );
          break;
        case 'unregistered':
          this.endpoints.update(eps => eps.filter(e => e.subdomain !== message.subdomain));
          break;
        case 'check_result': {
          const cb = this.checkCallbacks.get(message.subdomain);
          if (cb) {
            cb(message.available);
            this.checkCallbacks.delete(message.subdomain);
          }
          break;
        }
        case 'webhook_request':
          this.handleWebhookRequest(message);
          break;
        case 'pong':
          break;
        case 'error':
          console.error('[Webhook] Server error:', message.message, message.ref_action);
          break;
        default:
          console.warn('[Webhook] Unhandled message type:', message.type);
      }
    } catch {
      console.error('[Webhook] Failed to parse message:', raw);
    }
  }

  private handleWebhookRequest(msg: Record<string, unknown>): void {
    const request: IWebhookRequest = {
      id: String(msg['id']),
      subdomain: String(msg['subdomain']),
      method: String(msg['method'] ?? 'GET'),
      path: String(msg['path'] ?? '/'),
      query: (msg['query'] as Record<string, string>) ?? {},
      headers: (msg['headers'] as Record<string, string>) ?? {},
      body: String(msg['body'] ?? ''),
      remoteAddr: String(msg['remote_addr'] ?? ''),
      receivedAt: typeof msg['received_at'] === 'number' ? (msg['received_at'] as number) : Date.now(),
    };
    this.requests.update(rs => [request, ...rs].slice(0, MAX_REQUESTS));
    this.send({
      action: 'response',
      request_id: request.id,
      status_code: 200,
      resp_headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
      },
      resp_body: '{"ok":true}',
    });
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => this.send({ action: 'ping' }), 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.connectionState.set('disconnected');
      this.pendingEndpoints = [];
      return;
    }
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.ngZone.run(() => this.connect());
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private reregisterEndpoints(): void {
    if (this.pendingEndpoints.length === 0) return;
    const pending = this.pendingEndpoints;
    this.pendingEndpoints = [];
    for (const ep of pending) {
      this.send({ action: 'register', subdomain: ep.subdomain });
    }
  }
}
