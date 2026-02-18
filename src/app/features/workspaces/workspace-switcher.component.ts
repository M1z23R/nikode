import { Component, inject, computed } from '@angular/core';
import {
  DropdownComponent,
  DropdownItemComponent,
  DropdownDividerComponent,
  DropdownTriggerDirective,
  DialogService,
  ButtonComponent,
  ToastService
} from '@m1z23r/ngx-ui';
import { CloudWorkspaceService } from '../../core/services/cloud-workspace.service';
import { Workspace } from '../../core/models/cloud.model';
import { NewWorkspaceDialogComponent } from './new-workspace.dialog';
import { WorkspaceMembersDialogComponent } from './workspace-members.dialog';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/dialogs/confirm.dialog';
import { InputDialogComponent, InputDialogData } from '../../shared/dialogs/input.dialog';

@Component({
  selector: 'app-workspace-switcher',
  imports: [
    DropdownComponent,
    DropdownItemComponent,
    DropdownDividerComponent,
    DropdownTriggerDirective,
    ButtonComponent
  ],
  template: `
    <ui-dropdown [closeOnSelect]="true">
      <ui-button uiDropdownTrigger variant="default" color="primary" size="sm">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span class="workspace-name">{{ activeWorkspaceName() }}</span>
        <svg class="chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </ui-button>

      @if (ownedWorkspaces().length > 0) {
        <div class="dropdown-section-header">OWNED</div>
        @for (workspace of ownedWorkspaces(); track workspace.id) {
          <ui-dropdown-item (clicked)="selectWorkspace(workspace)">
            <div class="workspace-item" [class.workspace-item--active]="isActive(workspace)">
              <span>{{ workspace.name }}</span>
              <div class="workspace-item-actions">
                <ui-dropdown class="workspace-actions" [closeOnSelect]="true">
                  <span
                    uiDropdownTrigger
                    class="workspace-dots"
                    (click)="onActionsClick($event)"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="5" cy="12" r="2"/>
                      <circle cx="12" cy="12" r="2"/>
                      <circle cx="19" cy="12" r="2"/>
                    </svg>
                  </span>
                  <ui-dropdown-item (clicked)="renameWorkspace(workspace)">Rename</ui-dropdown-item>
                  <ui-dropdown-item (clicked)="deleteWorkspace(workspace)">
                    <span class="danger-text">Delete</span>
                  </ui-dropdown-item>
                </ui-dropdown>
              </div>
            </div>
          </ui-dropdown-item>
        }
      }

      @if (sharedWorkspaces().length > 0) {
        <div class="dropdown-section-header">SHARED WITH ME</div>
        @for (workspace of sharedWorkspaces(); track workspace.id) {
          <ui-dropdown-item (clicked)="selectWorkspace(workspace)">
            <div class="workspace-item" [class.workspace-item--active]="isActive(workspace)">
              <span>{{ workspace.name }}</span>
              <div class="workspace-item-actions">
                <ui-dropdown class="workspace-actions" [closeOnSelect]="true">
                  <span
                    uiDropdownTrigger
                    class="workspace-dots"
                    (click)="onActionsClick($event)"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="5" cy="12" r="2"/>
                      <circle cx="12" cy="12" r="2"/>
                      <circle cx="19" cy="12" r="2"/>
                    </svg>
                  </span>
                  <ui-dropdown-item (clicked)="leaveWorkspace(workspace)">
                    <span class="danger-text">Leave</span>
                  </ui-dropdown-item>
                </ui-dropdown>
              </div>
            </div>
          </ui-dropdown-item>
        }
      }

      <ui-dropdown-divider />

      <ui-dropdown-item (clicked)="openNewWorkspaceDialog()">
        <div class="action-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span>New Workspace</span>
        </div>
      </ui-dropdown-item>

      @if (cloudWorkspaceService.activeWorkspace()) {
        <ui-dropdown-item (clicked)="openMembersDialog()">
          <div class="action-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>Manage Members</span>
          </div>
        </ui-dropdown-item>
      }
    </ui-dropdown>
  `,
  styles: [`
    :host {
      display: flex;
      align-items: center;
    }

    .workspace-name {
      max-width: 150px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dropdown-section-header {
      padding: 0.5rem 0.75rem;
      font-size: 0.6875rem;
      font-weight: 600;
      color: var(--ui-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .workspace-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      width: 100%;

      &--active span:first-child {
        font-weight: 600;
      }
    }

    .workspace-item-actions {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      flex-shrink: 0;
    }

    .workspace-dots {
      display: flex;
      align-items: center;
      cursor: pointer;
      color: var(--ui-text-muted);

      &:hover {
        color: var(--ui-text);
      }
    }

    .danger-text {
      color: var(--ui-danger);
    }

    .action-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
  `]
})
export class WorkspaceSwitcherComponent {
  private dialogService = inject(DialogService);
  private toastService = inject(ToastService);
  readonly cloudWorkspaceService = inject(CloudWorkspaceService);

