import { Component, inject, signal, computed, effect, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonComponent, TooltipDirective } from '@m1z23r/ngx-ui';
import { ChatService } from '../../core/services/chat.service';
import { CloudWorkspaceService } from '../../core/services/cloud-workspace.service';
import { AuthService } from '../../core/services/auth.service';
import { ChatMessage } from '../../core/models/chat.model';

@Component({
  selector: 'app-chat-panel',
  imports: [FormsModule, ButtonComponent, TooltipDirective],
  template: `
    <div class="chat-panel">
      <div class="chat-header">
        <div class="chat-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>Chat</span>
          @if (activeWorkspace(); as ws) {
            <span class="workspace-name">{{ ws.name }}</span>
          }
        </div>
        <div class="chat-status">
          @if (isPendingKey()) {
            <span class="status-badge pending" uiTooltip="Waiting for encryption key from another member">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Waiting for key
            </span>
          } @else if (hasKey()) {
            <span class="status-badge encrypted" uiTooltip="End-to-end encrypted">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Encrypted
            </span>
          }
          @if (!chatService.isConnected()) {
            <span class="status-badge disconnected">Disconnected</span>
          }
        </div>
      </div>

      <div class="chat-messages" #messageContainer>
        @if (!activeWorkspace()) {
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p>Select a workspace to start chatting</p>
          </div>
        } @else if (messages().length === 0) {
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p>No messages yet</p>
            <span class="hint">Be the first to say hello!</span>
          </div>
        } @else {
          @for (message of messages(); track message.id) {
            <div class="message" [class.own]="isOwnMessage(message)" [class.decryption-error]="message.decryptError">
              @if (!isOwnMessage(message)) {
                <div class="message-avatar">
                  @if (message.avatar_url) {
                    <img [src]="message.avatar_url" [alt]="message.sender_name" />
                  } @else {
                    <div class="avatar-placeholder">{{ getInitials(message.sender_name) }}</div>
                  }
                </div>
              }
              <div class="message-content">
                @if (!isOwnMessage(message)) {
                  <div class="message-sender">{{ message.sender_name }}</div>
                }
                <div class="message-bubble">
                  @if (message.decryptError) {
                    <span class="decrypt-error">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      {{ message.decryptError }}
                    </span>
                  } @else {
                    {{ message.content }}
                  }
                </div>
                <div class="message-time">{{ formatTime(message.timestamp) }}</div>
              </div>
            </div>
          }
        }
      </div>

      <div class="chat-input">
        @if (activeWorkspace() && hasKey()) {
          <div class="input-wrapper">
            <textarea
              class="message-textarea"
              [(ngModel)]="messageText"
              placeholder="Type a message..."
              [disabled]="!chatService.isConnected() || sending()"
              (keydown.enter)="onEnterKey($any($event))"
              rows="1"
            ></textarea>
            <ui-button
              color="primary"
              size="sm"
              [disabled]="!canSend()"
              (clicked)="sendMessage()"
              uiTooltip="Send message">
              @if (sending()) {
                <svg class="spinning" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
              } @else {
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              }
            </ui-button>
          </div>
          @if (error()) {
            <div class="input-error">{{ error() }}</div>
          }
        } @else if (activeWorkspace() && isPendingKey()) {
          <div class="input-disabled">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span>Waiting for an existing member to share the encryption key...</span>
          </div>
        } @else if (!activeWorkspace()) {
          <div class="input-disabled">
            <span>Select a workspace to chat</span>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .chat-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      background-color: var(--ui-bg);
      border-left: 1px solid var(--ui-border);
    }

    .chat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--ui-border);
      background-color: var(--ui-bg-secondary);
      flex-shrink: 0;
    }

    .chat-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 600;
      font-size: 0.875rem;
    }

    .workspace-name {
      font-weight: 400;
      color: var(--ui-text-muted);
      padding-left: 0.5rem;
      border-left: 1px solid var(--ui-border);
    }

    .chat-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .status-badge {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      background-color: var(--ui-bg-tertiary);
      color: var(--ui-text-muted);
    }

    .status-badge.encrypted {
      background-color: rgba(16, 185, 129, 0.15);
      color: var(--ui-success);
    }

    .status-badge.pending {
      background-color: rgba(245, 158, 11, 0.15);
      color: var(--ui-warning);
    }

    .status-badge.disconnected {
      background-color: rgba(239, 68, 68, 0.15);
      color: var(--ui-error);
    }

    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--ui-text-muted);
      gap: 0.5rem;
      text-align: center;

      p {
        font-size: 0.875rem;
      }

      .hint {
        font-size: 0.75rem;
      }
    }

    .message {
      display: flex;
      gap: 0.5rem;
      max-width: 85%;

      &.own {
        align-self: flex-end;
        flex-direction: row-reverse;
      }

      &.decryption-error .message-bubble {
        background-color: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
      }
    }

    .message-avatar {
      flex-shrink: 0;
      width: 32px;
      height: 32px;

      img {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
      }

      .avatar-placeholder {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background-color: var(--ui-primary);
        color: var(--ui-primary-text);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.75rem;
        font-weight: 600;
      }
    }

    .message-content {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .message-sender {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--ui-text-secondary);
    }

    .message-bubble {
      padding: 0.5rem 0.75rem;
      border-radius: 12px;
      background-color: var(--ui-bg-secondary);
      font-size: 0.875rem;
      word-break: break-word;
      white-space: pre-wrap;
    }

    .message.own .message-bubble {
      background-color: var(--ui-primary);
      color: var(--ui-primary-text);
    }

    .message-time {
      font-size: 0.625rem;
      color: var(--ui-text-muted);
    }

    .message.own .message-time {
      text-align: right;
    }

    .decrypt-error {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      color: var(--ui-error);
      font-style: italic;
    }

    .chat-input {
      padding: 0.75rem;
      border-top: 1px solid var(--ui-border);
      background-color: var(--ui-bg-secondary);
      flex-shrink: 0;
    }

    .input-wrapper {
      display: flex;
      gap: 0.5rem;
      align-items: flex-end;
    }

    .message-textarea {
      flex: 1;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--ui-border);
      border-radius: 8px;
      background-color: var(--ui-bg);
      color: var(--ui-text);
      font-size: 0.875rem;
      font-family: inherit;
      resize: none;
      min-height: 36px;
      max-height: 120px;
      outline: none;

      &:focus {
        border-color: var(--ui-accent);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      &::placeholder {
        color: var(--ui-text-muted);
      }
    }

    .input-disabled {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem;
      color: var(--ui-text-muted);
      font-size: 0.875rem;
      text-align: center;
    }

    .input-error {
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: var(--ui-error);
    }

    .spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `]
})
export class ChatPanelComponent implements AfterViewChecked {
  protected chatService = inject(ChatService);
  private cloudWorkspace = inject(CloudWorkspaceService);
  private authService = inject(AuthService);

