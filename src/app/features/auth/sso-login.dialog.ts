import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  SpinnerComponent,
  DIALOG_DATA,
  DIALOG_REF,
  DialogRef,
  ToastService,
} from '@m1z23r/ngx-ui';
import { AuthService } from '../../core/services/auth.service';
import { AuthProvider } from '../../core/models/auth.model';

export interface SsoLoginDialogData {
  provider: AuthProvider;
}

@Component({
  selector: 'app-sso-login-dialog',
  imports: [ModalComponent, ButtonComponent, InputComponent, SpinnerComponent],
  template: `
    <ui-modal [title]="'Sign in with ' + providerName()" size="sm">
      <div class="sso-content">
        <!-- Loading state -->
        <div class="loading-section">
          <ui-spinner size="md" />
          <p class="waiting-text">Waiting for authentication...</p>
          <p class="hint-text">Complete the sign-in process in your browser</p>
        </div>

        <!-- Error message -->
        @if (error()) {
          <div class="error-message">
            {{ error() }}
          </div>
        }

        <!-- Manual options (collapsible) -->
        <div class="manual-section">
          <button class="toggle-btn" (click)="showManual.set(!showManual())">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              [class.expanded]="showManual()">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            Having trouble?
          </button>

          @if (showManual()) {
            <div class="manual-content">
              <!-- Consent URL -->
              <div class="url-section">
                <label>Authorization URL</label>
                <div class="url-row">
                  <input
                    type="text"
                    readonly
                    [value]="consentUrl()"
                    class="url-input"
                    #urlInput />
                  <ui-button variant="ghost" size="sm" (clicked)="copyUrl(urlInput)">
                    Copy
                  </ui-button>
                </div>
                <p class="help-text">If the browser didn't open, copy this URL and open it manually.</p>
              </div>

              <!-- Manual code entry -->
              <div class="code-section">
                <ui-input
                  label="Authorization Code"
                  placeholder="Paste the code from the browser"
                  [(value)]="manualCode"
                  (keydown.enter)="submitCode()" />
                <p class="help-text">After authorizing, you may receive a code to paste here.</p>
                <ui-button
                  color="primary"
                  size="sm"
                  [disabled]="!manualCode().trim() || submitting()"
                  (clicked)="submitCode()">
                  @if (submitting()) {
                    <ui-spinner size="sm" />
                  }
                  Submit Code
                </ui-button>
              </div>
            </div>
          }
        </div>
      </div>

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="cancel()">Cancel</ui-button>
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .sso-content {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .loading-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      padding: 1.5rem 0;
    }

    .waiting-text {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 500;
      color: var(--ui-text);
    }

    .hint-text {
      margin: 0;
      font-size: 0.8125rem;
      color: var(--ui-text-muted);
    }

    .error-message {
      padding: 0.75rem;
      background: #ffebee;
      color: #c62828;
      border-radius: 6px;
      font-size: 0.875rem;
    }

    .manual-section {
      border-top: 1px solid var(--ui-border);
      padding-top: 1rem;
    }

    .toggle-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: none;
      border: none;
      color: var(--ui-text-muted);
      font-size: 0.8125rem;
      cursor: pointer;
      padding: 0;

      &:hover {
        color: var(--ui-text);
      }

      svg {
        transition: transform 0.2s ease;

        &.expanded {
          transform: rotate(180deg);
        }
      }
    }

    .manual-content {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      margin-top: 1rem;
      padding: 1rem;
      background: var(--ui-bg-secondary);
      border-radius: 6px;
    }

    .url-section,
    .code-section {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      label {
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--ui-text);
      }
    }

    .url-row {
      display: flex;
      gap: 0.5rem;
    }

    .url-input {
      flex: 1;
      padding: 0.5rem 0.75rem;
      font-size: 0.75rem;
      font-family: monospace;
      background: var(--ui-bg);
      border: 1px solid var(--ui-border);
      border-radius: 4px;
      color: var(--ui-text);
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .help-text {
      margin: 0;
      font-size: 0.75rem;
      color: var(--ui-text-muted);
    }

    .code-section ui-button {
      align-self: flex-start;
      margin-top: 0.25rem;
    }
  `]
})
export class SsoLoginDialogComponent implements OnInit, OnDestroy {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<boolean>;
  readonly data = inject(DIALOG_DATA) as SsoLoginDialogData;
  readonly authService = inject(AuthService);
  private toastService = inject(ToastService);

  consentUrl = signal('');
  error = signal<string | null>(null);
  showManual = signal(false);
  manualCode = signal('');
  submitting = signal(false);

  private unsubscribe: (() => void) | null = null;

  providerName(): string {
    const names: Record<AuthProvider, string> = {
      github: 'GitHub',
      gitlab: 'GitLab',
      google: 'Google',
    };
    return names[this.data.provider];
  }

  async ngOnInit(): Promise<void> {
    // Subscribe to auth state changes
    this.unsubscribe = this.authService.onAuthStateChange((authenticated, error) => {
      if (authenticated) {
        this.dialogRef.close(true);
      } else if (error) {
        this.error.set(error);
      }
    });

    // Start the login flow
    try {
      const url = await this.authService.startLogin(this.data.provider);
      this.consentUrl.set(url);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to start login');
    }
  }

  ngOnDestroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    // Cancel the SSO flow if dialog is closed without completing
    if (!this.authService.isAuthenticated()) {
      this.authService.cancelLogin();
    }
  }

  copyUrl(input: HTMLInputElement): void {
    input.select();
    navigator.clipboard.writeText(input.value);
    this.toastService.success('URL copied to clipboard');
  }

  async submitCode(): Promise<void> {
    const code = this.manualCode().trim();
    if (!code) return;

    this.submitting.set(true);
    this.error.set(null);

    try {
      await this.authService.exchangeCode(this.data.provider, code);
      // Success will be handled by the auth state change listener
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to exchange code');
    } finally {
      this.submitting.set(false);
    }
  }

  cancel(): void {
    this.authService.cancelLogin();
    this.dialogRef.close(false);
  }
}
