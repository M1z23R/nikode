import { Component, input, inject, output, computed } from '@angular/core';
import { RadioGroupComponent, RadioComponent, SelectComponent, OptionComponent, ButtonComponent, CheckboxComponent, ToastService } from '@m1z23r/ngx-ui';
import { RequestAuth, RequestAuthType, OAuth2GrantType, ApiKeyLocation, Environment } from '../../../core/models/collection.model';
import { EnvironmentService } from '../../../core/services/environment.service';
import { ApiService } from '../../../core/services/api.service';
import { resolveVariables } from '../../../core/utils/variable-resolver';
import { isIpcError } from '@shared/ipc-types';
import { TemplateInputWrapperComponent } from '../../../shared/components/template-input-wrapper.component';

/**
 * Presentational auth form. Renders the type selector + per-type fields and
 * emits a new RequestAuth on every change. Used by:
 * - the request auth panel (allowInherit = true; saves on the open request)
 * - the collection auth dialog (allowInherit = false; saves on the collection)
 * - the folder auth dialog (allowInherit = true; saves on the folder)
 *
 * The component owns no persistence; the parent decides where the emitted
 * auth lands (request / folder / collection).
 */
@Component({
  selector: 'app-auth-form',
  imports: [
    RadioGroupComponent,
    RadioComponent,
    SelectComponent,
    OptionComponent,
    ButtonComponent,
    CheckboxComponent,
    TemplateInputWrapperComponent
  ],
  template: `
    <div class="auth-form-root">
      <ui-radio-group
        [value]="auth().type"
        (valueChange)="onTypeChange($event?.toString() || 'none')"
        orientation="horizontal"
        variant="segmented">
        @if (allowInherit()) {
          <ui-radio value="inherit">Inherit</ui-radio>
        }
        <ui-radio value="none">None</ui-radio>
        <ui-radio value="basic">Basic</ui-radio>
        <ui-radio value="bearer">Bearer</ui-radio>
        <ui-radio value="api-key">API Key</ui-radio>
        <ui-radio value="oauth2">OAuth 2.0</ui-radio>
      </ui-radio-group>

      <div class="auth-content">
        @switch (auth().type) {
          @case ('inherit') {
            <div class="info-block">
              <p>This {{ targetLabel() }} inherits authentication from a parent (folder or collection).</p>
            </div>
          }
          @case ('none') {
            <div class="info-block">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
              </svg>
              <p>No authentication will be applied.</p>
            </div>
          }
          @case ('basic') {
            <div class="auth-form">
              <div class="field">
                <label>Username</label>
                <app-template-input
                  [value]="auth().basic?.username || ''"
                  (valueChange)="onBasicChange('username', $event)"
                  [collectionPath]="collectionPath()"
                  placeholder="Username" />
              </div>
              <div class="field">
                <label>Password</label>
                <app-template-input
                  [value]="auth().basic?.password || ''"
                  (valueChange)="onBasicChange('password', $event)"
                  [collectionPath]="collectionPath()"
                  placeholder="Password" />
              </div>
            </div>
          }
          @case ('bearer') {
            <div class="auth-form">
              <div class="field">
                <label>Token</label>
                <app-template-input
                  [value]="auth().bearer?.token || ''"
                  (valueChange)="onBearerChange('token', $event)"
                  [collectionPath]="collectionPath()"
                  placeholder="Token" />
              </div>
              <div class="field">
                <label>Prefix</label>
                <app-template-input
                  [value]="auth().bearer?.prefix ?? 'Bearer'"
                  (valueChange)="onBearerChange('prefix', $event)"
                  [collectionPath]="collectionPath()"
                  placeholder="Bearer" />
              </div>
            </div>
          }
          @case ('api-key') {
            <div class="auth-form">
              <div class="field">
                <label>Key</label>
                <app-template-input
                  [value]="auth().apiKey?.key || ''"
                  (valueChange)="onApiKeyChange('key', $event)"
                  [collectionPath]="collectionPath()"
                  placeholder="Header or param name" />
              </div>
              <div class="field">
                <label>Value</label>
                <app-template-input
                  [value]="auth().apiKey?.value || ''"
                  (valueChange)="onApiKeyChange('value', $event)"
                  [collectionPath]="collectionPath()"
                  placeholder="API key value" />
              </div>
              <div class="field">
                <label>Add To</label>
                <ui-select
                  [value]="auth().apiKey?.addTo || 'header'"
                  (valueChange)="onApiKeyChange('addTo', $event?.toString() || 'header')">
                  <ui-option value="header">Header</ui-option>
                  <ui-option value="query">Query Param</ui-option>
                </ui-select>
              </div>
            </div>
          }
          @case ('oauth2') {
            <div class="auth-form">
              <div class="field">
                <label>Grant Type</label>
                <ui-select
                  [value]="auth().oauth2?.grantType || 'client_credentials'"
                  (valueChange)="onOAuth2Change('grantType', $event?.toString() || 'client_credentials')">
                  <ui-option value="client_credentials">Client Credentials</ui-option>
                  <ui-option value="password">Password</ui-option>
                  <ui-option value="authorization_code">Authorization Code</ui-option>
                </ui-select>
              </div>

              @if (auth().oauth2?.grantType === 'authorization_code') {
                <div class="field">
                  <label>Auth URL</label>
                  <app-template-input
                    [value]="auth().oauth2?.authUrl || ''"
                    (valueChange)="onOAuth2Change('authUrl', $event)"
                    [collectionPath]="collectionPath()"
                    placeholder="https://example.com/oauth/authorize" />
                </div>
              }

              <div class="field">
                <label>Token URL</label>
                <app-template-input
                  [value]="auth().oauth2?.tokenUrl || ''"
                  (valueChange)="onOAuth2Change('tokenUrl', $event)"
                  [collectionPath]="collectionPath()"
                  placeholder="https://example.com/oauth/token" />
              </div>
              <div class="field">
                <label>Client ID</label>
                <app-template-input
                  [value]="auth().oauth2?.clientId || ''"
                  (valueChange)="onOAuth2Change('clientId', $event)"
                  [collectionPath]="collectionPath()"
                  placeholder="Client ID" />
              </div>
              <div class="field">
                <label>Client Secret</label>
                <app-template-input
                  [value]="auth().oauth2?.clientSecret || ''"
                  (valueChange)="onOAuth2Change('clientSecret', $event)"
                  [collectionPath]="collectionPath()"
                  placeholder="Client Secret" />
              </div>

              @if (auth().oauth2?.grantType === 'password') {
                <div class="field">
                  <label>Username</label>
                  <app-template-input
                    [value]="auth().oauth2?.username || ''"
                    (valueChange)="onOAuth2Change('username', $event)"
                    [collectionPath]="collectionPath()"
                    placeholder="Username" />
                </div>
                <div class="field">
                  <label>Password</label>
                  <app-template-input
                    [value]="auth().oauth2?.password || ''"
                    (valueChange)="onOAuth2Change('password', $event)"
                    [collectionPath]="collectionPath()"
                    placeholder="Password" />
                </div>
              }

              @if (auth().oauth2?.grantType === 'authorization_code') {
                <div class="field">
                  <label>Callback URL</label>
                  <app-template-input
                    [value]="auth().oauth2?.callbackUrl || ''"
                    (valueChange)="onOAuth2Change('callbackUrl', $event)"
                    [collectionPath]="collectionPath()"
                    placeholder="https://localhost/callback" />
                </div>
                <div class="field">
                  <ui-checkbox
                    [checked]="auth().oauth2?.usePkce !== false"
                    (checkedChange)="onOAuth2Change('usePkce', $event)">
                    Use PKCE (S256)
                  </ui-checkbox>
                </div>
              }

              <div class="field">
                <label>Scope</label>
                <app-template-input
                  [value]="auth().oauth2?.scope || ''"
                  (valueChange)="onOAuth2Change('scope', $event)"
                  [collectionPath]="collectionPath()"
                  placeholder="read write" />
              </div>

              <div class="field">
                <label>Access Token</label>
                <app-template-input
                  [value]="auth().oauth2?.accessToken || ''"
                  (valueChange)="onOAuth2Change('accessToken', $event)"
                  [collectionPath]="collectionPath()"
                  placeholder="Paste or fetch a token" />
              </div>

              <div class="field">
                <ui-checkbox
                  [checked]="auth().oauth2?.saveToEnv === true"
                  (checkedChange)="onSaveToEnvToggle($event)">
                  Save access token to environment variable
                </ui-checkbox>
              </div>

              @if (auth().oauth2?.saveToEnv) {
                <div class="field">
                  <label>Environment</label>
                  <ui-select
                    [value]="auth().oauth2?.saveToEnvId || ''"
                    (valueChange)="onOAuth2Change('saveToEnvId', $event?.toString() || '')">
                    @for (env of availableEnvironments(); track env.id) {
                      <ui-option [value]="env.id">{{ env.name }}</ui-option>
                    }
                  </ui-select>
                </div>
                <div class="field">
                  <label>Variable Name</label>
                  <app-template-input
                    [value]="auth().oauth2?.saveToVarName || ''"
                    (valueChange)="onOAuth2Change('saveToVarName', $event)"
                    [collectionPath]="collectionPath()"
                    placeholder="accessToken" />
                </div>
              }

              <div class="token-actions">
                <ui-button variant="outline" size="sm" (clicked)="fetchToken()">
                  Get Token
                </ui-button>
              </div>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }

    .auth-form-root {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      min-height: 0;
      overflow: hidden;
    }

    .auth-content {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }

    .info-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      color: var(--ui-text-muted);
      font-size: 0.875rem;
      padding: 2rem 1rem;

      svg { opacity: 0.5; }
    }

    .auth-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      max-width: 480px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;

      label {
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--ui-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.025em;
      }
    }

    .token-actions {
      padding-top: 0.5rem;
    }
  `]
})
export class AuthFormComponent {
  /** Current auth value to render. */
  auth = input.required<RequestAuth>();

