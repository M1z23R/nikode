import { Component, inject, signal, computed, model, OnInit, OnDestroy } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  DIALOG_REF,
  DialogRef,
  TooltipDirective,
} from '@m1z23r/ngx-ui';
import { TunnelService, TunnelConfig } from '../../core/services/tunnel.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-tunnel-dialog',
  imports: [ModalComponent, ButtonComponent, InputComponent, TooltipDirective],
  template: `
    <ui-modal title="Webhook Tunnels" size="md">
      <div class="tunnel-content">
        @if (!authService.isAuthenticated()) {
          <div class="warning-banner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>You must be logged in to use webhook tunnels.</span>
          </div>
        } @else if (tunnelService.connectionState() === 'connecting') {
          <div class="connecting-state">
            <svg class="spinning" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            <span>Connecting to tunnel service...</span>
          </div>
        } @else if (tunnelService.connectionState() === 'disconnected') {
          <div class="disconnected-state">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
            <p>Connection failed</p>
            <ui-button variant="default" size="sm" (clicked)="tunnelService.connect()">Retry</ui-button>
          </div>
        } @else {
          <div class="new-tunnel-form">
            <div class="form-row">
              <div class="subdomain-input">
                <ui-input
                  placeholder="subdomain"
                  [(value)]="subdomain"
                  size="sm"
                  [disabled]="isCreating()"
                />
                <span class="domain-suffix">.webhooks.nikode.dimitrije.dev</span>
              </div>
              <ui-input
                type="number"
                placeholder="Port"
                [(value)]="port"
                size="sm"
                class="port-input"
                [disabled]="isCreating()"
              />
              <ui-button
                variant="default"
                (clicked)="createTunnel()"
                [disabled]="!canCreate() || isCreating()">
                @if (isCreating()) {
                  Creating...
                } @else {
                  Start
                }
              </ui-button>
            </div>
            @if (error()) {
              <div class="error-message">{{ error() }}</div>
            }
          </div>

          @if (tunnelService.activeTunnels().length === 0) {
            <div class="empty-state">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
              <p>No active tunnels</p>
              <span>Create a tunnel to expose a local server via a public URL</span>
            </div>
          } @else {
            <div class="tunnels-list">
              @for (tunnel of tunnelService.activeTunnels(); track tunnel.subdomain) {
                <div class="tunnel-item">
                  <div class="tunnel-info">
                    <div class="tunnel-url">
                      <span class="url-text">{{ tunnel.url }}</span>
                      <button class="copy-btn" (click)="copyUrl(tunnel.url)" uiTooltip="Copy URL">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <rect x="9" y="9" width="13" height="13" rx="2"/>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                      </button>
                    </div>
                    <div class="tunnel-meta">
                      <span class="status-dot"></span>
                      <span>localhost:{{ tunnel.localPort }}</span>
                    </div>
                  </div>
                  <ui-button
                    variant="ghost"
                    size="sm"
                    color="danger"
                    (clicked)="stopTunnel(tunnel.subdomain)">
                    Stop
                  </ui-button>
                </div>
              }
            </div>
          }
        }
      </div>

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="close()">Close</ui-button>
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .tunnel-content {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      min-height: 200px;
    }

    .warning-banner {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      background-color: var(--ui-warning-bg, rgba(245, 158, 11, 0.1));
      border: 1px solid var(--ui-warning, #f59e0b);
      border-radius: 6px;
      color: var(--ui-warning, #f59e0b);
      font-size: 0.875rem;
    }

    .connecting-state,
    .disconnected-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      gap: 0.75rem;
      color: var(--ui-text-muted);
    }

    .connecting-state span,
    .disconnected-state p {
      margin: 0;
      font-size: 0.875rem;
    }

    .disconnected-state p {
      color: var(--ui-text);
      font-weight: 500;
    }

    .spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .new-tunnel-form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .form-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .subdomain-input {
      display: flex;
      align-items: stretch;
      flex: 1;
      gap: 0;
    }

    .subdomain-input ui-input {
      flex: 1;
    }

    .subdomain-input ui-input ::ng-deep input {
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }

    .domain-suffix {
      display: flex;
      align-items: center;
      padding: 0 0.5rem;
      background-color: var(--ui-bg-secondary);
      border: 1px solid var(--ui-border);
      border-left: none;
      border-radius: 0 4px 4px 0;
      font-size: 0.75rem;
      color: var(--ui-text-muted);
      white-space: nowrap;
    }

    .port-input {
      width: 80px;
    }

    .error-message {
      color: var(--ui-danger, #ef4444);
      font-size: 0.8125rem;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      text-align: center;
      color: var(--ui-text-muted);
    }

    .empty-state svg {
      margin-bottom: 0.5rem;
      opacity: 0.5;
    }

    .empty-state p {
      margin: 0;
      font-weight: 500;
      color: var(--ui-text);
    }

    .empty-state span {
      font-size: 0.8125rem;
    }

    .tunnels-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .tunnel-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem;
      background-color: var(--ui-bg-secondary);
      border-radius: 6px;
    }

    .tunnel-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
    }

    .tunnel-url {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .url-text {
      font-family: monospace;
      font-size: 0.8125rem;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .copy-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 0;
      background: none;
      border: none;
      border-radius: 4px;
      color: var(--ui-text-muted);
      cursor: pointer;
      transition: background-color 0.15s, color 0.15s;
    }

    .copy-btn:hover {
      background-color: var(--ui-bg-hover);
      color: var(--ui-text);
    }

    .tunnel-meta {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.75rem;
      color: var(--ui-text-muted);
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--ui-success, #22c55e);
    }
  `]
})
export class TunnelDialogComponent implements OnInit, OnDestroy {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<void>;
  protected tunnelService = inject(TunnelService);
  protected authService = inject(AuthService);

