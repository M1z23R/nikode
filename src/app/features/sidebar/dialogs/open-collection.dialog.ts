import { Component, inject, signal } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  RadioGroupComponent,
  RadioComponent,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';

export type OpenMode = 'folder' | 'file';

export interface OpenCollectionDialogResult {
  mode: OpenMode;
}

@Component({
  selector: 'app-open-collection-dialog',
  imports: [ModalComponent, ButtonComponent, RadioGroupComponent, RadioComponent],
  template: `
    <ui-modal title="Open Collection" size="sm">
      <ui-radio-group [(value)]="mode" label="">
        <ui-radio value="folder">
          <div class="option">
            <span class="option-title">Open Folder</span>
            <span class="option-description">Open an existing Nikode collection</span>
          </div>
        </ui-radio>
        <ui-radio value="file">
          <div class="option">
            <span class="option-title">Import File</span>
            <span class="option-description">Import from JSON, YAML, or OpenAPI</span>
          </div>
        </ui-radio>
      </ui-radio-group>

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="cancel()">Cancel</ui-button>
        <ui-button color="primary" (clicked)="submit()">Continue</ui-button>
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .option {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .option-title {
      font-weight: 500;
    }

    .option-description {
      font-size: var(--ui-font-xs);
      color: var(--ui-text-muted);
    }
  `]
})
export class OpenCollectionDialogComponent {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<OpenCollectionDialogResult | undefined>;

  mode = signal<OpenMode>('folder');

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  submit(): void {
    this.dialogRef.close({ mode: this.mode() });
  }
}
