import { Component, Input, inject } from '@angular/core';
import { OpenRequest } from '../../../core/models/request.model';
import { KeyValue } from '../../../core/models/collection.model';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { KeyValueEditorComponent } from '../key-value-editor.component';

@Component({
  selector: 'app-headers-panel',
  imports: [KeyValueEditorComponent],
  template: `
    <app-key-value-editor
      [items]="headersWithDefault"
      keyPlaceholder="Header name"
      valuePlaceholder="Header value"
      (itemsChange)="onHeadersChange($event)" />
  `,
  styles: [`
    :host {
      display: block;
      padding: 1rem;
    }
  `]
})
export class HeadersPanelComponent {
  @Input({ required: true }) request!: OpenRequest;

  private workspace = inject(WorkspaceService);

  get headersWithDefault(): KeyValue[] {
    if (this.request.headers.length === 0) {
      return [{ key: '', value: '', enabled: true }];
    }
    return this.request.headers;
  }

  onHeadersChange(headers: KeyValue[]): void {
    this.workspace.updateRequestHeaders(this.request.id, headers);
  }
}
