import { Component, inject, input } from '@angular/core';
import { WebSocketService } from '../../../core/services/websocket.service';
import { OpenWebSocketConnection } from '../../../core/models/websocket.model';
import { KeyValue } from '../../../core/models/collection.model';
import { KeyValueEditorComponent } from '../../request-editor/key-value-editor.component';

@Component({
  selector: 'app-ws-headers-panel',
  imports: [KeyValueEditorComponent],
  template: `
    <div class="headers-panel">
      <app-key-value-editor
        [items]="connection().headers"        (itemsChange)="onHeadersChange($event)"
        keyPlaceholder="Header name"
        valuePlaceholder="Header value"
        [collectionPath]="connection().collectionPath"
      />
      @if (connection().status === 'connected') {
        <div class="warning">
          Headers can only be changed when disconnected.
        </div>
      }
    </div>
  `,
  styles: [`
    .headers-panel {
      padding: 1rem;
      height: 100%;
      overflow-y: auto;
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
export class WsHeadersPanelComponent {
  private webSocketService = inject(WebSocketService);

  connection = input.required<OpenWebSocketConnection>();

  onHeadersChange(headers: KeyValue[]): void {
    if (this.connection().status === 'connected') return;
    this.webSocketService.updateConnection(this.connection().id, { headers });
  }
}
