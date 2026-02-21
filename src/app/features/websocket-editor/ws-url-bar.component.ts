import { Component, inject, input } from '@angular/core';
import { ButtonComponent } from '@m1z23r/ngx-ui';
import { WebSocketService } from '../../core/services/websocket.service';
import { OpenWebSocketConnection } from '../../core/models/websocket.model';
import { TemplateInputWrapperComponent } from '../../shared/components/template-input-wrapper.component';

@Component({
  selector: 'app-ws-url-bar',
  imports: [ButtonComponent, TemplateInputWrapperComponent],
  template: `
    <div class="url-bar">
      <app-template-input
        class="url-input"
        [value]="connection().url"
        (valueChange)="onUrlChange($event)"
        placeholder="wss://nikode.dimitrije.dev/api/v1/ws"
        [disabled]="connection().status === 'connected'"
        [collectionPath]="connection().collectionPath">
        <ng-template #suffix>
          <div class="suffix-buttons">
          <ui-button
            variant="ghost"
            size="sm"
            (clicked)="save()"
            [disabled]="!connection().dirty"
            title="Save">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
          </ui-button>
          @if (connection().status === 'connected') {
            <ui-button
              variant="ghost"
              size="sm"
              color="danger"
              (clicked)="disconnect()"
              title="Disconnect">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ui-success, #22c55e)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 17H7A5 5 0 0 1 7 7"/>
                <path d="M15 7h2a5 5 0 0 1 4 8"/>
                <line x1="8" y1="12" x2="12" y2="12"/>
                <line x1="2" y1="2" x2="22" y2="22"/>
              </svg>
            </ui-button>
          } @else {
            <ui-button
              variant="ghost"
              size="sm"
              color="primary"
              (clicked)="connect()"
              [disabled]="!connection().url || connection().status === 'connecting'"
              title="Connect">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ui-text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </ui-button>
          }
          </div>
        </ng-template>
      </app-template-input>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      min-width: 0;
    }

    .url-bar {
      display: flex;
      align-items: center;
      width: 100%;
      min-width: 0;
    }

    .url-input {
      flex: 1;
      min-width: 0;
    }

    .suffix-buttons {
      display: flex;
      gap: 0.25rem;
      align-items: center;
    }
  `]
})
export class WsUrlBarComponent {
  private webSocketService = inject(WebSocketService);

  connection = input.required<OpenWebSocketConnection>();

  onUrlChange(url: string): void {
    this.webSocketService.updateConnection(this.connection().id, { url });
  }

  connect(): void {
    this.webSocketService.connect(this.connection().id);
  }

  disconnect(): void {
    this.webSocketService.disconnect(this.connection().id);
  }

  save(): void {
    this.webSocketService.saveConnection(this.connection().id);
  }

}
