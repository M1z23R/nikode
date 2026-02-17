import { Component, inject, input } from '@angular/core';
import { GraphQLService } from '../../../core/services/graphql.service';
import { OpenGraphQLRequest } from '../../../core/models/graphql.model';
import { CodeEditorComponent } from '../../../shared/code-editor/code-editor.component';

@Component({
  selector: 'app-query-editor',
  imports: [CodeEditorComponent],
  template: `
    <div class="query-panel">
      <app-code-editor
        [value]="request().query"
        (valueChange)="onQueryChange($event)"
        language="text"
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

  onQueryChange(query: string): void {
    this.graphqlService.updateRequest(this.request().id, { query });
  }
}
