import { Component, inject, signal, computed } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  DIALOG_REF,
  DialogRef,
  ToastService
} from '@m1z23r/ngx-ui';
import { TeamService } from '../../core/services/team.service';
import { Team, TeamMember } from '../../core/models/cloud.model';

type View = 'list' | 'create' | 'members';

@Component({
  selector: 'app-team-management-dialog',
  imports: [ModalComponent, ButtonComponent, InputComponent],
  template: `
    <ui-modal [title]="modalTitle()" size="md">
      @switch (view()) {
        @case ('list') {
          <div class="teams-list">
            @if (teamService.teams().length === 0) {
              <div class="empty-state">
                <p>You don't have any teams yet.</p>
                <ui-button color="primary" (clicked)="showCreateView()">
                  Create Team
                </ui-button>
              </div>
            } @else {
              @for (team of teamService.teams(); track team.id) {
                <div class="team-item">
                  <div class="team-info">
                    <span class="team-name">{{ team.name }}</span>
                    <span class="team-role">{{ team.role }}</span>
                  </div>
                  <div class="team-actions">
                    <ui-button variant="ghost" size="sm" (clicked)="viewMembers(team)">
                      Members
                    </ui-button>
                    @if (team.role === 'owner') {
                      <ui-button variant="ghost" size="sm" color="danger" (clicked)="deleteTeam(team)">
                        Delete
                      </ui-button>
                    } @else {
                      <ui-button variant="ghost" size="sm" (clicked)="leaveTeam(team)">
                        Leave
                      </ui-button>
                    }
                  </div>
                </div>
              }
              <div class="list-actions">
                <ui-button variant="outline" (clicked)="showCreateView()">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Create Team
                </ui-button>
              </div>
            }
          </div>
        }

        @case ('create') {
          <div class="create-form">
            <ui-input
              label="Team Name"
              [(value)]="newTeamName"
              placeholder="My Team"
              (keydown.enter)="createTeam()" />
          </div>
        }

        @case ('members') {
          <div class="members-view">
            @if (isLoadingMembers()) {
              <div class="loading-state">Loading members...</div>
            } @else {
              <div class="invite-section">
                <ui-input
                  label="Invite Member"
                  [(value)]="inviteEmail"
                  placeholder="user@example.com"
                  (keydown.enter)="inviteMember()" />
                <ui-button
                  color="primary"
                  (clicked)="inviteMember()"
                  [disabled]="!inviteEmail().trim() || isInviting()">
                  {{ isInviting() ? 'Inviting...' : 'Invite' }}
                </ui-button>
              </div>

              <div class="members-list">
                @for (member of members(); track member.id) {
                  <div class="member-item">
                    <div class="member-info">
                      @if (member.user.avatar) {
                        <img [src]="member.user.avatar" [alt]="member.user.name" class="member-avatar" />
                      } @else {
                        <div class="member-avatar-placeholder">
                          {{ getInitials(member.user.name) }}
                        </div>
                      }
                      <div class="member-details">
                        <span class="member-name">{{ member.user.name }}</span>
                        <span class="member-email">{{ member.user.email }}</span>
                      </div>
                    </div>
                    <div class="member-actions">
                      <span class="member-role">{{ member.role }}</span>
                      @if (selectedTeam()?.role === 'owner' && member.role !== 'owner') {
                        <ui-button variant="ghost" size="sm" color="danger" (clicked)="removeMember(member)">
                          Remove
                        </ui-button>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        }
      }

      @if (error()) {
        <div class="error-message">{{ error() }}</div>
      }

      <ng-container footer>
        @switch (view()) {
          @case ('list') {
            <ui-button variant="ghost" (clicked)="close()">Close</ui-button>
          }
          @case ('create') {
            <ui-button variant="ghost" (clicked)="showListView()" [disabled]="isCreating()">Back</ui-button>
            <ui-button
              color="primary"
              (clicked)="createTeam()"
              [disabled]="!newTeamName().trim() || isCreating()">
              {{ isCreating() ? 'Creating...' : 'Create Team' }}
            </ui-button>
          }
          @case ('members') {
            <ui-button variant="ghost" (clicked)="showListView()">Back</ui-button>
          }
        }
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .teams-list {
      min-height: 200px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 2rem;
      color: var(--ui-text-muted);
    }

    .team-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem;
      border-bottom: 1px solid var(--ui-border);

      &:last-child {
        border-bottom: none;
      }
    }

    .team-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .team-name {
      font-weight: 500;
    }

    .team-role {
      font-size: 0.75rem;
      color: var(--ui-text-muted);
      background: var(--ui-bg-secondary);
      padding: 0.125rem 0.375rem;
      border-radius: 3px;
    }

    .team-actions {
      display: flex;
      gap: 0.25rem;
    }

    .list-actions {
      display: flex;
      justify-content: center;
      padding: 1rem;
    }

    .create-form {
      padding: 1rem 0;
    }

    .members-view {
      min-height: 200px;
    }

    .invite-section {
      display: flex;
      gap: 0.5rem;
      align-items: flex-end;
      margin-bottom: 1rem;
    }

    .members-list {
      border: 1px solid var(--ui-border);
      border-radius: 6px;
    }

    .member-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem;
      border-bottom: 1px solid var(--ui-border);

      &:last-child {
        border-bottom: none;
      }
    }

    .member-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .member-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: cover;
    }

    .member-avatar-placeholder {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--ui-primary) 0%, var(--ui-accent) 100%);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .member-details {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .member-name {
      font-weight: 500;
      font-size: 0.875rem;
    }

    .member-email {
      font-size: 0.75rem;
      color: var(--ui-text-muted);
    }

    .member-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .member-role {
      font-size: 0.75rem;
      color: var(--ui-text-muted);
      background: var(--ui-bg-secondary);
      padding: 0.125rem 0.375rem;
      border-radius: 3px;
    }

    .loading-state {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      color: var(--ui-text-muted);
    }

    .error-message {
      color: var(--ui-danger);
      font-size: 0.8125rem;
      margin-top: 0.5rem;
      padding: 0 1rem;
    }
  `]
})
export class TeamManagementDialogComponent {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<void>;
  readonly teamService = inject(TeamService);
  private toastService = inject(ToastService);

