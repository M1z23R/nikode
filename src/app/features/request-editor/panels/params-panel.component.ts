import { Component, Input, inject } from '@angular/core';
import { OpenRequest } from '../../../core/models/request.model';
import { KeyValue } from '../../../core/models/collection.model';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { KeyValueEditorComponent } from '../key-value-editor.component';

@Component({
  selector: 'app-params-panel',
  imports: [KeyValueEditorComponent],
  template: `
    <app-key-value-editor
      [items]="paramsWithDefault"
      keyPlaceholder="Parameter name"
      valuePlaceholder="Parameter value"
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
  @Input({ required: true }) request!: OpenRequest;

  private workspace = inject(WorkspaceService);

  get paramsWithDefault(): KeyValue[] {
    if (this.request.params.length === 0) {
      return [{ key: '', value: '', enabled: true }];
    }
    return this.request.params;
  }

  onParamsChange(params: KeyValue[]): void {
    this.workspace.updateRequestParams(this.request.id, params);
  }
}
