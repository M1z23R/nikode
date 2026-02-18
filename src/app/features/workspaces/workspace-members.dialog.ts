import { Component, inject, signal, computed, OnInit } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  DIALOG_DATA,
  DIALOG_REF,
  DialogRef,
  ToastService
} from '@m1z23r/ngx-ui';
import { CloudWorkspaceService } from '../../core/services/cloud-workspace.service';
import { Workspace, WorkspaceMember } from '../../core/models/cloud.model';

interface WorkspaceMembersDialogData {
  workspace: Workspace;
}

@Component({
  selector: 'app-workspace-members-dialog',
  imports: [ModalComponent, ButtonComponent, InputComponent],
  template: `
    <ui-modal [title]="modalTitle()" size="md">
      <div class="members-view">
        @if (isLoadingMembers()) {
          <div class="loading-state">Loading members...</div>
        } @else {
          @if (data.workspace.role === 'owner') {
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
          }

          @if (members().length === 0) {
            <div class="empty-state">No members yet</div>
          } @else {
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
                    @if (data.workspace.role === 'owner' && member.role !== 'owner') {
                      <ui-button variant="ghost" size="sm" color="danger" (clicked)="removeMember(member)">
                        Remove
                      </ui-button>
                    }
                  </div>
                </div>
              }
            </div>
          }
        }
      </div>

      @if (error()) {
        <div class="error-message">{{ error() }}</div>
      }

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="close()">Close</ui-button>
      </ng-container>
    </ui-modal>
  `,
  styles: [`
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

    .loading-state,
    .empty-state {
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
export class WorkspaceMembersDialogComponent implements OnInit {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<void>;
  readonly data = inject(DIALOG_DATA) as WorkspaceMembersDialogData;
  readonly workspaceService = inject(CloudWorkspaceService);
  private toastService = inject(ToastService);

  members = signal<WorkspaceMember[]>([]);
  isLoadingMembers = signal(false);
  inviteEmail = signal('');
  isInviting = signal(false);
  error = signal<string | null>(null);

  modalTitle = computed(() => `${this.data.workspace.name} - Members`);

  ngOnInit(): void {
    this.loadMembers();
  }

  async loadMembers(): Promise<void> {
    this.isLoadingMembers.set(true);
    try {
      const members = await this.workspaceService.getMembers(this.data.workspace.id);
      this.members.set(members);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      this.isLoadingMembers.set(false);
    }
  }

  async inviteMember(): Promise<void> {
    const email = this.inviteEmail().trim();
    if (!email || this.isInviting()) return;

    this.isInviting.set(true);
    this.error.set(null);

    try {
      await this.workspaceService.inviteMember(this.data.workspace.id, email);
      this.toastService.success('Invitation sent');
      this.inviteEmail.set('');
      await this.loadMembers();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to invite member');
    } finally {
      this.isInviting.set(false);
    }
  }

  async removeMember(member: WorkspaceMember): Promise<void> {
    if (!confirm(`Are you sure you want to remove "${member.user.name}" from this workspace?`)) {
      return;
    }

    try {
      await this.workspaceService.removeMember(this.data.workspace.id, member.user_id);
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
