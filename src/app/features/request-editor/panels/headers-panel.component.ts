import { Component, input, inject } from '@angular/core';
import { OpenRequest } from '../../../core/models/request.model';
import { KeyValue } from '../../../core/models/collection.model';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { KeyValueEditorComponent } from '../key-value-editor.component';

@Component({
  selector: 'app-headers-panel',
  imports: [KeyValueEditorComponent],
  template: `
    <app-key-value-editor
      [items]="headersWithDefault"      keyPlaceholder="Header name"
      valuePlaceholder="Header value"
      [collectionPath]="request().collectionPath"
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
  request = input.required<OpenRequest>();

  private workspace = inject(WorkspaceService);

  get headersWithDefault(): KeyValue[] {
    const req = this.request();
    if (req.headers.length === 0) {
      return [{ key: '', value: '', enabled: true }];
    }
    return req.headers;
  }

  onHeadersChange(headers: KeyValue[]): void {
    this.workspace.updateRequestHeaders(this.request().id, headers);
  }
}
