import { Component, input, computed } from '@angular/core';
import { ButtonComponent } from '@m1z23r/ngx-ui';
import { ProxyResponse } from '../../../core/models/request.model';
import { CodeEditorComponent } from '../../../shared/code-editor/code-editor.component';

@Component({
  selector: 'app-response-tab',
  imports: [ButtonComponent, CodeEditorComponent],
  template: `
    <div class="response-tab">
      <div class="body-section">
        <div class="body-header">
          <h4>Response Body</h4>
          <ui-button variant="ghost" size="sm" (clicked)="copyBody()" title="Copy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copy
          </ui-button>
        </div>
        <div class="body-editor">
          <app-code-editor
            [value]="formattedBody()"
            [language]="isJson() ? 'json' : 'text'"
            [readonly]="true"
            [showLineNumbers]="true"
            [foldable]="isJson()" />
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      padding: 1rem;
    }

    .response-tab {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .body-section {
      display: flex;
      flex-direction: column;
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

    .body-editor {
      flex: 1;
      min-height: 200px;
    }
  `]
})
export class ResponseTabComponent {
  response = input.required<ProxyResponse>();

  isJson = computed(() => {
    try {
      JSON.parse(this.response().body);
      return true;
    } catch {
      return false;
    }
  });

  formattedBody = computed(() => {
    const body = this.response().body;
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  });

  copyBody(): void {
    navigator.clipboard.writeText(this.response().body);
  }
}
