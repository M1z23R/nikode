import { Injectable, inject, signal, computed, NgZone } from '@angular/core';
import { TabsService } from '@m1z23r/ngx-ui';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';
import { WebhookTabContentComponent } from '../../features/webhook/webhook-tab-content.component';

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
const WEBHOOK_TAB_ID = 'webhooks';

@Injectable({ providedIn: 'root' })
export class WebhookService {
  private ngZone = inject(NgZone);
  private authService = inject(AuthService);
  private tabsService = inject(TabsService);

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

  clearRequests(subdomain?: string): void {
    if (subdomain) {
      this.requests.update(rs => rs.filter(r => r.subdomain !== subdomain));
    } else {
      this.requests.set([]);
    }
  }

  openTab(): void {
    if (this.tabsService.getTab(WEBHOOK_TAB_ID)) {
      this.tabsService.activateById(WEBHOOK_TAB_ID);
      return;
    }
    if (this.endpoints().length === 0 && this.pendingEndpoints.length === 0) {
      this.connect();
    }
    this.tabsService.open<WebhookTabContentComponent, void, void>(
      WebhookTabContentComponent,
      { id: WEBHOOK_TAB_ID, label: 'Webhooks', closable: true, activate: true }
    );
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
    const rawPath = String(msg['path'] ?? '/');
    const queryIndex = rawPath.indexOf('?');
    const path = queryIndex >= 0 ? rawPath.slice(0, queryIndex) : rawPath;

    let query = (msg['query'] as Record<string, string>) ?? {};
    if (Object.keys(query).length === 0 && queryIndex >= 0) {
      query = {};
      new URLSearchParams(rawPath.slice(queryIndex + 1)).forEach((value, key) => {
        query[key] = value;
      });
    }

    const request: IWebhookRequest = {
      id: String(msg['id']),
      subdomain: String(msg['subdomain']),
      method: String(msg['method'] ?? 'GET'),
      path,
      query,
      headers: (msg['headers'] as Record<string, string>) ?? {},
      body: this.decodeBody(String(msg['body'] ?? '')),
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

  private decodeBody(raw: string): string {
    if (!raw) return '';
    try {
      const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch {
      return raw;
    }
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
