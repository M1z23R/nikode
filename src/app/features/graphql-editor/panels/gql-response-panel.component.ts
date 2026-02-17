import { Component, input, signal, computed } from '@angular/core';
import { ButtonComponent, TabsComponent, TabComponent } from '@m1z23r/ngx-ui';
import { OpenGraphQLRequest } from '../../../core/models/graphql.model';
import { CodeEditorComponent } from '../../../shared/code-editor/code-editor.component';

@Component({
  selector: 'app-gql-response-panel',
  imports: [ButtonComponent, TabsComponent, TabComponent, CodeEditorComponent],
  template: `
    <div class="response-panel">
      @if (request().loading) {
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Sending request...</p>
        </div>
      } @else if (!request().response) {
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          <p>Send a request to see the response</p>
        </div>
      } @else {
        <div class="response-content">
          <div class="response-header">
            <div class="status-info">
              <span class="status-code" [class.success]="isSuccess()" [class.error]="!isSuccess()">
                {{ request().response!.statusCode }}
              </span>
              <span class="status-text">{{ request().response!.statusText }}</span>
              <span class="meta">{{ request().response!.time }}ms</span>
              <span class="meta">{{ formatSize(request().response!.size) }}</span>
            </div>
            <div class="header-actions">
              <ui-button variant="ghost" size="sm" (clicked)="copyResponse()" title="Copy">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </ui-button>
            </div>
          </div>
          <ui-tabs [activeTab]="activeTab()" (activeTabChange)="activeTab.set($any($event))" variant="underline">
            <ui-tab id="data" label="Data">
              <div class="tab-content">
                @if (request().response!.data) {
                  <app-code-editor
                    [value]="dataJson()"
                    language="json"
                    [readonly]="true"
                    [showLineNumbers]="true"
                    [foldable]="true" />
                } @else {
                  <div class="no-data">No data returned</div>
                }
              </div>
            </ui-tab>
            <ui-tab id="errors" [label]="'Errors' + (hasErrors() ? ' (' + request().response!.errors!.length + ')' : '')">
              <div class="tab-content">
                @if (hasErrors()) {
                  <app-code-editor
                    [value]="errorsJson()"
                    language="json"
                    [readonly]="true"
                    [showLineNumbers]="true"
                    [foldable]="true" />
                } @else {
                  <div class="no-errors">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <p>No errors</p>
                  </div>
                }
              </div>
            </ui-tab>
            <ui-tab id="raw" label="Raw">
              <div class="tab-content">
                <app-code-editor
                  [value]="request().response!.rawBody"
                  language="json"
                  [readonly]="true"
                  [showLineNumbers]="true"
                  [foldable]="true" />
              </div>
            </ui-tab>
            <ui-tab id="headers" label="Headers">
              <div class="tab-content headers-content">
                @for (header of responseHeaders(); track header.key) {
                  <div class="header-row">
                    <span class="header-key">{{ header.key }}</span>
                    <span class="header-value">{{ header.value }}</span>
                  </div>
                }
              </div>
            </ui-tab>
          </ui-tabs>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
    }

    .response-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .loading-state, .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      color: var(--ui-text-muted);
      font-size: 0.875rem;

      svg {
        opacity: 0.5;
      }
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--ui-border);
      border-top-color: var(--ui-primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .response-content {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .response-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--ui-border);
      background-color: var(--ui-bg-secondary);
      flex-shrink: 0;
    }

    .status-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .status-code {
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-weight: 600;
      font-size: 0.875rem;

      &.success {
        background-color: color-mix(in srgb, var(--ui-success) 15%, transparent);
        color: var(--ui-success);
      }

      &.error {
        background-color: color-mix(in srgb, var(--ui-error) 15%, transparent);
        color: var(--ui-error);
      }
    }

    .status-text {
      font-size: 0.875rem;
      color: var(--ui-text);
    }

    .meta {
      font-size: 0.75rem;
      color: var(--ui-text-muted);
    }

    .header-actions {
      display: flex;
      gap: 0.25rem;
    }

    .tab-content {
      flex: 1;
      min-height: 0;
      padding: 1rem;
      overflow: auto;
    }

    .no-data, .no-errors {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 0.5rem;
      color: var(--ui-text-muted);
      font-size: 0.875rem;

      svg {
        opacity: 0.5;
      }
    }

    .no-errors svg {
      color: var(--ui-success);
      opacity: 1;
    }

    .headers-content {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .header-row {
      display: flex;
      gap: 1rem;
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--ui-border);
      font-size: 0.875rem;

      &:last-child {
        border-bottom: none;
      }
    }

    .header-key {
      font-weight: 500;
      color: var(--ui-text);
      min-width: 200px;
    }

    .header-value {
      color: var(--ui-text-muted);
      word-break: break-all;
    }
  `]
})
export class GqlResponsePanelComponent {
  request = input.required<OpenGraphQLRequest>();

  activeTab = signal<string | number>('data');

  isSuccess(): boolean {
    const statusCode = this.request().response?.statusCode;
    return statusCode !== undefined && statusCode >= 200 && statusCode < 300;
  }

  hasErrors(): boolean {
    const errors = this.request().response?.errors;
    return errors !== undefined && errors.length > 0;
  }

  dataJson = computed(() => {
    const data = this.request().response?.data;
    if (!data) return '';
    return JSON.stringify(data, null, 2);
  });

  errorsJson = computed(() => {
    const errors = this.request().response?.errors;
    if (!errors) return '';
    return JSON.stringify(errors, null, 2);
  });

  responseHeaders = computed(() => {
    const headers = this.request().response?.headers || {};
    return Object.entries(headers).map(([key, value]) => ({ key, value }));
  });

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  copyResponse(): void {
    const response = this.request().response;
    if (!response) return;
    navigator.clipboard.writeText(response.rawBody);
  }
}
