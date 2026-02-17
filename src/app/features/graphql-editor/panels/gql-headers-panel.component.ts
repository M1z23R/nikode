import { Component, inject, input } from '@angular/core';
import { GraphQLService } from '../../../core/services/graphql.service';
import { OpenGraphQLRequest } from '../../../core/models/graphql.model';
import { KeyValue } from '../../../core/models/collection.model';
import { KeyValueEditorComponent } from '../../request-editor/key-value-editor.component';

@Component({
  selector: 'app-gql-headers-panel',
  imports: [KeyValueEditorComponent],
  template: `
    <div class="headers-panel">
      <app-key-value-editor
        [items]="request().headers"
        (itemsChange)="onHeadersChange($event)"
        keyPlaceholder="Header name"
        valuePlaceholder="Header value"
      />
    </div>
  `,
  styles: [`
    .headers-panel {
      padding: 1rem;
      height: 100%;
      overflow-y: auto;
    }
  `]
})
export class GqlHeadersPanelComponent {
  private graphqlService = inject(GraphQLService);

  request = input.required<OpenGraphQLRequest>();

  onHeadersChange(headers: KeyValue[]): void {
    this.graphqlService.updateRequest(this.request().id, { headers });
  }
}
