import { Component, inject, signal, OnInit } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  SelectComponent,
  OptionComponent,
  DIALOG_DATA,
  DIALOG_REF,
  DialogRef,
  DialogService,
  ToastService
} from '@m1z23r/ngx-ui';
import { CloudWorkspaceService } from '../../core/services/cloud-workspace.service';
import { CollectionService } from '../../core/services/collection.service';
import { UnifiedCollectionService } from '../../core/services/unified-collection.service';
import { ApiService } from '../../core/services/api.service';
import { CloudCollection } from '../../core/models/cloud.model';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/dialogs/confirm.dialog';

export interface PushToCloudDialogData {
  collectionPath: string;
  collectionName: string;
}

@Component({
  selector: 'app-push-to-cloud-dialog',
  imports: [ModalComponent, ButtonComponent, InputComponent, SelectComponent, OptionComponent],
  template: `
    <ui-modal title="Push to Cloud" size="sm">
      <div class="form-group">
        <ui-select label="Workspace" [(value)]="selectedWorkspaceId">
          @for (workspace of workspaces(); track workspace.id) {
            <ui-option [value]="workspace.id">{{ workspace.name }}</ui-option>
          }
        </ui-select>
      </div>

      <div class="form-group">
        <ui-input
          label="Collection Name"
          [(value)]="collectionName"
          placeholder="My Collection"
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
            Pushing...
          } @else {
            Push to Cloud
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
export class PushToCloudDialogComponent implements OnInit {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<CloudCollection | undefined>;
  readonly data = inject(DIALOG_DATA) as PushToCloudDialogData;
  private cloudWorkspaceService = inject(CloudWorkspaceService);
  private collectionService = inject(CollectionService);
  private unifiedCollectionService = inject(UnifiedCollectionService);
  private dialogService = inject(DialogService);
  private toastService = inject(ToastService);
  private api = inject(ApiService);

  selectedWorkspaceId = signal('');
  collectionName = signal('');
  isLoading = signal(false);
  error = signal<string | null>(null);

  workspaces = this.cloudWorkspaceService.workspaces;

  ngOnInit(): void {
    this.collectionName.set(this.data.collectionName);

    const workspaceList = this.cloudWorkspaceService.workspaces();
    if (workspaceList.length > 0) {
      this.selectedWorkspaceId.set(workspaceList[0].id);
    }
  }

  canSubmit(): boolean {
    return this.selectedWorkspaceId().length > 0 && this.collectionName().trim().length > 0;
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  async submit(): Promise<void> {
    if (!this.canSubmit() || this.isLoading()) return;

    this.isLoading.set(true);
    this.error.set(null);

    try {
      // Push the collection to cloud
      const collection = await this.cloudWorkspaceService.pushLocalToCloud(
        this.data.collectionPath,
        this.selectedWorkspaceId(),
        this.collectionName().trim()
      );

      this.toastService.success('Collection pushed to cloud');

      // Close the local collection (removes from recent)
      await this.collectionService.closeCollection(this.data.collectionPath);

      // Ask user if they want to delete the local file
      const confirmRef = this.dialogService.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
        ConfirmDialogComponent,
        {
          data: {
            title: 'Delete Local Collection?',
            message: 'The collection has been pushed to cloud. Would you like to delete the local collection file?',
            confirmLabel: 'Delete Local',
            cancelLabel: 'Keep Local'
          }
        }
      );

      const deleteLocal = await confirmRef.afterClosed();

      if (deleteLocal) {
        // Delete the local collection file
        await this.api.deleteCollection(this.data.collectionPath);
        this.toastService.info('Local collection file deleted');
      }

      // Expand the new cloud collection in the sidebar
      const newCloudId = this.unifiedCollectionService.buildCloudId(
        this.selectedWorkspaceId(),
        collection.id
      );
      this.unifiedCollectionService.setExpanded(newCloudId, true);

      this.dialogRef.close(collection);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to push collection');
    } finally {
      this.isLoading.set(false);
    }
  }
}
