import { Component, inject } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  DIALOG_DATA,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: 'primary' | 'danger';
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [ModalComponent, ButtonComponent],
  template: `
    <ui-modal [title]="data.title" size="sm">
      <p class="message">{{ data.message }}</p>

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="cancel()">
          {{ data.cancelLabel || 'Cancel' }}
        </ui-button>
        <ui-button [color]="data.confirmColor || 'primary'" (clicked)="confirm()">
          {{ data.confirmLabel || 'Confirm' }}
        </ui-button>
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .message {
      margin: 0;
      color: var(--ui-text);
      font-size: 0.875rem;
      line-height: 1.5;
    }
  `]
})
export class ConfirmDialogComponent {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<boolean>;
  readonly data = inject(DIALOG_DATA) as ConfirmDialogData;

  cancel(): void {
    this.dialogRef.close(false);
  }

  confirm(): void {
    this.dialogRef.close(true);
  }
}
