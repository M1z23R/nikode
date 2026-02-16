import { Component, Input, inject } from '@angular/core';
import { OpenRequest } from '../../../core/models/request.model';
import { Scripts } from '../../../core/models/collection.model';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { EnvironmentService } from '../../../core/services/environment.service';
import { CodeEditorComponent } from '../../../shared/code-editor/code-editor.component';
import { VariableTooltipConfig, VariableInfo } from '../../../shared/code-editor/variable-tooltip.extension';

@Component({
  selector: 'app-scripts-panel',
  imports: [CodeEditorComponent],
  template: `
    <div class="scripts-panel">
      <div class="script-section">
        <label class="script-label">Pre-request Script</label>
        <span class="script-hint">Runs before the request is sent</span>
        <div class="editor-wrapper">
          <app-code-editor
            [value]="request.scripts.pre"
            (valueChange)="onPreChange($event)"
            [variableTooltip]="variableTooltipConfig"
            language="javascript"
            placeholder="// JavaScript code..."
            [showLineNumbers]="false" />
        </div>
      </div>

      <div class="script-section">
        <label class="script-label">Post-response Script</label>
        <span class="script-hint">Runs after the response is received</span>
        <div class="editor-wrapper">
          <app-code-editor
            [value]="request.scripts.post"
            (valueChange)="onPostChange($event)"
            [variableTooltip]="variableTooltipConfig"
            language="javascript"
            placeholder="// JavaScript code..."
            [showLineNumbers]="false" />
        </div>
        <div class="script-examples">
          <p class="examples-title">Test Examples:</p>
          <pre class="example-code">{{ testExamples }}</pre>
        </div>
      </div>

      <div class="api-reference">
        <p class="api-title">Available API:</p>
        <code>nk.getEnv(key)</code> <code>nk.setEnv(key, value)</code>
        <code>nk.getVar(key)</code> <code>nk.setVar(key, value)</code>
        <code>nk.request</code>
        <span class="post-only"><code>nk.response</code></span>
        <span class="post-only"><code>nk.test(name, fn)</code></span>
        <span class="post-only"><code>nk.assert(condition, msg?)</code></span>
        <code>console.log/warn/error</code>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      padding: 1rem;
    }

    .scripts-panel {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .script-section {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .script-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--ui-text-primary);
    }

    .script-hint {
      font-size: 0.75rem;
      color: var(--ui-text-muted);
      margin-bottom: 0.25rem;
    }

    .editor-wrapper {
      height: 120px;
      border-radius: 6px;
      overflow: hidden;
    }

    .api-reference {
      padding: 0.75rem 1rem;
      background-color: var(--ui-bg-secondary);
      border-radius: 6px;
      color: var(--ui-text-muted);
      font-size: 0.75rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }

    .api-title {
      margin: 0;
      font-weight: 500;
      color: var(--ui-text-secondary);
    }

    .api-reference code {
      background-color: var(--ui-bg-tertiary);
      padding: 0.125rem 0.375rem;
      border-radius: 3px;
      font-family: monospace;
    }

    .post-only {
      opacity: 0.6;
    }

    .post-only::before {
      content: '(post only) ';
      font-size: 0.625rem;
    }

    .script-examples {
      margin-top: 0.5rem;
      padding: 0.75rem;
      background-color: var(--ui-bg-secondary);
      border-radius: 6px;
    }

    .examples-title {
      margin: 0 0 0.5rem 0;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--ui-text-secondary);
    }

    .example-code {
      margin: 0;
      padding: 0.5rem;
      background-color: var(--ui-bg-tertiary);
      border-radius: 4px;
      font-family: monospace;
      font-size: 0.7rem;
      line-height: 1.4;
      color: var(--ui-text-muted);
      overflow-x: auto;
    }
  `]
})
export class ScriptsPanelComponent {
  @Input({ required: true }) request!: OpenRequest;

  private workspace = inject(WorkspaceService);
  private environmentService = inject(EnvironmentService);

  testExamples = `nk.test("Status is 200", () => {
  nk.assert(nk.response.statusCode === 200);
});

nk.test("Has user field", () => {
  const body = JSON.parse(nk.response.body);
  nk.assert(body.user !== undefined, "Missing user");
});`;

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

  onPreChange(pre: string): void {
    const scripts: Scripts = { ...this.request.scripts, pre };
    this.workspace.updateRequestScripts(this.request.id, scripts);
  }

  onPostChange(post: string): void {
    const scripts: Scripts = { ...this.request.scripts, post };
    this.workspace.updateRequestScripts(this.request.id, scripts);
  }
}
