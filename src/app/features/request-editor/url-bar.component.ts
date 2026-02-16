import { Component, Input, inject } from '@angular/core';
import { ButtonComponent, InputComponent, SelectComponent, OptionComponent, DialogService } from '@m1z23r/ngx-ui';
import { OpenRequest } from '../../core/models/request.model';
import { HttpMethod } from '../../core/models/collection.model';
import { WorkspaceService } from '../../core/services/workspace.service';
import { EnvironmentService } from '../../core/services/environment.service';
import { generateCurl, ParsedCurl } from '../../core/utils/curl';
import { CurlImportDialogComponent } from '../../shared/dialogs/curl-import.dialog';

@Component({
  selector: 'app-url-bar',
  imports: [ButtonComponent, InputComponent, SelectComponent, OptionComponent],
  template: `
    <div class="url-bar">
      <ui-select
        class="method-select"
        [value]="request.method"
        (valueChange)="onMethodChange($any($event))">
        @for (m of methods; track m) {
          <ui-option [value]="m">
            <span [class]="'method ' + m">{{ m }}</span>
          </ui-option>
        }
      </ui-select>
      <div class="input-wrapper">
        <ui-input
          class="url-input"
          [value]="request.url"
          (valueChange)="onUrlChange($event.toString())"
          placeholder="Enter request URL..."
          (keydown.enter)="onSend()" />
        <div class="floating-buttons">
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
            [disabled]="!request.dirty"
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
            [loading]="request.loading"
            title="Send request">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14"/>
              <path d="m12 5 7 7-7 7"/>
            </svg>
          </ui-button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .url-bar {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .method-select {
      width: 120px;
    }

    .input-wrapper {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
    }

    .url-input {
      width: 100%;
    }

    .url-input ::ng-deep input {
      padding-right: 5.5rem;
      text-overflow: ellipsis;
    }

    .floating-buttons {
      position: absolute;
      right: 0.25rem;
      display: flex;
      gap: 0.25rem;
      align-items: center;
    }
  `]
})
export class UrlBarComponent {
  @Input({ required: true }) request!: OpenRequest;

  private workspace = inject(WorkspaceService);
  private environmentService = inject(EnvironmentService);
  private dialogService = inject(DialogService);

  methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

  onMethodChange(method: HttpMethod): void {
    this.workspace.updateRequestMethod(this.request.id, method);
  }

  onUrlChange(url: string): void {
    this.workspace.updateRequestUrl(this.request.id, url);
  }

  onSend(): void {
    this.workspace.sendRequest(this.request.id);
  }

  onSave(): void {
    this.workspace.saveRequest(this.request.id);
  }

  async importCurl(): Promise<void> {
    const ref = this.dialogService.open<CurlImportDialogComponent, void, ParsedCurl | undefined>(
      CurlImportDialogComponent
    );
    const result = await ref.afterClosed();
    if (result) {
      this.workspace.updateRequest(this.request.id, {
        method: result.method,
        url: result.url,
        headers: result.headers.length > 0
          ? [...result.headers, { key: '', value: '', enabled: true }]
          : [{ key: '', value: '', enabled: true }],
        params: result.params.length > 0
          ? [...result.params, { key: '', value: '', enabled: true }]
          : [],
        body: result.body
      });
    }
  }

  async copyCurl(): Promise<void> {
    const variables = this.environmentService.resolveVariables(this.request.collectionPath);
    const proxyRequest = this.workspace.buildProxyRequest(this.request, variables);
    const curl = generateCurl(proxyRequest);

    try {
      await navigator.clipboard.writeText(curl);
    } catch (e) {
      console.error('Failed to copy to clipboard:', e);
    }
  }
}