  readonly activeWorkspaceName = computed(() => {
    const active = this.cloudWorkspaceService.activeWorkspace();
    return active?.name ?? 'Select Workspace';
  });

  readonly ownedWorkspaces = computed(() => {
    return this.cloudWorkspaceService.workspaces().filter(w => w.role === 'owner');
  });

  readonly sharedWorkspaces = computed(() => {
    return this.cloudWorkspaceService.workspaces().filter(w => w.role === 'member');
  });

  isActive(workspace: Workspace): boolean {
    return this.cloudWorkspaceService.activeWorkspace()?.id === workspace.id;
  }

  async selectWorkspace(workspace: Workspace): Promise<void> {
    await this.cloudWorkspaceService.selectWorkspace(workspace);
  }

  async openNewWorkspaceDialog(): Promise<void> {
    const ref = this.dialogService.open<NewWorkspaceDialogComponent, void, Workspace | undefined>(
      NewWorkspaceDialogComponent
    );
    await ref.afterClosed();
  }

  openMembersDialog(): void {
    const activeWorkspace = this.cloudWorkspaceService.activeWorkspace();
    if (!activeWorkspace) return;

    this.dialogService.open<WorkspaceMembersDialogComponent, { workspace: Workspace }, void>(
      WorkspaceMembersDialogComponent,
      { data: { workspace: activeWorkspace } }
    );
  }

  onActionsClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  async deleteWorkspace(workspace: Workspace): Promise<void> {
    const ref = this.dialogService.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Delete Workspace',
          message: `Are you sure you want to delete "${workspace.name}"? This action cannot be undone.`,
          confirmLabel: 'Delete',
          confirmColor: 'danger'
        }
      }
    );
    const confirmed = await ref.afterClosed();
    if (!confirmed) return;

    try {
      await this.cloudWorkspaceService.deleteWorkspace(workspace.id);
      this.toastService.success(`Workspace "${workspace.name}" deleted`);
    } catch (e: any) {
      this.toastService.error(e?.message ?? 'Failed to delete workspace');
    }
  }

  async leaveWorkspace(workspace: Workspace): Promise<void> {
    const ref = this.dialogService.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Leave Workspace',
          message: `Are you sure you want to leave "${workspace.name}"?`,
          confirmLabel: 'Leave',
          confirmColor: 'danger'
        }
      }
    );
    const confirmed = await ref.afterClosed();
    if (!confirmed) return;

    try {
      await this.cloudWorkspaceService.leaveWorkspace(workspace.id);
      this.toastService.success(`Left workspace "${workspace.name}"`);
    } catch (e: any) {
      this.toastService.error(e?.message ?? 'Failed to leave workspace');
    }
  }

  async renameWorkspace(workspace: Workspace): Promise<void> {
    const ref = this.dialogService.open<InputDialogComponent, InputDialogData, string | undefined>(
      InputDialogComponent,
      {
        data: {
          title: 'Rename Workspace',
          label: 'Name',
          initialValue: workspace.name,
          submitLabel: 'Rename'
        }
      }
    );
    const newName = await ref.afterClosed();
    if (!newName || newName === workspace.name) return;

    try {
      await this.cloudWorkspaceService.updateWorkspace(workspace.id, newName);
      this.toastService.success(`Workspace renamed to "${newName}"`);
    } catch (e: any) {
      this.toastService.error(e?.message ?? 'Failed to rename workspace');
    }
  }
}
