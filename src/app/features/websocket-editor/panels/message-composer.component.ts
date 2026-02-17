import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonComponent, TabsComponent, TabComponent, DialogService } from '@m1z23r/ngx-ui';
import { WebSocketService } from '../../../core/services/websocket.service';
import { OpenWebSocketConnection, WebSocketSavedMessage } from '../../../core/models/websocket.model';
import { InputDialogComponent, InputDialogData } from '../../../shared/dialogs/input.dialog';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/dialogs/confirm.dialog';

@Component({
  selector: 'app-message-composer',
  imports: [FormsModule, ButtonComponent, TabsComponent, TabComponent],
  template: `
    <div class="composer">
      <ui-tabs [activeTab]="activeTab()" (activeTabChange)="activeTab.set($any($event))" variant="underline">
        <ui-tab id="text" label="Text">
          <div class="compose-content">
            <textarea
              class="message-input"
              [ngModel]="textMessage()"
              (ngModelChange)="textMessage.set($event)"
              placeholder="Enter message to send..."
              rows="8"
            ></textarea>
            <div class="compose-actions">
              <ui-button
                color="primary"
                (clicked)="sendText()"
                [disabled]="!textMessage() || connection().status !== 'connected'">
                Send
              </ui-button>
              <ui-button
                variant="ghost"
                (clicked)="saveAsTemplate()"
                [disabled]="!textMessage()">
                Save as Template
              </ui-button>
            </div>
          </div>
        </ui-tab>
        <ui-tab id="binary" label="Binary">
          <div class="compose-content">
            <div class="binary-input-wrapper">
              <textarea
                class="message-input"
                [ngModel]="binaryMessage()"
                (ngModelChange)="binaryMessage.set($event)"
                placeholder="Enter base64-encoded binary data..."
                rows="8"
              ></textarea>
              <div class="binary-hint">Data should be base64-encoded</div>
            </div>
            <div class="compose-actions">
              <ui-button
                color="primary"
                (clicked)="sendBinary()"
                [disabled]="!binaryMessage() || connection().status !== 'connected'">
                Send Binary
              </ui-button>
            </div>
          </div>
        </ui-tab>
        <ui-tab id="saved" [label]="'Saved (' + connection().savedMessages.length + ')'">
          <div class="saved-content">
            @if (connection().savedMessages.length === 0) {
              <div class="empty-state">
                <p>No saved messages</p>
                <p class="hint">Save a message template from the Text tab</p>
              </div>
            } @else {
              <div class="saved-list">
                @for (saved of connection().savedMessages; track saved.id) {
                  <div class="saved-item">
                    <div class="saved-info">
                      <span class="saved-name">{{ saved.name }}</span>
                      <span class="saved-type">{{ saved.type }}</span>
                    </div>
                    <div class="saved-preview">{{ getPreview(saved.content) }}</div>
                    <div class="saved-actions">
                      <ui-button
                        size="sm"
                        (clicked)="sendSaved(saved)"
                        [disabled]="connection().status !== 'connected'">
                        Send
                      </ui-button>
                      <ui-button
                        size="sm"
                        variant="ghost"
                        (clicked)="loadSaved(saved)">
                        Load
                      </ui-button>
                      <ui-button
                        size="sm"
                        variant="ghost"
                        color="danger"
                        (clicked)="deleteSaved(saved)">
                        Delete
                      </ui-button>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </ui-tab>
      </ui-tabs>
    </div>
  `,
  styles: [`
    .composer {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .compose-content {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1rem;
      height: 100%;
    }

    .message-input {
      flex: 1;
      padding: 0.75rem;
      font-family: var(--ui-font-mono, ui-monospace, monospace);
      font-size: 0.875rem;
      line-height: 1.5;
      border: 1px solid var(--ui-border);
      border-radius: 6px;
      background-color: var(--ui-bg);
      color: var(--ui-text);
      resize: none;

      &:focus {
        outline: none;
        border-color: var(--ui-accent);
      }

      &::placeholder {
        color: var(--ui-text-muted);
      }
    }

    .binary-input-wrapper {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .binary-hint {
      font-size: 0.75rem;
      color: var(--ui-text-muted);
    }

    .compose-actions {
      display: flex;
      gap: 0.5rem;
    }

    .saved-content {
      height: 100%;
      overflow-y: auto;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--ui-text-muted);
      gap: 0.5rem;

      .hint {
        font-size: 0.75rem;
      }
    }

    .saved-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 1rem;
    }

    .saved-item {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 0.75rem;
      border: 1px solid var(--ui-border);
      border-radius: 6px;
      background-color: var(--ui-bg);

      &:hover {
        border-color: var(--ui-border-strong);
      }
    }

    .saved-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .saved-name {
      font-weight: 500;
    }

    .saved-type {
      font-size: 0.75rem;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      background-color: var(--ui-bg-secondary);
      color: var(--ui-text-muted);
    }

    .saved-preview {
      font-family: var(--ui-font-mono, ui-monospace, monospace);
      font-size: 0.75rem;
      color: var(--ui-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .saved-actions {
      display: flex;
      gap: 0.5rem;
    }
  `]
})
export class MessageComposerComponent {
  private webSocketService = inject(WebSocketService);
  private dialogService = inject(DialogService);

  connection = input.required<OpenWebSocketConnection>();

  activeTab = signal<string | number>('text');
  textMessage = signal('');
  binaryMessage = signal('');

  sendText(): void {
    const message = this.textMessage();
    if (!message) return;
    this.webSocketService.send(this.connection().id, 'text', message);
  }

  sendBinary(): void {
    const message = this.binaryMessage();
    if (!message) return;
    this.webSocketService.send(this.connection().id, 'binary', message);
  }

  async saveAsTemplate(): Promise<void> {
    const content = this.textMessage();
    if (!content) return;

    const ref = this.dialogService.open<InputDialogComponent, InputDialogData, string | undefined>(
      InputDialogComponent,
      {
        data: {
          title: 'Save Template',
          label: 'Template name',
          placeholder: 'My Template',
          submitLabel: 'Save'
        }
      }
    );

    const name = await ref.afterClosed();
    if (!name) return;

    const savedMessage: WebSocketSavedMessage = {
      id: `saved-${Date.now()}`,
      name,
      type: 'text',
      content,
    };

    this.webSocketService.saveMessage(this.connection().id, savedMessage);
  }

  sendSaved(saved: WebSocketSavedMessage): void {
    this.webSocketService.send(this.connection().id, saved.type, saved.content);
  }

  loadSaved(saved: WebSocketSavedMessage): void {
    if (saved.type === 'text') {
      this.textMessage.set(saved.content);
      this.activeTab.set('text');
    } else {
      this.binaryMessage.set(saved.content);
      this.activeTab.set('binary');
    }
  }

  async deleteSaved(saved: WebSocketSavedMessage): Promise<void> {
    const ref = this.dialogService.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Delete Template',
          message: `Are you sure you want to delete "${saved.name}"?`,
          confirmLabel: 'Delete',
          confirmColor: 'danger'
        }
      }
    );

    const confirmed = await ref.afterClosed();
    if (confirmed) {
      this.webSocketService.deleteSavedMessage(this.connection().id, saved.id);
    }
  }

  getPreview(content: string): string {
    return content.length > 100 ? content.substring(0, 100) + '...' : content;
  }
}
