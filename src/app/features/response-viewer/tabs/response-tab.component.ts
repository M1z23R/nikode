import { Component, input, computed, signal } from '@angular/core';
import { ButtonComponent } from '@m1z23r/ngx-ui';
import { ProxyResponse } from '../../../core/models/request.model';
import {
  ContentCategory,
  parseContentType,
  categorizeContentType,
} from '../../../core/models/content-type.model';
import { ViewModeSwitcherComponent, ViewMode } from '../components/view-mode-switcher.component';
import { JsonViewerComponent } from '../viewers/json-viewer.component';
import { HtmlViewerComponent } from '../viewers/html-viewer.component';
import { XmlViewerComponent } from '../viewers/xml-viewer.component';
import { ImageViewerComponent } from '../viewers/image-viewer.component';
import { TextViewerComponent } from '../viewers/text-viewer.component';
import { BinaryViewerComponent } from '../viewers/binary-viewer.component';

@Component({
  selector: 'app-response-tab',
  imports: [
    ButtonComponent,
    ViewModeSwitcherComponent,
    JsonViewerComponent,
    HtmlViewerComponent,
    XmlViewerComponent,
    ImageViewerComponent,
    TextViewerComponent,
    BinaryViewerComponent,
  ],
  template: `
    <div class="response-tab">
      <div class="body-section">
        <div class="body-header">
          <h4>Response Body</h4>
          <div class="header-actions">
            @if (supportedModes().length > 1) {
              <app-view-mode-switcher
                [mode]="viewMode()"
                [modes]="supportedModes()"
                (modeChange)="viewMode.set($event)" />
            }
            @if (showDownload()) {
              <ui-button variant="ghost" size="sm" (clicked)="download()" title="Download">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </ui-button>
            }
            <ui-button variant="ghost" size="sm" (clicked)="copyBody()" title="Copy">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </ui-button>
          </div>
        </div>
        <div class="body-editor">
          @switch (contentCategory()) {
            @case ('json') {
              <app-json-viewer
                [body]="response().body"
                [pretty]="viewMode() === 'pretty'" />
            }
            @case ('html') {
              <app-html-viewer
                [body]="response().body"
                [preview]="viewMode() === 'preview'" />
            }
            @case ('xml') {
              <app-xml-viewer
                [body]="response().body"
                [pretty]="viewMode() === 'pretty'" />
            }
            @case ('image') {
              <app-image-viewer
                [body]="response().body"
                [mimeType]="contentType().fullMime" />
            }
            @case ('text') {
              <app-text-viewer
                [body]="response().body"
                [subtype]="contentType().subtype" />
            }
            @case ('binary') {
              <app-binary-viewer
                [body]="response().body"
                [mimeType]="contentType().fullMime"
                [size]="response().size" />
            }
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      padding: 1rem;
      height: 100%;
    }

    .response-tab {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .body-section {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      gap: 0.75rem;
    }

    .body-header {
      display: flex;
      align-items: center;
      justify-content: space-between;

      h4 {
        font-size: 0.875rem;
        font-weight: 600;
        margin: 0;
      }
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .body-editor {
      flex: 1;
      min-height: 200px;
    }
  `]
})
export class ResponseTabComponent {
  response = input.required<ProxyResponse>();

  viewMode = signal<ViewMode>('pretty');

  contentType = computed(() => {
    const headers = this.response().headers;
    const header = headers['content-type'] || headers['Content-Type'] || '';
    return parseContentType(header);
  });

  contentCategory = computed<ContentCategory>(() => {
    return categorizeContentType(this.contentType());
  });

  supportedModes = computed<ViewMode[]>(() => {
    const category = this.contentCategory();
    switch (category) {
      case 'json':
      case 'xml':
        return ['raw', 'pretty'];
      case 'html':
        return ['raw', 'preview'];
      default:
        return [];
    }
  });

  showDownload = computed(() => {
    const category = this.contentCategory();
    return category === 'binary' || category === 'image';
  });

  copyBody(): void {
    const resp = this.response();
    if (resp.bodyEncoding === 'base64') {
      const bytes = atob(resp.body);
      navigator.clipboard.writeText(bytes);
    } else {
      navigator.clipboard.writeText(resp.body);
    }
  }

  download(): void {
    const resp = this.response();
    const ct = this.contentType();

    let blob: Blob;
    if (resp.bodyEncoding === 'base64') {
      const binaryString = atob(resp.body);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      blob = new Blob([bytes], { type: ct.fullMime || 'application/octet-stream' });
    } else {
      blob = new Blob([resp.body], { type: ct.fullMime || 'text/plain' });
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const ext = ct.subtype || 'bin';
    link.download = `response.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
