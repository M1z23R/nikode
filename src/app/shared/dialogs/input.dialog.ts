import { Component, inject, signal, OnInit } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  DIALOG_DATA,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';

export interface InputDialogData {
  title: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
}

@Component({
  selector: 'app-input-dialog',
  imports: [ModalComponent, ButtonComponent, InputComponent],
  template: `
    <ui-modal [title]="data.title" size="sm">
      <ui-input
        [label]="data.label"
        [(value)]="value"
        [placeholder]="data.placeholder || ''"
        (keydown.enter)="submit()" />

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="cancel()">Cancel</ui-button>
        <ui-button color="primary" (clicked)="submit()" [disabled]="!value().trim()">
          {{ data.submitLabel || 'OK' }}
        </ui-button>
      </ng-container>
    </ui-modal>
  `
})
export class InputDialogComponent implements OnInit {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<string | undefined>;
  readonly data = inject(DIALOG_DATA) as InputDialogData;

  value = signal('');

  ngOnInit(): void {
    if (this.data.initialValue) {
      this.value.set(this.data.initialValue);
    }
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  submit(): void {
    if (this.value().trim()) {
      this.dialogRef.close(this.value().trim());
    }
  }
}
