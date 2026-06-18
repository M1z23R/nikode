# Webhooks (webhook.site-style) — Design

**Date:** 2026-06-18
**Status:** Approved (pending spec review)

## Summary

Add a **Webhooks** feature to Nikode, modeled on the existing **Tunnels** feature. A
webhook is a public URL that captures every incoming HTTP request and displays it
(method, path, query, headers, body) so the user can inspect requests — like
webhook.site. Unlike tunnels, requests are **not forwarded to localhost**; Nikode itself
captures each request and replies with a fixed `200 OK`.

The feature surfaces as a **tab** in the main editor area (not a modal) for more space,
opened from a new **Webhooks** button in the footer next to the tunnels button. The tab
is closable but **retains all state when closed** (state lives in a root service; the tab
is only a view).

## Decisions (locked)

| Decision | Choice |
|---|---|
| Backend | Dedicated webhook WS endpoint (separate from tunnels) |
| Transport | WebSocket, mirroring the tunnel connection pattern |
| Protocol | Designed here (mirrors tunnels); backend implemented to match |
| Response to caller | Fixed `200 OK` + `{"ok":true}` + permissive CORS (client-sent) |
| Request history | In-memory only; cleared on app restart; "Clear" button |
| Subdomain creation | Instant random ("sample") + optional custom with availability check |
| UI surface | Tab (singleton), not modal |
| Body rendering | `ui-json-tree` for JSON, `<pre>` otherwise |
| ngx-ui version | Upgrade `^1.1.43` → `^1.1.55` (json-tree requires it) |

## Architecture

### WebhookService (new, `providedIn: 'root'`)

A root singleton that owns its own WebSocket connection to a new endpoint, derived the
same way tunnels derive theirs:

```
wss://nikode.dimitrije.dev/api/v1/webhook   // environment.wsBaseUrl.replace('/sync', '/webhook')
```

It copies the proven mechanics from `TunnelService`:

- `connect()` / `disconnect()` with auth token in query string.
- Reconnect with exponential backoff (base 1s, max 30s, max 10 attempts).
- 30s ping keepalive.
- Re-register endpoints after reconnect (`pendingEndpoints`).
- Clear all state on `authService.onLogout(...)`.

Tunnel code is **not modified** — webhook logic is fully isolated to lower risk.

#### State (signals)

```ts
readonly endpoints = signal<IWebhookEndpoint[]>([]);      // registered webhooks
readonly requests  = signal<IWebhookRequest[]>([]);       // received, newest first, capped at 500
readonly connectionState = signal<WebhookConnectionState>('disconnected');
readonly hasWebhooks = computed(() => endpoints().length > 0 || pendingEndpoints.length > 0);
readonly isConnected = computed(() => connectionState() === 'connected');
```

#### Interfaces (inlined in the service, matching tunnel style; `I` prefix per convention)

```ts
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
  receivedAt: number;       // epoch ms, stamped client-side from message or on receipt
}

export type WebhookConnectionState =
  | 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
```

#### Public methods

- `connect()` / `disconnect()`
- `registerWebhook(subdomain: string): void`
- `unregisterWebhook(subdomain: string): void`
- `checkSubdomain(subdomain: string): Promise<boolean>` (5s timeout, mirrors tunnel)
- `createSample(): void` — generates a random subdomain, connects if needed, registers
- `clearRequests(subdomain?: string): void` — clear all, or just one endpoint's
- `openTab(): void` — opens/activates the singleton webhooks tab via `TabsService`

#### Behaviour on incoming request

On `webhook_request`:
1. Build an `IWebhookRequest`, prepend to `requests` (newest first), cap to last 500.
2. Immediately send a response back so the caller gets `200`:
   ```ts
   send({
     action: 'response',
     request_id: msg.id,
     status_code: 200,
     resp_headers: {
       'content-type': 'application/json',
       'access-control-allow-origin': '*',
     },
     resp_body: '{"ok":true}',
   });
   ```
   Keeping the response client-side (even though fixed) means per-webhook configurable
   responses later are a pure client change.

#### Lifecycle / "retain when closed"

- All state lives in the service. Closing the tab is **view-only** — it does **not**
  disconnect, unregister, or clear requests. The WS stays open so requests keep arriving.
- `openTab()` checks for an existing tab id (`'webhooks'`) and activates it if present,
  otherwise opens a new one. `afterClosed()` does nothing destructive.
