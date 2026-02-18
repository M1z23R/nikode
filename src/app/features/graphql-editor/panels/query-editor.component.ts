import { Component, inject, input, viewChild, effect } from '@angular/core';
import { GraphQLService } from '../../../core/services/graphql.service';
import { OpenGraphQLRequest } from '../../../core/models/graphql.model';
import { CodeEditorComponent } from '../../../shared/code-editor/code-editor.component';

@Component({
  selector: 'app-query-editor',
  imports: [CodeEditorComponent],
  template: `
    <div class="query-panel">
      <app-code-editor
        #queryEditor
        [value]="request().query"
        (valueChange)="onQueryChange($event)"
        language="graphql"
        placeholder="query {
  users {
    id
    name
    email
  }
}" />
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .query-panel {
      flex: 1;
      min-height: 0;
      padding: 1rem;
      display: flex;
      flex-direction: column;
    }
  `]
})
export class QueryEditorComponent {
  private graphqlService = inject(GraphQLService);

  request = input.required<OpenGraphQLRequest>();
  private queryEditor = viewChild<CodeEditorComponent>('queryEditor');

  constructor() {
    effect(() => {
      const schemas = this.graphqlService.schemas();
      const editor = this.queryEditor();
      const request = this.request();
      if (!editor || !request) return;

      const resolvedUrl = this.graphqlService.resolveRequestUrl(request.id);
      if (!resolvedUrl) return;

      const cached = schemas.get(resolvedUrl);
      if (cached) {
        editor.updateGraphQLSchema(cached.schema);
      }
    });
  }

  onQueryChange(query: string): void {
    this.graphqlService.updateRequest(this.request().id, { query });
  }
}