  /** Collection path — used for resolving template variables in inputs and the OAuth flow. */
  collectionPath = input.required<string>();

  /** Whether the "Inherit" radio is shown. False for collection-level (no parent to inherit from). */
  allowInherit = input<boolean>(false);

  /** Label used in inheritance copy ("This request/folder inherits..."). */
  targetLabel = input<string>('item');

  /** Emitted whenever any field changes. */
  authChange = output<RequestAuth>();

  private environmentService = inject(EnvironmentService);
  private apiService = inject(ApiService);
  private toastService = inject(ToastService);

  availableEnvironments = computed<Environment[]>(() =>
    this.environmentService.listEnvironments(this.collectionPath())
  );

  private emit(next: RequestAuth): void {
    this.authChange.emit(next);
  }

  onTypeChange(type: string): void {
    const current = this.auth();
    const authType = type as RequestAuthType;
    const next: RequestAuth = { ...current, type: authType };

    if (authType === 'basic' && !next.basic) {
      next.basic = { username: '', password: '' };
    } else if (authType === 'bearer' && !next.bearer) {
      next.bearer = { token: '', prefix: 'Bearer' };
    } else if (authType === 'api-key' && !next.apiKey) {
      next.apiKey = { key: '', value: '', addTo: 'header' };
    } else if (authType === 'oauth2' && !next.oauth2) {
      next.oauth2 = {
        grantType: 'client_credentials',
        accessToken: '',
        tokenUrl: '',
        authUrl: '',
        clientId: '',
        clientSecret: '',
        username: '',
        password: '',
        callbackUrl: '',
        scope: '',
        usePkce: true
      };
    }

    this.emit(next);
  }