- Connection is established lazily on first `createSample()` / `registerWebhook()` /
  `openTab()` when there are endpoints to restore.

## WebSocket protocol (contract for backend)

Endpoint: `wss://.../api/v1/webhook?token=<JWT>`. JSON text frames.

### Client → server (`action`)

| action | fields | meaning |
|---|---|---|
| `register` | `subdomain` | claim a webhook subdomain |
| `unregister` | `subdomain` | release it |
| `check` | `subdomain` | availability check |
| `ping` | — | keepalive |
| `response` | `request_id`, `status_code`, `resp_headers`, `resp_body` | reply to a captured request |

Note: no `local_port` (webhooks are not forwarded).

### Server → client (`type`)

| type | fields | meaning |
|---|---|---|
| `connected` | — | connection established |
| `registered` | `subdomain`, `url` | subdomain claimed; `url` is the public webhook URL |
| `unregistered` | `subdomain` | released |
| `check_result` | `subdomain`, `available` | availability answer |
| `webhook_request` | `id`, `subdomain`, `method`, `path`, `query`, `headers`, `body`, `remote_addr`, `received_at` | an HTTP request hit the webhook URL |
| `pong` | — | keepalive ack |
| `error` | `message`, `ref_action` | error for a prior action |

Backend flow for an incoming HTTP request: receive request → emit `webhook_request` to the
owning client → wait for the client's `response` → reply to the original caller with that
status/headers/body. (Same request/response correlation as tunnels, keyed by `id` /
`request_id`.)

## UI

### Footer button (modify `features/footer/footer.component.ts`)

A new `ui-button variant="ghost" size="sm"` beside the tunnels button:
- Webhook icon; `class.webhook-active` bound to `webhookService.hasWebhooks()`.
- `uiTooltip` summarizing connection state / endpoint count.
- `(clicked)="openWebhooks()"` → `webhookService.openTab()`.

### Webhook tab (new `features/webhook/webhook-tab-content.component.ts`)

Opened via `tabsService.open<WebhookTabContentComponent, void, void>(...)` with
`{ id: 'webhooks', label: 'Webhooks', closable: true, activate: true }`.

Layout:

- **Top bar:**
  - `ui-select` to pick the active endpoint (or "All") — filters the request list.
  - **Create sample webhook** `ui-button` (instant random subdomain).
  - Custom-subdomain `ui-input` + **Create** button, with availability validation
    (3–63 chars, `[a-z0-9-]`, via `checkSubdomain`).
  - Copy-URL button for the selected endpoint.
  - Connection-status dot (connected / reconnecting / disconnected).
  - **Clear** button (`clearRequests`).
- **Master–detail body** (`ui-split` horizontal):
  - **Left pane:** scrollable list of received requests — method badge (color by verb),
    path, relative time. Click selects. Empty state when none.
  - **Right pane:** details of the selected request:
    - Header line: method + full path + timestamp + remote address + copy buttons.
    - `ui-tabs`: **Headers** / **Query** / **Body**.
      - Headers & Query: simple key/value tables.
      - Body: if `content-type` is `application/json` (or body parses as JSON),
        `<ui-json-tree [json]="parsedBody()" [expandDepth]="2" />`; otherwise a
        monospace `<pre>`.
    - Empty state when no request selected.

State for selection (selected request id, endpoint filter) is local to the component;
the underlying data is read from `WebhookService` signals.

## Files

**New**
- `src/app/core/services/webhook.service.ts`
- `src/app/features/webhook/webhook-tab-content.component.ts`

**Modified**
- `src/app/features/footer/footer.component.ts` — webhooks button + `openWebhooks()`.
- `package.json` — `@m1z23r/ngx-ui` `^1.1.43` → `^1.1.55`.

## Testing

Vitest unit tests for `WebhookService` (mock `WebSocket`):
- `registered` adds an endpoint; `unregistered` removes it.
- `webhook_request` prepends to `requests`, stamps `receivedAt`, and emits a `200`
  `response` with the matching `request_id`.
- Request list is capped at 500 (oldest dropped).
- `checkSubdomain` resolves on `check_result` and times out to `false`.
- Reconnect re-registers pending endpoints.
- Logout clears endpoints + requests and disconnects.

## Out of scope (v1)

- Configurable per-webhook responses (status/headers/body) — protocol already supports it
  client-side; UI deferred.
- Persisting requests across restarts (in-memory only by decision).
- Request search/filtering beyond endpoint selection.
- Replaying a captured request into the request editor.
