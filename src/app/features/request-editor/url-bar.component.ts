import { Component, input, inject } from '@angular/core';
import { ButtonComponent, SelectComponent, OptionComponent, DialogService } from '@m1z23r/ngx-ui';
import { OpenRequest } from '../../core/models/request.model';
import { HttpMethod } from '../../core/models/collection.model';
import { WorkspaceService } from '../../core/services/workspace.service';
import { EnvironmentService } from '../../core/services/environment.service';
import { generateCurl, ParsedCurl } from '../../core/utils/curl';
import { CurlImportDialogComponent } from '../../shared/dialogs/curl-import.dialog';
import { TemplateInputWrapperComponent } from '../../shared/components/template-input-wrapper.component';

@Component({
  selector: 'app-url-bar',
  imports: [ButtonComponent, TemplateInputWrapperComponent, SelectComponent, OptionComponent],
  template: `
    <div class="url-bar">
      <ui-select
        class="method-select"
        [value]="request().method"
        (valueChange)="onMethodChange($any($event))">
        @for (m of methods; track m) {
          <ui-option [value]="m">
            <span [class]="'method ' + m">{{ m }}</span>
          </ui-option>
        }
      </ui-select>
      <app-template-input
        class="url-input"
        [value]="request().url"
        (valueChange)="onUrlChange($event)"
        placeholder="Enter request URL..."
        [collectionPath]="request().collectionPath"
        (enterPressed)="onSend()">
        <ng-template #suffix>
          <div class="suffix-buttons">
          <ui-button
            variant="ghost"
            size="sm"
            (clicked)="importCurl()"
            title="Import cURL">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </ui-button>
          <ui-button
            variant="ghost"
            size="sm"
            (clicked)="copyCurl()"
            title="Copy as cURL">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
            </svg>
          </ui-button>
          <ui-button
            variant="ghost"
            size="sm"
            (clicked)="onSave()"
            [disabled]="!request().dirty"
            title="Save changes">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
          </ui-button>
          <ui-button
            variant="ghost"
            size="sm"
            (clicked)="onSend()"
            [loading]="request().loading && !request().polling"
            [title]="request().polling ? 'Stop polling' : request().pollingEnabled ? 'Start polling' : 'Send request'"
            [class.polling-active]="request().polling">
            @if (request().polling) {
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2"/>
              </svg>
            } @else {
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14"/>
                <path d="m12 5 7 7-7 7"/>
              </svg>
            }
          </ui-button>
          </div>
        </ng-template>
      </app-template-input>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      min-width: 0;
    }

    .url-bar {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      width: 100%;
      min-width: 0;
    }

    .method-select {
      width: 120px;
      flex-shrink: 0;
    }

    .url-input {
      flex: 1;
      min-width: 0;
    }

    .suffix-buttons {
      display: flex;
      gap: 0.25rem;
      align-items: center;
    }

    .polling-active {
      color: var(--ui-danger, #ef4444);
    }
  `]
})
export class UrlBarComponent {
  request = input.required<OpenRequest>();

  private workspace = inject(WorkspaceService);
  private environmentService = inject(EnvironmentService);
  private dialogService = inject(DialogService);

  methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

  onMethodChange(method: HttpMethod): void {
    this.workspace.updateRequestMethod(this.request().id, method);
  }

  onUrlChange(url: string): void {
    this.workspace.updateRequestUrl(this.request().id, url);
  }

  onSend(): void {
    this.workspace.sendRequest(this.request().id);
  }

  onSave(): void {
    this.workspace.saveRequest(this.request().id);
  }

  async importCurl(): Promise<void> {
    const ref = this.dialogService.open<CurlImportDialogComponent, void, ParsedCurl | undefined>(
      CurlImportDialogComponent
    );
    const result = await ref.afterClosed();
    if (result) {
      this.workspace.updateRequest(this.request().id, {
        method: result.method,
        url: result.url,
        headers: result.headers.length > 0
          ? [...result.headers, { key: '', value: '', enabled: true }]
          : [{ key: '', value: '', enabled: true }],
        params: result.params.length > 0
          ? [...result.params, { key: '', value: '', enabled: true }]
          : [],
        body: result.body,
        ...(result.auth ? { auth: result.auth } : {})
      });
    }
  }

  async copyCurl(): Promise<void> {
    const req = this.request();
    const variables = this.environmentService.resolveVariables(req.collectionPath);
    const proxyRequest = this.workspace.buildProxyRequest(req, variables);
    const curl = generateCurl(proxyRequest);

    try {
      await navigator.clipboard.writeText(curl);
    } catch (e) {
      console.error('Failed to copy to clipboard:', e);
    }
  }
}