  onBasicChange(field: 'username' | 'password', value: string): void {
    const current = this.auth();
    this.emit({
      ...current,
      basic: { ...current.basic || { username: '', password: '' }, [field]: value }
    });
  }

  onBearerChange(field: 'token' | 'prefix', value: string): void {
    const current = this.auth();
    this.emit({
      ...current,
      bearer: { ...current.bearer || { token: '', prefix: 'Bearer' }, [field]: value }
    });
  }

  onApiKeyChange(field: 'key' | 'value' | 'addTo', value: string): void {
    const current = this.auth();
    this.emit({
      ...current,
      apiKey: { ...current.apiKey || { key: '', value: '', addTo: 'header' as ApiKeyLocation }, [field]: value }
    });
  }

  onOAuth2Change(field: string, value: string | boolean): void {
    const current = this.auth();
    const defaults = {
      grantType: 'client_credentials' as OAuth2GrantType,
      accessToken: '',
      tokenUrl: '',
      authUrl: '',
      clientId: '',
      clientSecret: '',
      username: '',
      password: '',
      callbackUrl: '',
      scope: '',
      usePkce: true
    };
    this.emit({
      ...current,
      oauth2: { ...defaults, ...current.oauth2, [field]: value }
    });
  }

  onSaveToEnvToggle(checked: boolean): void {
    const current = this.auth();
    const oauth2 = current.oauth2;
    const updates: Partial<NonNullable<RequestAuth['oauth2']>> = { saveToEnv: checked };
    if (checked) {
      if (!oauth2?.saveToEnvId) {
        const activeEnv = this.environmentService.getActiveEnvironment(this.collectionPath());
        const fallbackEnv = activeEnv ?? this.availableEnvironments()[0];
        if (fallbackEnv) updates.saveToEnvId = fallbackEnv.id;
      }
      if (!oauth2?.saveToVarName) {
        updates.saveToVarName = 'accessToken';
      }
    }
    this.emit({
      ...current,
      oauth2: { ...(oauth2 as NonNullable<RequestAuth['oauth2']>), ...updates }
    });
  }

