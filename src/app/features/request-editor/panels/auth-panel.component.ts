import { Component, input, inject } from '@angular/core';
import { RadioGroupComponent, RadioComponent, SelectComponent, OptionComponent, ButtonComponent } from '@m1z23r/ngx-ui';
import { OpenRequest } from '../../../core/models/request.model';
import { RequestAuth, RequestAuthType, OAuth2GrantType, ApiKeyLocation } from '../../../core/models/collection.model';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { TemplateInputWrapperComponent } from '../../../shared/components/template-input-wrapper.component';

@Component({
  selector: 'app-auth-panel',
  imports: [
    RadioGroupComponent,
    RadioComponent,
    SelectComponent,
    OptionComponent,
    ButtonComponent,
    TemplateInputWrapperComponent
  ],
  template: `
    <div class="auth-panel">
      <ui-radio-group
        [value]="request().auth.type"
        (valueChange)="onTypeChange($event?.toString() || 'none')"
        orientation="horizontal"
        variant="segmented">
        <ui-radio value="none">None</ui-radio>
        <ui-radio value="basic">Basic Auth</ui-radio>
        <ui-radio value="bearer">Bearer Token</ui-radio>
        <ui-radio value="api-key">API Key</ui-radio>
        <ui-radio value="oauth2">OAuth 2.0</ui-radio>
      </ui-radio-group>

      <div class="auth-content">
        @switch (request().auth.type) {
          @case ('none') {
            <div class="no-auth">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
              </svg>
              <p>This request does not use any authentication</p>
            </div>
          }
          @case ('basic') {
            <div class="auth-form">
              <div class="field">
                <label>Username</label>
                <app-template-input
                  [value]="request().auth.basic?.username || ''"
                  (valueChange)="onBasicChange('username', $event)"
                  [collectionPath]="request().collectionPath"
                  placeholder="Username" />
              </div>
              <div class="field">
                <label>Password</label>
                <app-template-input
                  [value]="request().auth.basic?.password || ''"
                  (valueChange)="onBasicChange('password', $event)"
                  [collectionPath]="request().collectionPath"
                  placeholder="Password" />
              </div>
            </div>
          }
          @case ('bearer') {
            <div class="auth-form">
              <div class="field">
                <label>Token</label>
                <app-template-input
                  [value]="request().auth.bearer?.token || ''"
                  (valueChange)="onBearerChange('token', $event)"
                  [collectionPath]="request().collectionPath"
                  placeholder="Token" />
              </div>
              <div class="field">
                <label>Prefix</label>
                <app-template-input
                  [value]="request().auth.bearer?.prefix ?? 'Bearer'"
                  (valueChange)="onBearerChange('prefix', $event)"
                  [collectionPath]="request().collectionPath"
                  placeholder="Bearer" />
              </div>
            </div>
          }
          @case ('api-key') {
            <div class="auth-form">
              <div class="field">
                <label>Key</label>
                <app-template-input
                  [value]="request().auth.apiKey?.key || ''"
                  (valueChange)="onApiKeyChange('key', $event)"
                  [collectionPath]="request().collectionPath"
                  placeholder="Header or param name" />
              </div>
              <div class="field">
                <label>Value</label>
                <app-template-input
                  [value]="request().auth.apiKey?.value || ''"
                  (valueChange)="onApiKeyChange('value', $event)"
                  [collectionPath]="request().collectionPath"
                  placeholder="API key value" />
              </div>
              <div class="field">
                <label>Add To</label>
                <ui-select
                  [value]="request().auth.apiKey?.addTo || 'header'"
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
                  [value]="request().auth.oauth2?.grantType || 'client_credentials'"
                  (valueChange)="onOAuth2Change('grantType', $event?.toString() || 'client_credentials')">
                  <ui-option value="client_credentials">Client Credentials</ui-option>
                  <ui-option value="password">Password</ui-option>
                  <ui-option value="authorization_code">Authorization Code</ui-option>
                </ui-select>
              </div>

              @if (request().auth.oauth2?.grantType === 'authorization_code') {
                <div class="field">
                  <label>Auth URL</label>
                  <app-template-input
                    [value]="request().auth.oauth2?.authUrl || ''"
                    (valueChange)="onOAuth2Change('authUrl', $event)"
                    [collectionPath]="request().collectionPath"
                    placeholder="https://example.com/oauth/authorize" />
                </div>
              }

              <div class="field">
                <label>Token URL</label>
                <app-template-input
                  [value]="request().auth.oauth2?.tokenUrl || ''"
                  (valueChange)="onOAuth2Change('tokenUrl', $event)"
                  [collectionPath]="request().collectionPath"
                  placeholder="https://example.com/oauth/token" />
              </div>
              <div class="field">
                <label>Client ID</label>
                <app-template-input
                  [value]="request().auth.oauth2?.clientId || ''"
                  (valueChange)="onOAuth2Change('clientId', $event)"
                  [collectionPath]="request().collectionPath"
                  placeholder="Client ID" />
              </div>
              <div class="field">
                <label>Client Secret</label>
                <app-template-input
                  [value]="request().auth.oauth2?.clientSecret || ''"
                  (valueChange)="onOAuth2Change('clientSecret', $event)"
                  [collectionPath]="request().collectionPath"
                  placeholder="Client Secret" />
              </div>

              @if (request().auth.oauth2?.grantType === 'password') {
                <div class="field">
                  <label>Username</label>
                  <app-template-input
                    [value]="request().auth.oauth2?.username || ''"
                    (valueChange)="onOAuth2Change('username', $event)"
                    [collectionPath]="request().collectionPath"
                    placeholder="Username" />
                </div>
                <div class="field">
                  <label>Password</label>
                  <app-template-input
                    [value]="request().auth.oauth2?.password || ''"
                    (valueChange)="onOAuth2Change('password', $event)"
                    [collectionPath]="request().collectionPath"
                    placeholder="Password" />
                </div>
              }

              @if (request().auth.oauth2?.grantType === 'authorization_code') {
                <div class="field">
                  <label>Callback URL</label>
                  <app-template-input
                    [value]="request().auth.oauth2?.callbackUrl || ''"
                    (valueChange)="onOAuth2Change('callbackUrl', $event)"
                    [collectionPath]="request().collectionPath"
                    placeholder="https://localhost/callback" />
                </div>
              }

              <div class="field">
                <label>Scope</label>
                <app-template-input
                  [value]="request().auth.oauth2?.scope || ''"
                  (valueChange)="onOAuth2Change('scope', $event)"
                  [collectionPath]="request().collectionPath"
                  placeholder="read write" />
              </div>

              <div class="field">
                <label>Access Token</label>
                <app-template-input
                  [value]="request().auth.oauth2?.accessToken || ''"
                  (valueChange)="onOAuth2Change('accessToken', $event)"
                  [collectionPath]="request().collectionPath"
                  placeholder="Paste or fetch a token" />
              </div>

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
      height: 100%;
      overflow: hidden;
    }

    .auth-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 1rem;
      gap: 1rem;
      overflow: hidden;
    }

    .auth-content {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }

    .no-auth {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      color: var(--ui-text-muted);
      font-size: 0.875rem;
      padding-top: 3rem;

      svg {
        opacity: 0.5;
      }
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
export class AuthPanelComponent {
  request = input.required<OpenRequest>();

  private workspace = inject(WorkspaceService);

  onTypeChange(type: string): void {
    const req = this.request();
    const authType = type as RequestAuthType;
    const auth: RequestAuth = { ...req.auth, type: authType };

    // Initialize sub-objects if needed
    if (authType === 'basic' && !auth.basic) {
      auth.basic = { username: '', password: '' };
    } else if (authType === 'bearer' && !auth.bearer) {
      auth.bearer = { token: '', prefix: 'Bearer' };
    } else if (authType === 'api-key' && !auth.apiKey) {
      auth.apiKey = { key: '', value: '', addTo: 'header' };
    } else if (authType === 'oauth2' && !auth.oauth2) {
      auth.oauth2 = {
        grantType: 'client_credentials',
        accessToken: '',
        tokenUrl: '',
        authUrl: '',
        clientId: '',
        clientSecret: '',
        username: '',
        password: '',
        callbackUrl: '',
        scope: ''
      };
    }

    this.workspace.updateRequestAuth(req.id, auth);
  }

  onBasicChange(field: 'username' | 'password', value: string): void {
    const req = this.request();
    const auth: RequestAuth = {
      ...req.auth,
      basic: { ...req.auth.basic || { username: '', password: '' }, [field]: value }
    };
    this.workspace.updateRequestAuth(req.id, auth);
  }

  onBearerChange(field: 'token' | 'prefix', value: string): void {
    const req = this.request();
    const auth: RequestAuth = {
      ...req.auth,
      bearer: { ...req.auth.bearer || { token: '', prefix: 'Bearer' }, [field]: value }
    };
    this.workspace.updateRequestAuth(req.id, auth);
  }

  onApiKeyChange(field: 'key' | 'value' | 'addTo', value: string): void {
    const req = this.request();
    const auth: RequestAuth = {
      ...req.auth,
      apiKey: { ...req.auth.apiKey || { key: '', value: '', addTo: 'header' as ApiKeyLocation }, [field]: value }
    };
    this.workspace.updateRequestAuth(req.id, auth);
  }

  onOAuth2Change(field: string, value: string): void {
    const req = this.request();
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
      scope: ''
    };
    const auth: RequestAuth = {
      ...req.auth,
      oauth2: { ...defaults, ...req.auth.oauth2, [field]: value }
    };
    this.workspace.updateRequestAuth(req.id, auth);
  }

  async fetchToken(): Promise<void> {
    const req = this.request();
    const oauth2 = req.auth.oauth2;
    if (!oauth2?.tokenUrl || !oauth2?.clientId) return;

    try {
      const params = new URLSearchParams();
      params.set('client_id', oauth2.clientId);
      params.set('client_secret', oauth2.clientSecret || '');

      if (oauth2.grantType === 'client_credentials') {
        params.set('grant_type', 'client_credentials');
      } else if (oauth2.grantType === 'password') {
        params.set('grant_type', 'password');
        params.set('username', oauth2.username || '');
        params.set('password', oauth2.password || '');
      }

      if (oauth2.scope) {
        params.set('scope', oauth2.scope);
      }

      const response = await fetch(oauth2.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });

      const data = await response.json();
      if (data.access_token) {
        this.onOAuth2Change('accessToken', data.access_token);
      }
    } catch {
      // Token fetch failed - user can see the empty access token field
    }
  }
}
