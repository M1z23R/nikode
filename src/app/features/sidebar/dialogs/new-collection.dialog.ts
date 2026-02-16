import { Component, inject, signal, computed } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';
import { isIpcError } from '@shared/ipc-types';
import { ApiService } from '../../../core/services/api.service';

export interface NewCollectionDialogResult {
  path: string;
  name: string;
}

@Component({
  selector: 'app-new-collection-dialog',
  imports: [ModalComponent, ButtonComponent, InputComponent],
  template: `
    <ui-modal title="New Collection" size="sm">
      <div class="form-fields">
        <ui-input
          label="Collection Name"
          [(value)]="name"
          placeholder="My API Collection" />
        <div class="path-picker">
          <ui-input
            label="Location"
            [value]="path()"
            (valueChange)="path.set($any($event))"
            placeholder="/path/to/new/collection"
            hint="A nikode.json file will be created in this folder"
            (keydown.enter)="submit()" />
          <ui-button variant="ghost" (clicked)="browse()">Browse</ui-button>
        </div>
      </div>

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="cancel()">Cancel</ui-button>
        <ui-button color="primary" (clicked)="submit()" [disabled]="!isValid()">Create</ui-button>
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .form-fields {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .path-picker {
      display: flex;
      gap: 0.5rem;
      align-items: flex-end;
    }

    .path-picker ui-input {
      flex: 1;
    }

    .path-picker ui-button {
      margin-bottom: 1.25rem;
    }
  `]
})
export class NewCollectionDialogComponent {
  private api = inject(ApiService);
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<NewCollectionDialogResult | undefined>;

  name = signal('');
  path = signal('');

  isValid = computed(() => this.name().trim().length > 0 && this.path().trim().length > 0);

  async browse(): Promise<void> {
    const result = await this.api.showOpenDialog({
      title: 'Select Location for New Collection',
      properties: ['openDirectory', 'createDirectory']
    });

    if (isIpcError(result)) {
      return;
    }

    if (!result.data.canceled && result.data.filePaths.length > 0) {
      this.path.set(result.data.filePaths[0]);
    }
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  submit(): void {
    if (this.isValid()) {
      this.dialogRef.close({
        path: this.path().trim(),
        name: this.name().trim()
      });
    }
  }
}
