import { Component, inject, computed } from '@angular/core';
import {
  DropdownComponent,
  DropdownItemComponent,
  DropdownDividerComponent,
  DropdownTriggerDirective,
  DialogService,
  ButtonComponent
} from '@m1z23r/ngx-ui';
import { AuthService } from '../../core/services/auth.service';
import { TeamService } from '../../core/services/team.service';
import { CloudWorkspaceService } from '../../core/services/cloud-workspace.service';
import { Workspace } from '../../core/models/cloud.model';
import { NewWorkspaceDialogComponent } from './new-workspace.dialog';
import { TeamManagementDialogComponent } from '../teams/team-management.dialog';

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

      @if (personalWorkspaces().length > 0) {
        <div class="dropdown-section-header">PERSONAL</div>
        @for (workspace of personalWorkspaces(); track workspace.id) {
          <ui-dropdown-item (clicked)="selectWorkspace(workspace)">
            <div class="workspace-item">
              <span>{{ workspace.name }}</span>
              @if (isActive(workspace)) {
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              }
            </div>
          </ui-dropdown-item>
        }
      }

      @for (group of teamWorkspaceGroups(); track group.teamId) {
        <div class="dropdown-section-header">TEAM: {{ group.teamName }}</div>
        @for (workspace of group.workspaces; track workspace.id) {
          <ui-dropdown-item (clicked)="selectWorkspace(workspace)">
            <div class="workspace-item">
              <span>{{ workspace.name }}</span>
              @if (isActive(workspace)) {
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              }
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

      <ui-dropdown-item (clicked)="openTeamManagement()">
        <div class="action-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <span>Manage Teams</span>
        </div>
      </ui-dropdown-item>
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

      svg {
        color: var(--ui-primary);
        flex-shrink: 0;
      }
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
  private teamService = inject(TeamService);
  private cloudWorkspaceService = inject(CloudWorkspaceService);

  readonly activeWorkspaceName = computed(() => {
    const active = this.cloudWorkspaceService.activeWorkspace();
    return active?.name ?? 'Select Workspace';
  });

  readonly personalWorkspaces = computed(() => {
    return this.cloudWorkspaceService.workspaces().filter(w => w.type === 'personal');
  });

  readonly teamWorkspaceGroups = computed(() => {
    const teams = this.teamService.teams();
    const workspaces = this.cloudWorkspaceService.workspaces().filter(w => w.type === 'team');

    return teams
      .map(team => ({
        teamId: team.id,
        teamName: team.name,
        workspaces: workspaces.filter(w => w.team_id === team.id)
      }))
      .filter(group => group.workspaces.length > 0);
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

  openTeamManagement(): void {
    this.dialogService.open<TeamManagementDialogComponent, void, void>(
      TeamManagementDialogComponent
    );
  }
}
