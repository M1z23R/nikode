import { Component, computed, inject } from '@angular/core';
import { RealtimeService, OnlineUser } from '../../core/services/realtime.service';
import { CloudWorkspaceService } from '../../core/services/cloud-workspace.service';
import { AuthService } from '../../core/services/auth.service';
import { TooltipDirective } from '@m1z23r/ngx-ui';

@Component({
  selector: 'app-presence-avatars',
  imports: [TooltipDirective],
  template: `
    @if (onlineUsers().length > 0) {
      <div class="presence-avatars" [uiTooltip]="tooltip()">
        @for (user of displayedUsers(); track user.user_id) {
          <div class="avatar">
            @if (user.avatar_url) {
              <img [src]="user.avatar_url" [alt]="user.user_name" />
            } @else {
              <span class="initials">{{ getInitials(user.user_name) }}</span>
            }
          </div>
        }
        @if (overflowCount() > 0) {
          <div class="avatar overflow">
            <span class="initials">+{{ overflowCount() }}</span>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .presence-avatars {
      display: flex;
      align-items: center;
      padding: 0 0.25rem;
    }

    .avatar {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 1.5px solid var(--ui-bg-secondary);
      background-color: var(--ui-bg-tertiary);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      margin-left: -4px;

      &:first-child {
        margin-left: 0;
      }

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .initials {
        font-size: 0.5rem;
        font-weight: 600;
        color: var(--ui-text-muted);
        text-transform: uppercase;
      }

      &.overflow {
        background-color: var(--ui-bg-hover);
      }
    }
  `]
})
export class PresenceAvatarsComponent {
  private realtime = inject(RealtimeService);
  private cloudWorkspace = inject(CloudWorkspaceService);
  private auth = inject(AuthService);

  private maxDisplay = 4;

  protected onlineUsers = computed(() => {
    const workspace = this.cloudWorkspace.activeWorkspace();
    if (!workspace) return [];

    const currentUserId = this.auth.user()?.id;
    const presenceMap = this.realtime.presence();
    return (presenceMap.get(workspace.id) ?? [])
      .filter(u => u.user_id !== currentUserId); // Exclude self
  });

  protected displayedUsers = computed(() => {
    return this.onlineUsers().slice(0, this.maxDisplay);
  });

  protected overflowCount = computed(() => {
    return Math.max(0, this.onlineUsers().length - this.maxDisplay);
  });

  protected tooltip = computed(() => {
    const users = this.onlineUsers();
    if (users.length === 0) return '';
    if (users.length === 1) return `${users[0].user_name} is online`;
    if (users.length <= 3) {
      const names = users.map(u => u.user_name);
      return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are online`;
    }
    return `${users.length} people online`;
  });

  protected getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].substring(0, 2);
    }
    return parts[0][0] + parts[parts.length - 1][0];
  }
}
