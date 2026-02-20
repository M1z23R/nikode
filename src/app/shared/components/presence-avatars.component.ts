import { Component, computed, inject, output, input } from '@angular/core';
import { RealtimeService, OnlineUser } from '../../core/services/realtime.service';
import { CloudWorkspaceService } from '../../core/services/cloud-workspace.service';
import { AuthService } from '../../core/services/auth.service';
import { TooltipDirective } from '@m1z23r/ngx-ui';

@Component({
  selector: 'app-presence-avatars',
  imports: [TooltipDirective],
  template: `
    @if (showChatToggle()) {
      <button class="chat-toggle" (click)="chatToggle.emit()" [uiTooltip]="tooltip()">
        @if (onlineUsers().length > 0) {
          <div class="presence-avatars">
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
        } @else {
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        }
        @if (unreadCount() > 0) {
          <span class="unread-badge">{{ unreadCount() > 99 ? '99+' : unreadCount() }}</span>
        }
      </button>
    } @else if (onlineUsers().length > 0) {
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
    .chat-toggle {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.25rem 0.5rem;
      border: none;
      background: transparent;
      border-radius: 4px;
      cursor: pointer;
      color: var(--ui-text-muted);
      transition: background-color 0.15s, color 0.15s;
      min-width: 28px;
      height: 28px;

      &:hover {
        background-color: var(--ui-bg-hover);
        color: var(--ui-text);
      }
    }

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

    .unread-badge {
      position: absolute;
      top: 0;
      right: 0;
      min-width: 14px;
      height: 14px;
      padding: 0 4px;
      border-radius: 7px;
      background-color: var(--ui-error);
      color: white;
      font-size: 0.625rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
  `]
})
export class PresenceAvatarsComponent {
  private realtime = inject(RealtimeService);
  private cloudWorkspace = inject(CloudWorkspaceService);
  private auth = inject(AuthService);

  showChatToggle = input(false);
  unreadCount = input(0);
  chatToggle = output();

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
    const isChatToggle = this.showChatToggle();

    if (users.length === 0) {
      return isChatToggle ? 'Toggle chat' : '';
    }

    let presenceText: string;
    if (users.length === 1) {
      presenceText = `${users[0].user_name} is online`;
    } else if (users.length <= 3) {
      const names = users.map(u => u.user_name);
      presenceText = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are online`;
    } else {
      presenceText = `${users.length} people online`;
    }

    return isChatToggle ? `${presenceText} - Click to toggle chat` : presenceText;
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
