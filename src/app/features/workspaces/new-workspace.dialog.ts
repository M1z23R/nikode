import { Component, inject, signal } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';
import { CloudWorkspaceService } from '../../core/services/cloud-workspace.service';
import { Workspace } from '../../core/models/cloud.model';

@Component({
  selector: 'app-new-workspace-dialog',
  imports: [ModalComponent, ButtonComponent, InputComponent],
  template: `
    <ui-modal title="New Workspace" size="sm">
      <div class="form-group">
        <ui-input
          label="Workspace Name"
          [(value)]="name"
          placeholder="My Workspace"
          (keydown.enter)="submit()" />
      </div>

      @if (error()) {
        <div class="error-message">{{ error() }}</div>
      }

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="cancel()" [disabled]="isLoading()">Cancel</ui-button>
        <ui-button
          color="primary"
          (clicked)="submit()"
          [disabled]="!canSubmit() || isLoading()">
          @if (isLoading()) {
            Creating...
          } @else {
            Create
          }
        </ui-button>
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .form-group {
      margin-bottom: 1rem;
    }

    .error-message {
      color: var(--ui-danger);
      font-size: 0.8125rem;
      margin-top: 0.5rem;
    }
  `]
})
export class NewWorkspaceDialogComponent {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<Workspace | undefined>;
  private cloudWorkspaceService = inject(CloudWorkspaceService);

  name = signal('');
  isLoading = signal(false);
  error = signal<string | null>(null);

  canSubmit(): boolean {
    return this.name().trim().length > 0;
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  async submit(): Promise<void> {
    if (!this.canSubmit() || this.isLoading()) return;

    this.isLoading.set(true);
    this.error.set(null);

    try {
      const workspace = await this.cloudWorkspaceService.createWorkspace(this.name().trim());
      this.dialogRef.close(workspace);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      this.isLoading.set(false);
    }
  }
}