  @ViewChild('messageContainer') private messageContainer!: ElementRef<HTMLDivElement>;

  protected messageText = signal('');
  protected sending = signal(false);
  protected error = signal<string | null>(null);
  private shouldScrollToBottom = false;
  private lastMessageCount = 0;

  protected activeWorkspace = this.cloudWorkspace.activeWorkspace;

  protected messages = computed(() => {
    const ws = this.activeWorkspace();
    if (!ws) return [];
    return this.chatService.getMessages(ws.id);
  });

  protected hasKey = computed(() => {
    const ws = this.activeWorkspace();
    if (!ws) return false;
    return this.chatService.workspaceHasKey(ws.id);
  });

  protected isPendingKey = computed(() => {
    const ws = this.activeWorkspace();
    if (!ws) return false;
    return this.chatService.pendingKeyRequests().has(ws.id);
  });

  protected canSend = computed(() => {
    return this.messageText().trim().length > 0 &&
           this.chatService.isConnected() &&
           this.hasKey() &&
           !this.sending();
  });

  constructor() {
    // Clear unread count when viewing chat
    effect(() => {
      const ws = this.activeWorkspace();
      if (ws) {
        this.chatService.clearUnreadCount(ws.id);
      }
    });

    // Auto-scroll when new messages arrive
    effect(() => {
      const msgs = this.messages();
      if (msgs.length > this.lastMessageCount) {
        this.shouldScrollToBottom = true;
        this.lastMessageCount = msgs.length;
      }
    });
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom && this.messageContainer) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  protected isOwnMessage(message: ChatMessage): boolean {
    const user = this.authService.user();
    return user?.id === message.sender_id;
  }

  protected getInitials(name: string): string {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  protected formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isYesterday) {
      return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
           ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  protected onEnterKey(event: KeyboardEvent): void {
    if (!event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  protected async sendMessage(): Promise<void> {
    const ws = this.activeWorkspace();
    const text = this.messageText().trim();

    if (!ws || !text || !this.canSend()) return;

    this.sending.set(true);
    this.error.set(null);

    try {
      await this.chatService.sendMessage(ws.id, text);
      this.messageText.set('');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      this.sending.set(false);
    }
  }

  private scrollToBottom(): void {
    if (this.messageContainer?.nativeElement) {
      const el = this.messageContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }
}
