import { Component, inject, signal, computed } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  SelectComponent,
  OptionComponent,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';
import { isIpcError } from '@shared/ipc-types';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { CloudWorkspaceService } from '../../../core/services/cloud-workspace.service';
import { Workspace } from '../../../core/models/cloud.model';

export interface NewCollectionDialogResult {
  type: 'local' | 'cloud';
  name: string;
  path?: string;           // For local
  workspaceId?: string;    // For cloud
}

@Component({
  selector: 'app-new-collection-dialog',
  imports: [ModalComponent, ButtonComponent, InputComponent, SelectComponent, OptionComponent],
  template: `
    <ui-modal title="New Collection" size="sm">
      <div class="form-fields">
        <!-- Type selector -->
        <div class="type-selector">
          <button
            class="type-button"
            [class.active]="collectionType() === 'local'"
            (click)="collectionType.set('local')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            Local
          </button>
          <button
            class="type-button"
            [class.active]="collectionType() === 'cloud'"
            [class.disabled]="!canUseCloud()"
            (click)="canUseCloud() && collectionType.set('cloud')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
            </svg>
            Cloud
          </button>
        </div>

        @if (!canUseCloud() && collectionType() === 'local') {
          <p class="hint-text">Sign in to create cloud collections</p>
        }

        <ui-input
          label="Collection Name"
          [(value)]="name"
          placeholder="My API Collection" />

        @if (collectionType() === 'local') {
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
        } @else {
          <div class="form-group">
            <ui-select label="Workspace" [(value)]="selectedWorkspaceId">
              @for (workspace of workspaces(); track workspace.id) {
                <ui-option [value]="workspace.id">{{ workspace.name }}</ui-option>
              }
            </ui-select>
          </div>
        }
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

    .type-selector {
      display: flex;
      gap: 0.5rem;
    }

    .type-button {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border: 1px solid var(--ui-border);
      border-radius: 0.375rem;
      background: var(--ui-bg);
      color: var(--ui-text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
      font-size: 0.875rem;

      &:hover:not(.disabled) {
        border-color: var(--ui-primary);
        color: var(--ui-text);
      }

      &.active {
        border-color: var(--ui-primary);
        background: var(--ui-primary-subtle, rgba(59, 130, 246, 0.1));
        color: var(--ui-primary);
      }

      &.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .hint-text {
      margin: 0;
      font-size: 0.75rem;
      color: var(--ui-text-muted);
      text-align: center;
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

    .form-group {
      margin-bottom: 0;
    }
  `]
})
export class NewCollectionDialogComponent {
  private api = inject(ApiService);
  private authService = inject(AuthService);
  private cloudWorkspaceService = inject(CloudWorkspaceService);
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<NewCollectionDialogResult | undefined>;

  collectionType = signal<'local' | 'cloud'>('local');
  name = signal('');
  path = signal('');
  selectedWorkspaceId = signal('');

  workspaces = this.cloudWorkspaceService.workspaces;

  constructor() {
    // Initialize workspace selection
    const workspaceList = this.cloudWorkspaceService.workspaces();
    if (workspaceList.length > 0) {
      this.selectedWorkspaceId.set(workspaceList[0].id);
    }
  }

  canUseCloud(): boolean {
    return this.authService.isAuthenticated() && this.cloudWorkspaceService.workspaces().length > 0;
  }

  isValid = computed(() => {
    const nameValid = this.name().trim().length > 0;

    if (this.collectionType() === 'local') {
      return nameValid && this.path().trim().length > 0;
    } else {
      return nameValid && this.selectedWorkspaceId().length > 0;
    }
  });

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
      if (this.collectionType() === 'local') {
        this.dialogRef.close({
          type: 'local',
          name: this.name().trim(),
          path: this.path().trim()
        });
      } else {
        this.dialogRef.close({
          type: 'cloud',
          name: this.name().trim(),
          workspaceId: this.selectedWorkspaceId()
        });
      }
    }
  }
}
