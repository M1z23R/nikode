import { Component, input, inject } from '@angular/core';
import { OpenRequest } from '../../../core/models/request.model';
import { KeyValue } from '../../../core/models/collection.model';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { KeyValueEditorComponent } from '../key-value-editor.component';

@Component({
  selector: 'app-params-panel',
  imports: [KeyValueEditorComponent],
  template: `
    <app-key-value-editor
      [items]="paramsWithDefault"      keyPlaceholder="Parameter name"
      valuePlaceholder="Parameter value"
      [collectionPath]="request().collectionPath"
      (itemsChange)="onParamsChange($event)" />
  `,
  styles: [`
    :host {
      display: block;
      padding: 1rem;
    }
  `]
})
export class ParamsPanelComponent {
  request = input.required<OpenRequest>();

  private workspace = inject(WorkspaceService);

  get paramsWithDefault(): KeyValue[] {
    const req = this.request();
    if (req.params.length === 0) {
      return [{ key: '', value: '', enabled: true }];
    }
    return req.params;
  }

  onParamsChange(params: KeyValue[]): void {
    this.workspace.updateRequestParams(this.request().id, params);
  }
}
