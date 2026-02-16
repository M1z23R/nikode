import { Component, Input, inject } from '@angular/core';
import { TextareaComponent } from '@m1z23r/ngx-ui';
import { OpenRequest } from '../../../core/models/request.model';
import { WorkspaceService } from '../../../core/services/workspace.service';

@Component({
  selector: 'app-docs-panel',
  imports: [TextareaComponent],
  template: `
    <div class="docs-panel">
      <ui-textarea
        label="Documentation"
        hint="Notes and documentation for this request"
        [value]="request.docs"
        (valueChange)="onDocsChange($event)"
        placeholder="Add notes, usage examples, or documentation for this request..."
        [rows]="10"
        resize="vertical" />
    </div>
  `,
  styles: [`
    :host {
      display: block;
      padding: 1rem;
    }

    .docs-panel {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
  `]
})
export class DocsPanelComponent {
  @Input({ required: true }) request!: OpenRequest;

  private workspace = inject(WorkspaceService);

  onDocsChange(docs: string): void {
    this.workspace.updateRequestDocs(this.request.id, docs);
  }
}
