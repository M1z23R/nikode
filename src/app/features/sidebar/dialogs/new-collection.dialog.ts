import { Component, inject, signal, computed } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  SelectComponent,
  OptionComponent,
  AsyncSearchFn,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';
import { isIpcError } from '@shared/ipc-types';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { CloudWorkspaceService } from '../../../core/services/cloud-workspace.service';
import { TemplateService } from '../../../core/services/template.service';

export interface NewCollectionDialogResult {
  type: 'local' | 'cloud';
  name: string;
  path?: string;           // For local
  workspaceId?: string;    // For cloud
  templateId?: string;     // For template-based creation
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

        <ui-select
          label="Start from template (optional)"
          placeholder="Search templates..."
          [(value)]="selectedTemplateId"
          [searchable]="true"
          [asyncSearch]="templateSearch"
        />

        @if (collectionType() === 'local') {
          <p class="hint-text">You'll choose a save location when you click Create</p>
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

    .form-group {
      margin-bottom: 0;
    }
  `]
})
export class NewCollectionDialogComponent {
  private api = inject(ApiService);
  private authService = inject(AuthService);
  private cloudWorkspaceService = inject(CloudWorkspaceService);
  private templateService = inject(TemplateService);
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<NewCollectionDialogResult | undefined>;

  collectionType = signal<'local' | 'cloud'>('local');
  name = signal('');
  selectedWorkspaceId = signal('');
  selectedTemplateId = signal<string | null>(null);

  workspaces = this.cloudWorkspaceService.workspaces;

  templateSearch: AsyncSearchFn<string> = async (query: string) => {
    const results = await this.templateService.search(query);
    return results.map(t => ({ value: t.id, label: t.name }));
  };

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
      return nameValid;
    } else {
      return nameValid && this.selectedWorkspaceId().length > 0;
    }
  });

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  async submit(): Promise<void> {
    if (!this.isValid()) return;

    if (this.collectionType() === 'local') {
      // Show native Save dialog so the user picks file location
      const name = this.name().trim();
      const defaultFileName = name.toLowerCase().replace(/\s+/g, '-') + '.nikode.json';

      const result = await this.api.showSaveDialog({
        title: 'Save New Collection',
        defaultPath: defaultFileName,
        filters: [
          { name: 'Nikode Collections', extensions: ['nikode.json'] }
        ]
      });

      if (isIpcError(result) || result.data.canceled || !result.data.filePath) {
        return;
      }

      this.dialogRef.close({
        type: 'local',
        name,
        path: result.data.filePath,
        templateId: this.selectedTemplateId() ?? undefined
      });
    } else {
      this.dialogRef.close({
        type: 'cloud',
        name: this.name().trim(),
        workspaceId: this.selectedWorkspaceId(),
        templateId: this.selectedTemplateId() ?? undefined
      });
    }
  }
}
