import { Component, inject, signal, computed, afterNextRender } from '@angular/core';
import { TAB_DATA, TabsComponent, TabComponent, SplitComponent, SplitPaneComponent } from '@m1z23r/ngx-ui';
import { WebSocketService } from '../../core/services/websocket.service';
import { SettingsService } from '../../core/services/settings.service';
import { WsUrlBarComponent } from './ws-url-bar.component';
import { MessageComposerComponent } from './panels/message-composer.component';
import { MessageLogComponent } from './panels/message-log.component';
import { ConnectionStatsComponent } from './panels/connection-stats.component';
import { WsHeadersPanelComponent } from './panels/ws-headers-panel.component';
import { WsSettingsPanelComponent } from './panels/ws-settings-panel.component';

export interface WebSocketTabData {
  connectionId: string;
}

@Component({
  selector: 'app-websocket-tab-content',
  imports: [
    WsUrlBarComponent,
    MessageComposerComponent,
    MessageLogComponent,
    ConnectionStatsComponent,
    WsHeadersPanelComponent,
    WsSettingsPanelComponent,
    TabsComponent,
    TabComponent,
    SplitComponent,
    SplitPaneComponent,
  ],
  template: `
    @if (connection(); as conn) {
      <div class="tab-content">
        <app-ws-url-bar [connection]="conn" />
        <ui-split [orientation]="editorLayout()" class="split-container">
          <ui-split-pane [size]="50" [minSize]="20">
            <div class="config-panels">
              <ui-tabs [activeTab]="configTab()" (activeTabChange)="configTab.set($any($event))" variant="underline">
                <ui-tab id="compose" label="Compose">
                  <app-message-composer [connection]="conn" />
                </ui-tab>
                <ui-tab id="headers" [label]="'Headers' + (conn.headers.length > 0 ? ' (' + conn.headers.length + ')' : '')">
                  <app-ws-headers-panel [connection]="conn" />
                </ui-tab>
                <ui-tab id="settings" label="Settings">
                  <app-ws-settings-panel [connection]="conn" />
                </ui-tab>
              </ui-tabs>
            </div>
          </ui-split-pane>
          <ui-split-pane [minSize]="20">
            <div class="message-panels">
              <div class="message-header">
                <app-connection-stats [connection]="conn" />
              </div>
              <app-message-log [connection]="conn" />
            </div>
          </ui-split-pane>
        </ui-split>
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
    }

    .tab-content {
      display: grid;
      grid-template-rows: auto 1fr;
      padding: 1rem;
      gap: 1rem;
      height: 100%;
      box-sizing: border-box;
    }

    .split-container {
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }

    .config-panels, .message-panels {
      display: flex;
      flex-direction: column;
      height: 100%;
      border: 1px solid var(--ui-border);
      border-radius: 8px;
      overflow: hidden;
    }

    .message-header {
      padding: 0.5rem 1rem;
      border-bottom: 1px solid var(--ui-border);
      background-color: var(--ui-bg-secondary);
      flex-shrink: 0;
    }

    app-message-log {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
  `]
})
export class WebSocketTabContentComponent {
  private readonly data = inject(TAB_DATA) as WebSocketTabData;
  private readonly webSocketService = inject(WebSocketService);
  private readonly settingsService = inject(SettingsService);

  configTab = signal<string | number>(0);

  connection = computed(() => {
    return this.webSocketService.connections().find(c => c.id === this.data.connectionId);
  });

  editorLayout = computed(() => this.settingsService.current().editorLayout);

  constructor() {
    afterNextRender(() => {
      this.configTab.set('compose');
    });
  }
}
