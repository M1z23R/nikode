import { Component, inject, input } from '@angular/core';
import { ButtonComponent } from '@m1z23r/ngx-ui';
import { GraphQLService } from '../../../core/services/graphql.service';
import { OpenGraphQLRequest } from '../../../core/models/graphql.model';
import { CodeEditorComponent } from '../../../shared/code-editor/code-editor.component';

@Component({
  selector: 'app-variables-editor',
  imports: [CodeEditorComponent, ButtonComponent],
  template: `
    <div class="variables-panel">
      <div class="editor-wrapper">
        <ui-button
          class="format-btn"
          variant="ghost"
          size="sm"
          (clicked)="onFormat()"
          title="Format JSON">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 7h16"/>
            <path d="M4 12h16"/>
            <path d="M4 17h10"/>
          </svg>
          Format
        </ui-button>
        <app-code-editor
          [value]="request().variables"
          (valueChange)="onVariablesChange($event)"
          language="json"
          placeholder='{
  "id": 1,
  "limit": 10
}' />
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

    .variables-panel {
      flex: 1;
      min-height: 0;
      padding: 1rem;
      display: flex;
      flex-direction: column;
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
  `]
})
export class VariablesEditorComponent {
  private graphqlService = inject(GraphQLService);

  request = input.required<OpenGraphQLRequest>();

  onVariablesChange(variables: string): void {
    this.graphqlService.updateRequest(this.request().id, { variables });
  }

  onFormat(): void {
    const content = this.request().variables;
    if (!content.trim()) return;

    try {
      const parsed = JSON.parse(content);
      const formatted = JSON.stringify(parsed, null, 2);
      this.graphqlService.updateRequest(this.request().id, { variables: formatted });
    } catch {
      // Invalid JSON, do nothing
    }
  }
}
