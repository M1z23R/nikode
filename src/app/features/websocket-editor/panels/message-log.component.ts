import { Component, inject, input, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonComponent, AccordionComponent, AccordionItemComponent, AccordionHeaderDirective } from '@m1z23r/ngx-ui';
import { WebSocketService } from '../../../core/services/websocket.service';
import { OpenWebSocketConnection, WebSocketMessage } from '../../../core/models/websocket.model';

type MessageFilter = 'all' | 'sent' | 'received' | 'system';

@Component({
  selector: 'app-message-log',
  imports: [FormsModule, ButtonComponent, AccordionComponent, AccordionItemComponent, AccordionHeaderDirective],
  template: `
    <div class="message-log">
      <div class="log-toolbar">
        <div class="filter-buttons">
          <button
            class="filter-btn"
            [class.active]="filter() === 'all'"
            (click)="filter.set('all')">
            All
          </button>
          <button
            class="filter-btn"
            [class.active]="filter() === 'sent'"
            (click)="filter.set('sent')">
            Sent
          </button>
          <button
            class="filter-btn"
            [class.active]="filter() === 'received'"
            (click)="filter.set('received')">
            Received
          </button>
          <button
            class="filter-btn"
            [class.active]="filter() === 'system'"
            (click)="filter.set('system')">
            System
          </button>
        </div>
        <input
          type="text"
          class="search-input"
          [ngModel]="searchTerm()"
          (ngModelChange)="searchTerm.set($event)"
          placeholder="Search messages..."
        />
        <ui-button variant="ghost" size="sm" (clicked)="clearMessages()" title="Clear">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </ui-button>
      </div>

      <div class="log-content">
        @if (filteredMessages().length === 0) {
          <div class="empty-state">
            <p>No messages</p>
          </div>
        } @else {
          <ui-accordion>
            @for (message of filteredMessages(); track message.id) {
              <ui-accordion-item
                [class.sent]="message.direction === 'sent'"
                [class.received]="message.direction === 'received'"
                [class.system]="isSystemMessage(message)">
                <div *uiAccordionHeader class="message-header">
                  <span class="message-direction">
                    @if (message.direction === 'sent') {
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="19" x2="12" y2="5"/>
                        <polyline points="5 12 12 5 19 12"/>
                      </svg>
                    } @else {
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <polyline points="19 12 12 19 5 12"/>
                      </svg>
                    }
                  </span>
                  <span class="message-type" [class]="message.type">{{ getTypeLabel(message) }}</span>
                  <span class="message-time">{{ formatTime(message.timestamp) }}</span>
                  <span class="message-preview-text">{{ getPreview(message.data || message.error || getCloseText(message)) }}</span>
                  <span class="message-size">{{ formatSize(message.size) }}</span>
                </div>
                @if (message.data || message.error || message.closeCode !== undefined) {
                  <div class="message-content">
                    @if (message.error) {
                      <div class="error-text">{{ message.error }}</div>
                    } @else if (message.closeCode !== undefined) {
                      <div>Code: {{ message.closeCode }}{{ message.closeReason ? ' - ' + message.closeReason : '' }}</div>
                    } @else {
                      <pre class="message-full">{{ message.data }}</pre>
                    }
                  </div>
                }
              </ui-accordion-item>
            }
          </ui-accordion>
        }
      </div>
    </div>
  `,
  styles: [`
    .message-log {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }

    .log-toolbar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border-bottom: 1px solid var(--ui-border);
      flex-shrink: 0;
    }

    .filter-buttons {
      display: flex;
      gap: 0.25rem;
    }

    .filter-btn {
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--ui-border);
      border-radius: 4px;
      background: none;
      color: var(--ui-text-muted);
      font-size: 0.75rem;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background-color: var(--ui-bg-secondary);
        color: var(--ui-text);
      }

      &.active {
        background-color: var(--ui-primary);
        border-color: var(--ui-primary);
        color: var(--ui-primary-text);
      }
    }

    .search-input {
      flex: 1;
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--ui-border);
      border-radius: 4px;
      background-color: var(--ui-bg);
      color: var(--ui-text);
      font-size: 0.75rem;

      &:focus {
        outline: none;
        border-color: var(--ui-accent);
      }
    }

    .log-content {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 0.5rem;
    }

    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--ui-text-muted);
      font-size: 0.875rem;
    }

    ui-accordion-item {
      margin-bottom: 0.25rem;

      &.sent {
        --accordion-border-color: var(--ui-success);
      }

      &.received {
        --accordion-border-color: var(--ui-accent);
      }

      &.system {
        --accordion-border-color: var(--ui-text-muted);
        opacity: 0.8;
      }
    }

    .message-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      width: 100%;
    }

    .message-direction {
      display: flex;
      align-items: center;
      color: var(--ui-text-muted);
      flex-shrink: 0;
    }

    .message-type {
      padding: 0.125rem 0.25rem;
      border-radius: 2px;
      background-color: var(--ui-bg-tertiary);
      font-size: 0.625rem;
      text-transform: uppercase;
      flex-shrink: 0;

      &.text { color: var(--ui-success); }
      &.binary { color: var(--ui-warning); }
      &.open { color: var(--ui-accent); }
      &.close { color: var(--ui-text-muted); }
      &.error { color: var(--ui-error); }
    }

    .message-time {
      color: var(--ui-text-muted);
      flex-shrink: 0;
    }

    .message-preview-text {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--ui-text-secondary);
      font-family: var(--ui-font-mono, ui-monospace, monospace);
    }

    .message-size {
      color: var(--ui-text-muted);
      flex-shrink: 0;
    }

    .message-content {
      padding: 0.75rem;
      background-color: var(--ui-bg);
      border-radius: 4px;
      font-family: var(--ui-font-mono, ui-monospace, monospace);
      font-size: 0.75rem;
    }

    .message-full {
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 300px;
      overflow-y: auto;
      margin: 0;
    }

    .error-text {
      color: var(--ui-error);
    }
  `]
})
export class MessageLogComponent {
  private webSocketService = inject(WebSocketService);

