import { Component, Input, inject } from '@angular/core';
import { RadioGroupComponent, RadioComponent, ButtonComponent } from '@m1z23r/ngx-ui';
import { OpenRequest } from '../../../core/models/request.model';
import { RequestBody, KeyValue } from '../../../core/models/collection.model';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { EnvironmentService } from '../../../core/services/environment.service';
import { CodeEditorComponent } from '../../../shared/code-editor/code-editor.component';
import { KeyValueEditorComponent } from '../key-value-editor.component';
import { VariableTooltipConfig, VariableInfo } from '../../../shared/code-editor/variable-tooltip.extension';

@Component({
  selector: 'app-body-panel',
  imports: [
    RadioGroupComponent,
    RadioComponent,
    ButtonComponent,
    CodeEditorComponent,
    KeyValueEditorComponent
  ],
  template: `
    <div class="body-panel">
      <ui-radio-group
        [value]="request.body.type"
        (valueChange)="onTypeChange($event?.toString() || 'none')"
        orientation="horizontal"
        variant="segmented">
        <ui-radio value="none">None</ui-radio>
        <ui-radio value="json">JSON</ui-radio>
        <ui-radio value="form-data">Form Data</ui-radio>
        <ui-radio value="x-www-form-urlencoded">URL Encoded</ui-radio>
        <ui-radio value="raw">Raw</ui-radio>
      </ui-radio-group>

      <div class="body-content">
        @switch (request.body.type) {
          @case ('none') {
            <div class="no-body">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
              </svg>
              <p>This request does not have a body</p>
            </div>
          }
          @case ('json') {
            <div class="editor-wrapper">
              <ui-button
                class="format-btn"
                variant="ghost"
                size="sm"
                (clicked)="onFormat()"
                title="Format JSON (Ctrl+Shift+F)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 7h16"/>
                  <path d="M4 12h16"/>
                  <path d="M4 17h10"/>
                </svg>
                Format
              </ui-button>
              <app-code-editor
                [value]="request.body.content || ''"
                (valueChange)="onContentChange($event)"
                [variableTooltip]="variableTooltipConfig"
                language="json"
                placeholder="Enter JSON body..." />
            </div>
          }
          @case ('raw') {
            <div class="editor-wrapper">
              <app-code-editor
                [value]="request.body.content || ''"
                (valueChange)="onContentChange($event)"
                [variableTooltip]="variableTooltipConfig"
                language="text"
                placeholder="Enter raw body content..." />
            </div>
          }
          @case ('form-data') {
            <div class="form-data-wrapper">
              <app-key-value-editor
                [items]="request.body.entries || []"
                (itemsChange)="onEntriesChange($event)"
                keyPlaceholder="Field name"
                valuePlaceholder="Value" />
            </div>
          }
          @case ('x-www-form-urlencoded') {
            <div class="form-data-wrapper">
              <app-key-value-editor
                [items]="request.body.entries || []"
                (itemsChange)="onEntriesChange($event)"
                keyPlaceholder="Key"
                valuePlaceholder="Value" />
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

    .body-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 1rem;
      gap: 1rem;
      overflow: hidden;
    }

    .body-content {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .no-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      color: var(--ui-text-muted);
      font-size: 0.875rem;

      svg {
        opacity: 0.5;
      }
    }

    .editor-wrapper {
      flex: 1;
      min-height: 0;
      position: relative;
      display: flex;
      flex-direction: column;
    }

    .format-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 10;
      opacity: 0.7;
      transition: opacity 0.15s ease;

      &:hover {
        opacity: 1;
      }
    }

    .form-data-wrapper {
      flex: 1;
      overflow: auto;
      border: 1px solid var(--ui-border);
      border-radius: 4px;
      padding: 1rem;
    }
  `]
})
export class BodyPanelComponent {
  @Input({ required: true }) request!: OpenRequest;

  private workspace = inject(WorkspaceService);
  private environmentService = inject(EnvironmentService);

  variableTooltipConfig: VariableTooltipConfig = {
    resolver: (name: string): VariableInfo | undefined => {
      const info = this.environmentService.getVariableInfo(this.request.collectionPath, name);
      if (!info) return undefined;
      return { name, value: info.value, isSecret: info.isSecret };
    },
    onSave: (name: string, value: string): void => {
      const env = this.environmentService.getActiveEnvironment(this.request.collectionPath);
      if (env) {
        this.environmentService.addVariable(this.request.collectionPath, env.id, {
          key: name,
          value,
          enabled: true
        });
      }
    }
  };

  onTypeChange(type: string): void {
    const bodyType = type as RequestBody['type'];
    const body: RequestBody = {
      type: bodyType,
      content: this.request.body.content || '',
      entries: this.request.body.entries || []
    };

    // Initialize entries for form types if empty
    if ((bodyType === 'form-data' || bodyType === 'x-www-form-urlencoded') && (!body.entries || body.entries.length === 0)) {
      body.entries = [{ key: '', value: '', enabled: true }];
    }

    this.workspace.updateRequestBody(this.request.id, body);
  }

  onContentChange(content: string): void {
    const body: RequestBody = {
      ...this.request.body,
      content
    };
    this.workspace.updateRequestBody(this.request.id, body);
  }

  onEntriesChange(entries: KeyValue[]): void {
    const body: RequestBody = {
      ...this.request.body,
      entries
    };
    this.workspace.updateRequestBody(this.request.id, body);
  }

  onFormat(): void {
    const content = this.request.body.content || '';
    if (!content.trim()) return;

    try {
      const parsed = JSON.parse(content);
      const formatted = JSON.stringify(parsed, null, 2);
      this.onContentChange(formatted);
    } catch {
      // Invalid JSON, do nothing
    }
  }
}
