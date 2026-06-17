import { Component, inject, signal, computed } from '@angular/core';
import {
  ButtonComponent,
  InputComponent,
  SelectComponent,
  OptionComponent,
  TooltipDirective,
  SplitComponent,
  SplitPaneComponent,
  TabsComponent,
  TabComponent,
  JsonTreeComponent,
  ToastService,
} from '@m1z23r/ngx-ui';
import { WebhookService } from '../../core/services/webhook.service';

@Component({
  selector: 'app-webhook-tab-content',
  imports: [
    ButtonComponent,
    InputComponent,
    SelectComponent,
    OptionComponent,
    TooltipDirective,
    SplitComponent,
    SplitPaneComponent,
    TabsComponent,
    TabComponent,
    JsonTreeComponent,
  ],
  template: `
    <div class="webhook-tab">
      <div class="toolbar">
        <ui-button size="sm" color="primary" (clicked)="createSample()">Create sample webhook</ui-button>
        <div class="custom">
          <ui-input size="sm" placeholder="custom-subdomain" [(value)]="customSubdomain" />
          <ui-button size="sm" variant="outline" (clicked)="createCustom()" [disabled]="!canCreateCustom()">
            Create
          </ui-button>
        </div>
        @if (endpoints().length > 0) {
          <ui-select size="sm" [(value)]="selectedFilter">
            <ui-option [value]="'all'">All endpoints</ui-option>
            @for (ep of endpoints(); track ep.subdomain) {
              <ui-option [value]="ep.subdomain">{{ ep.subdomain }}</ui-option>
            }
          </ui-select>
        }
        <span class="status status--{{ webhookService.connectionState() }}"
              [uiTooltip]="webhookService.connectionState()"></span>
        <span class="spacer"></span>
        <ui-button size="sm" variant="ghost" (clicked)="clear()" [disabled]="filteredRequests().length === 0">
          Clear
        </ui-button>
      </div>

      @if (selectedEndpoint(); as ep) {
        <div class="url-bar">
          <code class="url">{{ ep.url }}</code>
          <ui-button size="sm" variant="ghost" (clicked)="copy(ep.url)" uiTooltip="Copy URL">Copy</ui-button>
        </div>
      }

      <ui-split orientation="horizontal" class="body-split">
        <ui-split-pane [size]="35" [minSize]="20" [maxSize]="60">
          <div class="req-list">
            @if (filteredRequests().length === 0) {
              <div class="empty">No requests received yet</div>
            } @else {
              @for (r of filteredRequests(); track r.id) {
                <button class="req-item" [class.active]="r.id === selectedId()" (click)="selectedId.set(r.id)">
                  <span class="method method--{{ r.method.toLowerCase() }}">{{ r.method }}</span>
                  <span class="path">{{ r.path }}</span>
                  <span class="time">{{ formatTime(r.receivedAt) }}</span>
                </button>
              }
            }
          </div>
        </ui-split-pane>
        <ui-split-pane [minSize]="30">
          @if (selectedRequest(); as req) {
            <div class="detail">
              <div class="detail-head">
                <span class="method method--{{ req.method.toLowerCase() }}">{{ req.method }}</span>
                <span class="detail-path">{{ req.path }}</span>
                <span class="detail-meta">{{ req.remoteAddr }} · {{ formatTime(req.receivedAt) }}</span>
              </div>
              <ui-tabs [activeTab]="detailTab()" (activeTabChange)="detailTab.set($any($event))" variant="underline">
                <ui-tab id="headers" label="Headers">
                  @if (entries(req.headers).length === 0) {
                    <div class="empty">No headers</div>
                  } @else {
                    <table class="kv">
                      <tbody>
                        @for (h of entries(req.headers); track h[0]) {
                          <tr><td>{{ h[0] }}</td><td>{{ h[1] }}</td></tr>
                        }
                      </tbody>
                    </table>
                  }
                </ui-tab>
                <ui-tab id="query" label="Query">
                  @if (entries(req.query).length === 0) {
                    <div class="empty">No query params</div>
                  } @else {
                    <table class="kv">
                      <tbody>
                        @for (q of entries(req.query); track q[0]) {
                          <tr><td>{{ q[0] }}</td><td>{{ q[1] }}</td></tr>
                        }
                      </tbody>
                    </table>
                  }
                </ui-tab>
                <ui-tab id="body" label="Body">
                  @if (parsedJson() !== null) {
                    <ui-json-tree [json]="parsedJson()" [expandDepth]="2" />
                  } @else if (req.body) {
                    <pre class="raw-body">{{ req.body }}</pre>
                  } @else {
                    <div class="empty">Empty body</div>
                  }
                </ui-tab>
              </ui-tabs>
            </div>
          } @else {
            <div class="empty detail-empty">Select a request to inspect</div>
          }
        </ui-split-pane>
      </ui-split>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .webhook-tab { display: flex; flex-direction: column; height: 100%; background-color: var(--ui-bg); }

    .toolbar {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--ui-border);
    }
    .toolbar .custom { display: flex; align-items: center; gap: 0.25rem; }
    .spacer { flex: 1; }

    .status { width: 0.625rem; height: 0.625rem; border-radius: 50%; background-color: var(--ui-text-disabled); }
    .status--connected { background-color: var(--ui-success); }
    .status--connecting, .status--reconnecting { background-color: var(--ui-warning); }
    .status--disconnected { background-color: var(--ui-danger); }

    .url-bar {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.5rem 0.75rem; background-color: var(--ui-bg-secondary);
      border-bottom: 1px solid var(--ui-border);
    }
    .url { font-family: monospace; font-size: var(--ui-font-sm); color: var(--ui-text); overflow-x: auto; white-space: nowrap; }

    .body-split { flex: 1; min-height: 0; }

    .req-list { height: 100%; overflow-y: auto; display: flex; flex-direction: column; }
    .req-item {
      display: flex; align-items: center; gap: 0.5rem; width: 100%; text-align: left;
      padding: 0.5rem 0.75rem; background: none; border: none; border-bottom: 1px solid var(--ui-border);
      color: var(--ui-text); cursor: pointer; font-size: var(--ui-font-sm);
    }
    .req-item:hover { background-color: var(--ui-bg-hover); }
    .req-item.active { background-color: var(--ui-option-selected-bg); }
    .req-item .path { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .req-item .time { color: var(--ui-text-muted); font-size: var(--ui-font-xs); }

    .method {
      font-weight: 700; font-size: var(--ui-font-xs); padding: 0.1rem 0.35rem;
      border-radius: var(--ui-radius-sm); background-color: var(--ui-bg-tertiary); color: var(--ui-text);
    }
    .method--get { color: var(--ui-success); }
    .method--post { color: var(--ui-info); }
    .method--put, .method--patch { color: var(--ui-warning); }
    .method--delete { color: var(--ui-danger); }

    .detail { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
    .detail-head {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--ui-border);
    }
    .detail-path { font-family: monospace; color: var(--ui-text); flex: 1; overflow: hidden; text-overflow: ellipsis; }
    .detail-meta { color: var(--ui-text-muted); font-size: var(--ui-font-xs); }

    .kv { width: 100%; border-collapse: collapse; font-size: var(--ui-font-sm); }
    .kv td { padding: 0.25rem 0.5rem; border-bottom: 1px solid var(--ui-border); vertical-align: top; }
    .kv td:first-child { color: var(--ui-text-muted); white-space: nowrap; width: 1%; }

    .raw-body { padding: 0.75rem; margin: 0; font-family: monospace; font-size: var(--ui-font-sm); white-space: pre-wrap; word-break: break-word; color: var(--ui-text); }

    .empty { padding: 1rem; color: var(--ui-text-muted); font-size: var(--ui-font-sm); }
    .detail-empty { display: flex; align-items: center; justify-content: center; height: 100%; }
  `]
})
export class WebhookTabContentComponent {
  protected webhookService = inject(WebhookService);
  private toast = inject(ToastService);

