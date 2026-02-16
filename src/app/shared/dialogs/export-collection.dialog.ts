import { Component, inject, signal } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  RadioGroupComponent,
  RadioComponent,
  DIALOG_DATA,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';

export interface ExportCollectionDialogData {
  collectionName: string;
}

export type ExportFormat = 'json' | 'yaml' | 'openapi';

@Component({
  selector: 'app-export-collection-dialog',
  imports: [ModalComponent, ButtonComponent, RadioGroupComponent, RadioComponent],
  template: `
    <ui-modal title="Export Collection" size="sm">
      <p class="dialog-description">
        Export "{{ data.collectionName }}" to a file.
      </p>

      <ui-radio-group [(value)]="format" label="Format">
        <ui-radio value="json">JSON</ui-radio>
        <ui-radio value="yaml">YAML</ui-radio>
        <ui-radio value="openapi">OpenAPI 3.x</ui-radio>
      </ui-radio-group>

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="cancel()">Cancel</ui-button>
        <ui-button color="primary" (clicked)="submit()">Export</ui-button>
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .dialog-description {
      margin: 0 0 1rem 0;
      color: var(--ui-text-secondary);
      font-size: var(--ui-font-sm);
    }
  `]
})
export class ExportCollectionDialogComponent {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<ExportFormat | undefined>;
  readonly data = inject(DIALOG_DATA) as ExportCollectionDialogData;

  format = signal<ExportFormat>('json');

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  submit(): void {
    this.dialogRef.close(this.format());
  }
}