  connection = input.required<OpenWebSocketConnection>();

  filter = signal<MessageFilter>('all');
  searchTerm = signal('');

  filteredMessages = computed(() => {
    let messages = this.connection().messages;

    // Apply filter
    const f = this.filter();
    if (f === 'sent') {
      messages = messages.filter(m => m.direction === 'sent');
    } else if (f === 'received') {
      messages = messages.filter(m => m.direction === 'received' && !this.isSystemMessage(m));
    } else if (f === 'system') {
      messages = messages.filter(m => this.isSystemMessage(m));
    }

    // Apply search
    const term = this.searchTerm().toLowerCase();
    if (term) {
      messages = messages.filter(m =>
        m.data?.toLowerCase().includes(term) ||
        m.error?.toLowerCase().includes(term)
      );
    }

    // Return in reverse order (newest first)
    return [...messages].reverse();
  });

  isSystemMessage(message: WebSocketMessage): boolean {
    return ['open', 'close', 'error'].includes(message.type);
  }

  clearMessages(): void {
    this.webSocketService.clearMessages(this.connection().id);
  }

  formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  getTypeLabel(message: WebSocketMessage): string {
    switch (message.type) {
      case 'text': return 'TEXT';
      case 'binary': return 'BIN';
      case 'open': return 'OPEN';
      case 'close': return 'CLOSE';
      case 'error': return 'ERROR';
      default: return message.type;
    }
  }

  getPreview(data: string): string {
    if (!data) return '';
    const maxLength = 50;
    if (data.length <= maxLength) return data;
    return data.substring(0, maxLength) + '...';
  }

  getCloseText(message: WebSocketMessage): string {
    if (message.closeCode !== undefined) {
      return `Code: ${message.closeCode}${message.closeReason ? ' - ' + message.closeReason : ''}`;
    }
    return '';
  }
}