  protected endpoints = this.webhookService.endpoints;

  protected selectedFilter = signal<string>('all');
  protected selectedId = signal<string | null>(null);
  protected detailTab = signal<string>('headers');
  protected customSubdomain = signal<string>('');

  protected filteredRequests = computed(() => {
    const f = this.selectedFilter();
    const all = this.webhookService.requests();
    return f === 'all' ? all : all.filter(r => r.subdomain === f);
  });

  protected selectedEndpoint = computed(() => {
    const f = this.selectedFilter();
    const eps = this.endpoints();
    if (f !== 'all') return eps.find(e => e.subdomain === f) ?? null;
    return eps[0] ?? null;
  });

  protected selectedRequest = computed(() =>
    this.filteredRequests().find(r => r.id === this.selectedId()) ?? null
  );

  protected canCreateCustom = computed(() => /^[a-z0-9-]{3,63}$/.test(this.customSubdomain().trim()));

  protected parsedJson = computed<unknown>(() => {
    const req = this.selectedRequest();
    if (!req || !req.body) return null;
    const ct = this.headerValue(req.headers, 'content-type');
    const body = req.body.trim();
    const looksJson = ct.includes('application/json') || body.startsWith('{') || body.startsWith('[');
    if (!looksJson) return null;
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  });

  protected createSample(): void {
    this.webhookService.createSample();
  }

  protected async createCustom(): Promise<void> {
    const s = this.customSubdomain().trim();
    if (!this.canCreateCustom()) return;
    const available = await this.webhookService.checkSubdomain(s);
    if (!available) {
      this.toast.error('Subdomain not available');
      return;
    }
    this.webhookService.registerWebhook(s);
    this.customSubdomain.set('');
  }

  protected clear(): void {
    const f = this.selectedFilter();
    this.webhookService.clearRequests(f === 'all' ? undefined : f);
    this.selectedId.set(null);
  }

  protected copy(text: string): void {
    navigator.clipboard?.writeText(text);
    this.toast.success('Copied URL');
  }

  protected entries(obj: Record<string, string>): [string, string][] {
    return Object.entries(obj ?? {});
  }

  protected formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString();
  }

  private headerValue(headers: Record<string, string>, key: string): string {
    const found = Object.entries(headers ?? {}).find(([k]) => k.toLowerCase() === key);
    return (found?.[1] ?? '').toLowerCase();
  }
}
