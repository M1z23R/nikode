import { Component, inject, signal } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';

@Component({
  selector: 'app-new-folder-dialog',
  imports: [ModalComponent, ButtonComponent, InputComponent],
  template: `
    <ui-modal title="New Folder" size="sm">
      <ui-input
        label="Folder Name"
        [(value)]="name"
        placeholder="Users"
        (keydown.enter)="submit()" />

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="cancel()">Cancel</ui-button>
        <ui-button color="primary" (clicked)="submit()" [disabled]="!name().trim()">Create</ui-button>
      </ng-container>
    </ui-modal>
  `
})
export class NewFolderDialogComponent {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<string | undefined>;

  name = signal('');

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  submit(): void {
    if (this.name().trim()) {
      this.dialogRef.close(this.name().trim());
    }
  }
}
