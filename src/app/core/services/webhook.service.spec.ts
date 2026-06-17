import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { WebhookService } from './webhook.service';
import { AuthService } from './auth.service';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = MockWebSocket.CLOSED; this.onclose?.(); }
  simulateOpen() { this.readyState = MockWebSocket.OPEN; this.onopen?.(); }
  simulateMessage(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }); }
  lastSent() { return this.sent.length ? JSON.parse(this.sent[this.sent.length - 1]) : null; }
}

let logoutCb: (() => void) | null = null;
const mockAuth = {
  getAccessToken: () => 'test-token',
  onLogout: (cb: () => void) => { logoutCb = cb; },
};

function setup(): { service: WebhookService } {
  TestBed.configureTestingModule({
    providers: [
      WebhookService,
      { provide: AuthService, useValue: mockAuth },
    ],
  });
  return { service: TestBed.inject(WebhookService) };
}

describe('WebhookService — connection & registration', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    logoutCb = null;
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('connects to the webhook endpoint derived from wsBaseUrl', () => {
    const { service } = setup();
    service.connect();
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toContain('/webhook?token=test-token');
    expect(service.connectionState()).toBe('connecting');
  });

  it('sets connected state on open', () => {
    const { service } = setup();
    service.connect();
    MockWebSocket.instances[0].simulateOpen();
    expect(service.connectionState()).toBe('connected');
  });

  it('registers a webhook and adds the endpoint on "registered"', () => {
    const { service } = setup();
    service.registerWebhook('wh-abc');
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    expect(JSON.parse(ws.sent[0])).toMatchObject({ action: 'register', subdomain: 'wh-abc' });
    ws.simulateMessage({ type: 'registered', subdomain: 'wh-abc', url: 'https://wh-abc.dev' });
    expect(service.endpoints()).toEqual([{ subdomain: 'wh-abc', url: 'https://wh-abc.dev' }]);
    expect(service.hasWebhooks()).toBe(true);
  });

  it('removes an endpoint on "unregistered"', () => {
    const { service } = setup();
    service.registerWebhook('wh-abc');
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage({ type: 'registered', subdomain: 'wh-abc', url: 'https://wh-abc.dev' });
    service.unregisterWebhook('wh-abc');
    ws.simulateMessage({ type: 'unregistered', subdomain: 'wh-abc' });
    expect(service.endpoints()).toEqual([]);
  });

  it('resolves checkSubdomain on check_result', async () => {
    const { service } = setup();
    service.connect();
    MockWebSocket.instances[0].simulateOpen();
    const p = service.checkSubdomain('wh-x');
    MockWebSocket.instances[0].simulateMessage({ type: 'check_result', subdomain: 'wh-x', available: true });
    await expect(p).resolves.toBe(true);
  });
});

describe('WebhookService — request capture', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    logoutCb = null;
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  function connected(): { service: WebhookService; ws: MockWebSocket } {
    const { service } = setup();
    service.registerWebhook('wh-abc');
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage({ type: 'registered', subdomain: 'wh-abc', url: 'https://wh-abc.dev' });
    return { service, ws };
  }

  it('stores an incoming request newest-first', () => {
    const { service, ws } = connected();
    ws.simulateMessage({
      type: 'webhook_request', id: 'r1', subdomain: 'wh-abc',
      method: 'POST', path: '/hook', query: { a: '1' },
      headers: { 'content-type': 'application/json' }, body: '{"x":1}',
      remote_addr: '1.2.3.4', received_at: 1000,
    });
    expect(service.requests().length).toBe(1);
    expect(service.requests()[0]).toMatchObject({
      id: 'r1', method: 'POST', path: '/hook', remoteAddr: '1.2.3.4', receivedAt: 1000,
    });
  });

  it('auto-replies 200 to each captured request', () => {
    const { ws } = connected();
    ws.simulateMessage({ type: 'webhook_request', id: 'r9', subdomain: 'wh-abc', method: 'GET', path: '/' });
    expect(ws.lastSent()).toMatchObject({ action: 'response', request_id: 'r9', status_code: 200 });
  });

  it('caps the request list at 500', () => {
    const { service, ws } = connected();
    for (let i = 0; i < 510; i++) {
      ws.simulateMessage({ type: 'webhook_request', id: 'r' + i, subdomain: 'wh-abc', method: 'GET', path: '/' + i });
    }
    expect(service.requests().length).toBe(500);
    expect(service.requests()[0].id).toBe('r509');
  });

  it('clearRequests() empties all', () => {
    const { service, ws } = connected();
    ws.simulateMessage({ type: 'webhook_request', id: 'r1', subdomain: 'wh-abc', method: 'GET', path: '/' });
    service.clearRequests();
    expect(service.requests()).toEqual([]);
  });

  it('createSample registers a wh- prefixed subdomain', () => {
    const { service } = setup();
    service.createSample();
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    expect(JSON.parse(ws.sent[0]).subdomain).toMatch(/^wh-[a-z0-9]{8}$/);
  });
});

describe('WebhookService — reconnect & logout', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    logoutCb = null;
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('re-registers endpoints after an unexpected close', () => {
    const { service } = setup();
    service.registerWebhook('wh-abc');
    const ws1 = MockWebSocket.instances[0];
    ws1.simulateOpen();
    ws1.simulateMessage({ type: 'registered', subdomain: 'wh-abc', url: 'https://wh-abc.dev' });

    ws1.readyState = MockWebSocket.CLOSED;
    ws1.onclose?.();
    expect(service.connectionState()).toBe('reconnecting');

    vi.runOnlyPendingTimers();
    const ws2 = MockWebSocket.instances[1];
    expect(ws2).toBeDefined();
    ws2.simulateOpen();
    expect(JSON.parse(ws2.sent[0])).toMatchObject({ action: 'register', subdomain: 'wh-abc' });
  });

  it('clears all state on logout', () => {
    const { service } = setup();
    service.registerWebhook('wh-abc');
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage({ type: 'registered', subdomain: 'wh-abc', url: 'https://wh-abc.dev' });
    ws.simulateMessage({ type: 'webhook_request', id: 'r1', subdomain: 'wh-abc', method: 'GET', path: '/' });

    expect(logoutCb).toBeTypeOf('function');
    logoutCb!();

    expect(service.endpoints()).toEqual([]);
    expect(service.requests()).toEqual([]);
    expect(service.connectionState()).toBe('disconnected');
  });
});