  protected subdomain = model('');
  protected port = model('');
  protected error = signal<string | null>(null);
  protected isCreating = signal(false);

  protected canCreate = computed(() => {
    const sub = this.subdomain().trim();
    const p = parseInt(this.port(), 10);
    return sub.length >= 3 && sub.length <= 63 && !isNaN(p) && p >= 1 && p <= 65535;
  });

  ngOnInit(): void {
    // Connect when dialog opens
    if (this.authService.isAuthenticated()) {
      this.tunnelService.connect();
    }
  }

  ngOnDestroy(): void {
    // Disconnect when dialog closes if no active tunnels
    if (this.tunnelService.activeTunnels().length === 0) {
      this.tunnelService.disconnect();
    }
  }

  protected async createTunnel(): Promise<void> {
    const sub = this.subdomain().trim().toLowerCase();
    const p = parseInt(this.port(), 10);

    // Validate subdomain format
    if (!this.isValidSubdomain(sub)) {
      this.error.set('Subdomain must be 3-63 characters, alphanumeric and hyphens only, not starting/ending with hyphen');
      return;
    }

    // Check if already exists locally
    if (this.tunnelService.activeTunnels().some(t => t.subdomain === sub)) {
      this.error.set('You already have a tunnel with this subdomain');
      return;
    }

    this.error.set(null);
    this.isCreating.set(true);

    try {
      // Check availability
      const available = await this.tunnelService.checkSubdomain(sub);
      if (!available) {
        this.error.set('Subdomain is already in use');
        return;
      }

      // Register tunnel
      this.tunnelService.registerTunnel(sub, p);

      // Clear form
      this.subdomain.set('');
      this.port.set('');
    } finally {
      this.isCreating.set(false);
    }
  }

  protected stopTunnel(subdomain: string): void {
    this.tunnelService.unregisterTunnel(subdomain);
  }

  protected copyUrl(url: string): void {
    navigator.clipboard.writeText(url);
  }

  protected close(): void {
    this.dialogRef.close();
  }

  private isValidSubdomain(s: string): boolean {
    if (s.length < 3 || s.length > 63) return false;
    if (s[0] === '-' || s[s.length - 1] === '-') return false;
    return /^[a-z0-9-]+$/.test(s);
  }
}