  view = signal<View>('list');
  newTeamName = signal('');
  isCreating = signal(false);
  error = signal<string | null>(null);

  selectedTeam = signal<Team | null>(null);
  members = signal<TeamMember[]>([]);
  isLoadingMembers = signal(false);
  inviteEmail = signal('');
  isInviting = signal(false);

  modalTitle = computed(() => {
    switch (this.view()) {
      case 'list':
        return 'Manage Teams';
      case 'create':
        return 'Create Team';
      case 'members':
        return this.selectedTeam()?.name ?? 'Team Members';
    }
  });

  showListView(): void {
    this.view.set('list');
    this.error.set(null);
    this.selectedTeam.set(null);
    this.members.set([]);
  }

  showCreateView(): void {
    this.view.set('create');
    this.newTeamName.set('');
    this.error.set(null);
  }

  async viewMembers(team: Team): Promise<void> {
    this.selectedTeam.set(team);
    this.view.set('members');
    this.error.set(null);
    this.inviteEmail.set('');

    this.isLoadingMembers.set(true);
    try {
      const members = await this.teamService.getMembers(team.id);
      this.members.set(members);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      this.isLoadingMembers.set(false);
    }
  }

  async createTeam(): Promise<void> {
    if (!this.newTeamName().trim() || this.isCreating()) return;

    this.isCreating.set(true);
    this.error.set(null);

    try {
      await this.teamService.createTeam(this.newTeamName().trim());
      this.toastService.success('Team created successfully');
      this.showListView();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      this.isCreating.set(false);
    }
  }

  async deleteTeam(team: Team): Promise<void> {
    if (!confirm(`Are you sure you want to delete "${team.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await this.teamService.deleteTeam(team.id);
      this.toastService.success('Team deleted');
    } catch (err) {
      this.toastService.error(err instanceof Error ? err.message : 'Failed to delete team');
    }
  }

  async leaveTeam(team: Team): Promise<void> {
    if (!confirm(`Are you sure you want to leave "${team.name}"?`)) {
      return;
    }

    try {
      await this.teamService.leaveTeam(team.id);
      this.toastService.success('Left team');
    } catch (err) {
      this.toastService.error(err instanceof Error ? err.message : 'Failed to leave team');
    }
  }

  async inviteMember(): Promise<void> {
    const email = this.inviteEmail().trim();
    const team = this.selectedTeam();
    if (!email || !team || this.isInviting()) return;

    this.isInviting.set(true);
    this.error.set(null);

    try {
      await this.teamService.inviteMember(team.id, email);
      this.toastService.success('Invitation sent');
      this.inviteEmail.set('');
      // Reload members
      const members = await this.teamService.getMembers(team.id);
      this.members.set(members);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to invite member');
    } finally {
      this.isInviting.set(false);
    }
  }

  async removeMember(member: TeamMember): Promise<void> {
    const team = this.selectedTeam();
    if (!team) return;

    if (!confirm(`Are you sure you want to remove "${member.user.name}" from the team?`)) {
      return;
    }

    try {
      await this.teamService.removeMember(team.id, member.user_id);
      this.members.update(m => m.filter(x => x.id !== member.id));
      this.toastService.success('Member removed');
    } catch (err) {
      this.toastService.error(err instanceof Error ? err.message : 'Failed to remove member');
    }
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  close(): void {
    this.dialogRef.close();
  }
}
