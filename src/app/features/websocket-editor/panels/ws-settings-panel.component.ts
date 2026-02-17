import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CheckboxComponent, ButtonComponent } from '@m1z23r/ngx-ui';
import { WebSocketService } from '../../../core/services/websocket.service';
import { OpenWebSocketConnection } from '../../../core/models/websocket.model';

@Component({
  selector: 'app-ws-settings-panel',
  imports: [FormsModule, CheckboxComponent, ButtonComponent],
  template: `
    <div class="settings-panel">
      <div class="setting-group">
        <label class="setting-label">Subprotocols</label>
        <div class="protocols-list">
          @for (protocol of connection().protocols; track $index; let i = $index) {
            <div class="protocol-item">
              <input
                type="text"
                class="protocol-input"
                [ngModel]="protocol"
                (ngModelChange)="updateProtocol(i, $event)"
                placeholder="Protocol name"
              />
              <ui-button variant="ghost" size="sm" (clicked)="removeProtocol(i)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </ui-button>
            </div>
          }
          <ui-button variant="ghost" size="sm" class="add-btn" (clicked)="addProtocol()">
            Add Protocol
          </ui-button>
        </div>
        <div class="setting-hint">
          Subprotocols for the WebSocket handshake (e.g., graphql-ws, soap)
        </div>
      </div>

      <div class="setting-group">
        <label class="setting-label">Auto-Reconnect</label>
        <div class="setting-row">
          <ui-checkbox
            [checked]="connection().autoReconnect"
            (checkedChange)="updateAutoReconnect($event)"
            label="Automatically reconnect on disconnect"
          />
        </div>
      </div>

      @if (connection().autoReconnect) {
        <div class="setting-group">
          <label class="setting-label">Reconnect Interval (ms)</label>
          <input
            type="number"
            class="number-input"
            [ngModel]="connection().reconnectInterval"
            (ngModelChange)="updateReconnectInterval($event)"
            min="1000"
            step="1000"
          />
          <div class="setting-hint">
            Time to wait before attempting to reconnect (minimum 1000ms)
          </div>
        </div>
      }

      @if (connection().status === 'connected') {
        <div class="warning">
          Some settings can only be changed when disconnected.
        </div>
      }
    </div>
  `,
  styles: [`
    .settings-panel {
      padding: 1rem;
      height: 100%;
      overflow-y: auto;
    }

    .setting-group {
      margin-bottom: 1.5rem;
    }

    .setting-label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 0.5rem;
    }

    .setting-row {
      margin-bottom: 0.5rem;
    }

    .setting-hint {
      font-size: 0.75rem;
      color: var(--ui-text-muted);
      margin-top: 0.25rem;
    }

    .protocols-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .protocol-item {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .protocol-input {
      flex: 1;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--ui-border);
      border-radius: 6px;
      background-color: var(--ui-bg);
      color: var(--ui-text);
      font-size: 0.875rem;

      &:focus {
        outline: none;
        border-color: var(--ui-accent);
      }
    }

    .number-input {
      width: 150px;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--ui-border);
      border-radius: 6px;
      background-color: var(--ui-bg);
      color: var(--ui-text);
      font-size: 0.875rem;

      &:focus {
        outline: none;
        border-color: var(--ui-accent);
      }
    }

    .add-btn {
      align-self: flex-start;
    }

    .warning {
      margin-top: 1rem;
      padding: 0.5rem 0.75rem;
      background-color: rgba(245, 158, 11, 0.1);
      border-radius: 4px;
      color: var(--ui-warning);
      font-size: 0.75rem;
    }
  `]
})
export class WsSettingsPanelComponent {
  private webSocketService = inject(WebSocketService);

  connection = input.required<OpenWebSocketConnection>();

  addProtocol(): void {
    if (this.connection().status === 'connected') return;
    const protocols = [...this.connection().protocols, ''];
    this.webSocketService.updateConnection(this.connection().id, { protocols });
  }

  updateProtocol(index: number, value: string): void {
    if (this.connection().status === 'connected') return;
    const protocols = [...this.connection().protocols];
    protocols[index] = value;
    this.webSocketService.updateConnection(this.connection().id, { protocols });
  }

  removeProtocol(index: number): void {
    if (this.connection().status === 'connected') return;
    const protocols = this.connection().protocols.filter((_, i) => i !== index);
    this.webSocketService.updateConnection(this.connection().id, { protocols });
  }

  updateAutoReconnect(autoReconnect: boolean): void {
    this.webSocketService.updateConnection(this.connection().id, { autoReconnect });
  }

  updateReconnectInterval(interval: number): void {
    const reconnectInterval = Math.max(1000, interval);
    this.webSocketService.updateConnection(this.connection().id, { reconnectInterval });
  }
}
