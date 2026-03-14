import { Component, inject, signal, computed } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  SelectComponent,
  OptionComponent,
  RadioGroupComponent,
  RadioComponent,
  AsyncSearchFn,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';
import { isIpcError } from '@shared/ipc-types';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { CloudWorkspaceService } from '../../../core/services/cloud-workspace.service';
import { TemplateService } from '../../../core/services/template.service';

export type ImportFormat = 'new' | 'openapi' | 'postman' | 'bruno';
export type StorageType = 'local' | 'cloud';

export interface AddCollectionDialogResult {
  action: 'new' | 'import';
  storageType: StorageType;
  // For 'new' action
  name?: string;
  path?: string;
  workspaceId?: string;
  templateId?: string;
  // For 'import' action
  format?: ImportFormat;
  sourcePath?: string;
  targetPath?: string;
}

@Component({
  selector: 'app-add-collection-dialog',
  imports: [
    ModalComponent,
    ButtonComponent,
    InputComponent,
    SelectComponent,
    OptionComponent,
    RadioGroupComponent,
    RadioComponent
  ],
  template: `
    <ui-modal title="Add Collection" size="sm">
      <!-- Storage Type Toggle -->
      <div class="storage-toggle">
        <button
          class="toggle-button"
          [class.active]="storageType() === 'local'"
          (click)="storageType.set('local')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Local
        </button>
        <button
          class="toggle-button"
          [class.active]="storageType() === 'cloud'"
          [class.disabled]="!canUseCloud()"
          (click)="canUseCloud() && storageType.set('cloud')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
          </svg>
          Cloud
        </button>
      </div>

      @if (!canUseCloud() && storageType() === 'local') {
        <p class="hint-text">Sign in to create cloud collections</p>
      }

      @if (mode() === 'select') {
        <!-- Format Selection Grid -->
        <div class="format-grid">
          <button class="format-button" (click)="selectFormat('new')">
            <div class="format-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </div>
            <span class="format-label">New</span>
          </button>
          <button class="format-button" (click)="selectFormat('openapi')">
            <div class="format-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <span class="format-label">OpenAPI</span>
          </button>
          <button class="format-button" (click)="selectFormat('postman')">
            <div class="format-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
            </div>
            <span class="format-label">Postman</span>
          </button>
          <button class="format-button" (click)="selectFormat('bruno')">
            <div class="format-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
              </svg>
            </div>
            <span class="format-label">Bruno</span>
          </button>
        </div>
      } @else if (mode() === 'new') {
        <!-- New Collection Form -->
        <div class="form-fields">
          <ui-input
            label="Collection Name"
            [(value)]="name"
            placeholder="My API Collection" />

          <ui-select
            label="Start from template (optional)"
            placeholder="Search templates..."
            [cacheAsyncResults]="true"
            [initialLoad]="true"
            [(value)]="selectedTemplateId"
            [searchable]="true"
            [asyncSearch]="templateSearch"
          />

          @if (storageType() === 'cloud') {
            <ui-select label="Workspace" [(value)]="selectedWorkspaceId">
              @for (workspace of workspaces(); track workspace.id) {
                <ui-option [value]="workspace.id">{{ workspace.name }}</ui-option>
              }
            </ui-select>
          }
        </div>

        <ng-container footer>
          <ui-button variant="ghost" (clicked)="backToSelect()">Back</ui-button>
          <ui-button color="primary" (clicked)="createNew()" [disabled]="!isNewValid()">Create</ui-button>
        </ng-container>
      }

      @if (mode() === 'select') {
        <ng-container footer>
          <ui-button variant="ghost" (clicked)="cancel()">Cancel</ui-button>
        </ng-container>
      }
    </ui-modal>
  `,
  styles: [`
    .storage-toggle {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .toggle-button {
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
      margin: 0 0 1rem;
      font-size: 0.75rem;
      color: var(--ui-text-muted);
      text-align: center;
    }

    .format-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }

    .format-button {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 1.25rem 1rem;
      border: 1px solid var(--ui-border);
      border-radius: 0.5rem;
      background: var(--ui-bg);
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        border-color: var(--ui-primary);
        background: var(--ui-bg-hover);
      }
    }

    .format-icon {
      color: var(--ui-text-muted);
    }

    .format-button:hover .format-icon {
      color: var(--ui-primary);
    }

    .format-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--ui-text);
    }

    .form-fields {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
  `]
})
export class AddCollectionDialogComponent {
  private api = inject(ApiService);
  private authService = inject(AuthService);
  private cloudWorkspaceService = inject(CloudWorkspaceService);
  private templateService = inject(TemplateService);
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<AddCollectionDialogResult | undefined>;

  storageType = signal<StorageType>('local');
  mode = signal<'select' | 'new'>('select');
  name = signal('');
  selectedWorkspaceId = signal('');
  selectedTemplateId = signal<string | null>(null);

  workspaces = this.cloudWorkspaceService.workspaces;

  templateSearch: AsyncSearchFn<string> = async (query: string) => {
    const results = await this.templateService.search(query);
    return results.map(t => ({ value: t.id, label: t.name }));
  };

  constructor() {
    const workspaceList = this.cloudWorkspaceService.workspaces();
    if (workspaceList.length > 0) {
      this.selectedWorkspaceId.set(workspaceList[0].id);
    }
  }

  canUseCloud(): boolean {
    return this.authService.isAuthenticated() && this.cloudWorkspaceService.workspaces().length > 0;
  }

  isNewValid = computed(() => {
    const nameValid = this.name().trim().length > 0;
    if (this.storageType() === 'local') {
      return nameValid;
    }
    return nameValid && this.selectedWorkspaceId().length > 0;
  });

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  backToSelect(): void {
    this.mode.set('select');
  }

  async selectFormat(format: ImportFormat): Promise<void> {
    if (format === 'new') {
      this.mode.set('new');
      return;
    }

    // Close dialog and return format for import
    // The actual file picking happens in the sidebar/service
    this.dialogRef.close({
      action: 'import',
      storageType: this.storageType(),
      format
    });
  }

  async createNew(): Promise<void> {
    if (!this.isNewValid()) return;

    if (this.storageType() === 'local') {
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
        action: 'new',
        storageType: 'local',
        name,
        path: result.data.filePath,
        templateId: this.selectedTemplateId() ?? undefined
      });
    } else {
      this.dialogRef.close({
        action: 'new',
        storageType: 'cloud',
        name: this.name().trim(),
        workspaceId: this.selectedWorkspaceId(),
        templateId: this.selectedTemplateId() ?? undefined
      });
    }
  }
}

// Keep old export for backwards compatibility during migration
export { AddCollectionDialogComponent as OpenCollectionDialogComponent };
export type { AddCollectionDialogResult as OpenCollectionDialogResult };
