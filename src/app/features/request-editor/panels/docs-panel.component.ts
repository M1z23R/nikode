import { Component, input, inject, signal } from '@angular/core';
import { RadioGroupComponent, RadioComponent } from '@m1z23r/ngx-ui';
import { MarkdownComponent } from 'ngx-markdown';
import { OpenRequest } from '../../../core/models/request.model';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { CodeEditorComponent } from '../../../shared/code-editor/code-editor.component';

@Component({
  selector: 'app-docs-panel',
  imports: [
    RadioGroupComponent,
    RadioComponent,
    MarkdownComponent,
    CodeEditorComponent
  ],
  template: `
    <div class="docs-panel">
      <ui-radio-group
        [value]="mode()"
        (valueChange)="mode.set($event?.toString() || 'view')"
        orientation="horizontal"
        variant="segmented">
        <ui-radio value="view">View</ui-radio>
        <ui-radio value="edit">Edit</ui-radio>
      </ui-radio-group>

      <div class="docs-content">
        @if (mode() === 'view') {
          @if (request().docs.trim()) {
            <div class="markdown-view">
              <markdown [data]="request().docs" />
            </div>
          } @else {
            <div class="empty-state">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              <p>No documentation yet</p>
              <p class="hint">Switch to Edit mode to add markdown documentation</p>
            </div>
          }
        } @else {
          <app-code-editor
            [value]="request().docs || ''"
            (valueChange)="onDocsChange($event)"
            language="markdown"
            [showLineNumbers]="false"
            placeholder="Write your documentation in markdown..." />
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

    .docs-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 1rem;
      gap: 1rem;
      overflow: hidden;
    }

    .docs-content {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .markdown-view {
      flex: 1;
      overflow: auto;
      padding: 1rem;
      border: 1px solid var(--ui-border);
      border-radius: 4px;
    }

    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      color: var(--ui-text-muted);
      font-size: 0.875rem;

      svg {
        opacity: 0.5;
      }

      .hint {
        font-size: 0.75rem;
        opacity: 0.7;
      }
    }

    /* Markdown rendered content styles */
    .markdown-view ::ng-deep {
      h1, h2, h3, h4, h5, h6 {
        margin-top: 1rem;
        margin-bottom: 0.5rem;
        font-weight: 600;
        color: var(--ui-text);
      }

      h1 { font-size: 1.5rem; }
      h2 { font-size: 1.25rem; }
      h3 { font-size: 1.125rem; }

      p {
        margin: 0.5rem 0;
        line-height: 1.6;
        color: var(--ui-text);
      }

      ul, ol {
        margin: 0.5rem 0;
        padding-left: 1.5rem;
        color: var(--ui-text);
      }

      li {
        margin: 0.25rem 0;
      }

      code {
        background: var(--ui-bg-muted, rgba(127, 127, 127, 0.1));
        padding: 0.15rem 0.4rem;
        border-radius: 3px;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 0.85em;
        color: var(--ui-text);
      }

      pre {
        background: var(--ui-bg-muted, rgba(127, 127, 127, 0.1));
        padding: 0.75rem 1rem;
        border-radius: 4px;
        overflow-x: auto;
        margin: 0.75rem 0;

        code {
          background: none;
          padding: 0;
        }
      }

      blockquote {
        border-left: 3px solid var(--ui-border);
        margin: 0.75rem 0;
        padding: 0.25rem 1rem;
        color: var(--ui-text-muted);
      }

      a {
        color: var(--ui-primary, #6366f1);
        text-decoration: underline;
      }

      table {
        border-collapse: collapse;
        margin: 0.75rem 0;
        width: 100%;
      }

      th, td {
        border: 1px solid var(--ui-border);
        padding: 0.5rem 0.75rem;
        text-align: left;
        color: var(--ui-text);
      }

      th {
        background: var(--ui-bg-muted, rgba(127, 127, 127, 0.1));
        font-weight: 600;
      }

      hr {
        border: none;
        border-top: 1px solid var(--ui-border);
        margin: 1rem 0;
      }

      img {
        max-width: 100%;
        border-radius: 4px;
      }
    }
  `]
})
export class DocsPanelComponent {
  request = input.required<OpenRequest>();
  mode = signal<string>('view');

  private workspace = inject(WorkspaceService);

  onDocsChange(docs: string): void {
    this.workspace.updateRequestDocs(this.request().id, docs);
  }
}