  async fetchToken(): Promise<void> {
    const current = this.auth();
    const oauth2 = current.oauth2;
    if (!oauth2) return;

    const variables = this.environmentService.resolveVariables(this.collectionPath());
    const tokenUrl = resolveVariables(oauth2.tokenUrl || '', variables);
    const authUrl = resolveVariables(oauth2.authUrl || '', variables);
    const clientId = resolveVariables(oauth2.clientId || '', variables);
    const clientSecret = resolveVariables(oauth2.clientSecret || '', variables);
    const username = resolveVariables(oauth2.username || '', variables);
    const password = resolveVariables(oauth2.password || '', variables);
    const callbackUrl = resolveVariables(oauth2.callbackUrl || '', variables);
    const scope = resolveVariables(oauth2.scope || '', variables);

    if (!tokenUrl) {
      this.toastService.error('Token URL is required');
      return;
    }
    if (!clientId) {
      this.toastService.error('Client ID is required');
      return;
    }
    if (oauth2.grantType === 'authorization_code') {
      if (!authUrl) {
        this.toastService.error('Auth URL is required for Authorization Code grant');
        return;
      }
      if (!callbackUrl) {
        this.toastService.error('Callback URL is required for Authorization Code grant');
        return;
      }
    }

    const result = await this.apiService.getOAuth2Token({
      grantType: oauth2.grantType,
      tokenUrl,
      authUrl,
      clientId,
      clientSecret,
      username,
      password,
      callbackUrl,
      scope,
      usePkce: oauth2.usePkce !== false,
    });

    if (isIpcError(result)) {
      this.toastService.error(result.error.userMessage || result.error.message || 'Failed to fetch token');
      return;
    }

    const data = result.data;
    if (!data?.access_token) {
      this.toastService.error('Token endpoint did not return an access_token');
      return;
    }

    this.onOAuth2Change('accessToken', data.access_token);

    if (oauth2.saveToEnv && oauth2.saveToEnvId && oauth2.saveToVarName) {
      const saved = this.persistTokenToEnv(this.collectionPath(), oauth2.saveToEnvId, oauth2.saveToVarName, data.access_token);
      if (saved) {
        this.toastService.success(`Access token saved to ${oauth2.saveToVarName}`);
      } else {
        this.toastService.error(`Could not save token to ${oauth2.saveToVarName} (environment not found)`);
      }
    } else {
      this.toastService.success('Access token retrieved');
    }
  }

  /**
   * Persist a token value into a named env variable. Uses the existing variable's
   * secret flag if present; creates a new variable as secret if not.
   */
  private persistTokenToEnv(collectionPath: string, envId: string, varName: string, value: string): boolean {
    const envs = this.environmentService.listEnvironments(collectionPath);
    const env = envs.find(e => e.id === envId);
    if (!env) return false;

    const idx = env.variables.findIndex(v => v.key === varName);
    if (idx !== -1) {
      const existing = env.variables[idx];
      if (existing.secret) {
        this.environmentService.updateSecret(collectionPath, envId, varName, value);
      } else {
        this.environmentService.updateVariable(collectionPath, envId, idx, { value });
      }
    } else {
      this.environmentService.addVariable(collectionPath, envId, {
        key: varName,
        value: '',
        enabled: true,
        secret: true,
      });
      this.environmentService.updateSecret(collectionPath, envId, varName, value);
    }
    return true;
  }
}
