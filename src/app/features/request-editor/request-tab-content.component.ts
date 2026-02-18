import { Component, inject, signal, computed, afterNextRender } from '@angular/core';
import { TabsComponent, TabComponent, TAB_DATA, SplitComponent, SplitPaneComponent, SpinnerComponent } from '@m1z23r/ngx-ui';
import { WorkspaceService } from '../../core/services/workspace.service';
import { SettingsService } from '../../core/services/settings.service';
import { UrlBarComponent } from './url-bar.component';
import { ParamsPanelComponent } from './panels/params-panel.component';
import { HeadersPanelComponent } from './panels/headers-panel.component';
import { BodyPanelComponent } from './panels/body-panel.component';
import { VariablesPanelComponent } from './panels/variables-panel.component';
import { ScriptsPanelComponent } from './panels/scripts-panel.component';
import { DocsPanelComponent } from './panels/docs-panel.component';
import { GeneralTabComponent } from '../response-viewer/tabs/general-tab.component';
import { RequestTabComponent } from '../response-viewer/tabs/request-tab.component';
import { ResponseTabComponent } from '../response-viewer/tabs/response-tab.component';
import { CookiesTabComponent } from '../response-viewer/tabs/cookies-tab.component';

export interface RequestTabData {
  requestId: string;
}

@Component({
  selector: 'app-request-tab-content',
  imports: [
    UrlBarComponent,
    ParamsPanelComponent,
    HeadersPanelComponent,
    BodyPanelComponent,
    VariablesPanelComponent,
    ScriptsPanelComponent,
    DocsPanelComponent,
    GeneralTabComponent,
    RequestTabComponent,
    ResponseTabComponent,
    CookiesTabComponent,
    TabsComponent,
    TabComponent,
    SplitComponent,
    SplitPaneComponent,
    SpinnerComponent
  ],
  template: `
    @if (request(); as req) {
      <div class="tab-content">
        <app-url-bar [request]="req" />
        <ui-split [orientation]="editorLayout()" class="split-container">
          <ui-split-pane [size]="50" [minSize]="20">
            <div class="request-panels">
              <ui-tabs [activeTab]="requestTab()" (activeTabChange)="requestTab.set($any($event))" variant="underline">
                <ui-tab id="params" [label]="'Params' + (req.params.length > 0 ? ' (' + req.params.length + ')' : '')">
                  <app-params-panel [request]="req" />
                </ui-tab>
                <ui-tab id="headers" [label]="'Headers' + (req.headers.length > 0 ? ' (' + req.headers.length + ')' : '')">
                  <app-headers-panel [request]="req" />
                </ui-tab>
                <ui-tab id="body" label="Body">
                  <app-body-panel [request]="req" />
                </ui-tab>
                <ui-tab id="variables" label="Variables">
                  <app-variables-panel [request]="req" />
                </ui-tab>
                <ui-tab id="scripts" label="Scripts">
                  <app-scripts-panel [request]="req" />
                </ui-tab>
                <ui-tab id="docs" label="Docs">
                  <app-docs-panel [request]="req" />
                </ui-tab>
              </ui-tabs>
            </div>
          </ui-split-pane>
          <ui-split-pane [minSize]="20">
            <div class="response-panels">
              @if (req.loading) {
                <div class="loading-state">
                  <ui-spinner size="lg" />
                  <p>Sending request...</p>
                </div>
              } @else if (req.response) {
                <ui-tabs [activeTab]="responseTab()" (activeTabChange)="responseTab.set($any($event))" variant="underline">
                  <ui-tab id="general" label="General">
                    <app-general-tab [response]="req.response" />
                  </ui-tab>
                  <ui-tab id="request" label="Request">
                    <app-request-tab [response]="req.response" />
                  </ui-tab>
                  <ui-tab id="response" label="Response">
                    <app-response-tab [response]="req.response" />
                  </ui-tab>
                  <ui-tab id="cookies" [label]="'Cookies' + ((req.response.cookies || []).length > 0 ? ' (' + req.response.cookies.length + ')' : '')">
                    <app-cookies-tab [response]="req.response" />
                  </ui-tab>
                </ui-tabs>
              } @else {
                <div class="empty-state">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                  <p>Send a request to see the response</p>
                </div>
              }
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

    .request-panels, .response-panels {
      display: flex;
      flex-direction: column;
      height: 100%;
      border: 1px solid var(--ui-border);
      border-radius: 8px;
      overflow: hidden;
    }

    :host ::ng-deep .request-panels > ui-tabs,
    :host ::ng-deep .response-panels > ui-tabs {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    :host ::ng-deep .request-panels > ui-tabs > .ui-tabs,
    :host ::ng-deep .response-panels > ui-tabs > .ui-tabs {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    :host ::ng-deep .request-panels .ui-tabs__panels,
    :host ::ng-deep .response-panels .ui-tabs__panels {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    :host ::ng-deep .request-panels ui-tab:has(> .ui-tab-panel),
    :host ::ng-deep .response-panels ui-tab:has(> .ui-tab-panel) {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    :host ::ng-deep .request-panels .ui-tab-panel,
    :host ::ng-deep .response-panels .ui-tab-panel {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .loading-state, .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 1rem;
      color: var(--ui-text-muted);

      p {
        font-size: 0.875rem;
      }
    }
  `]
})
export class RequestTabContentComponent {
  private readonly data = inject(TAB_DATA) as RequestTabData;
  private readonly workspace = inject(WorkspaceService);
  private readonly settingsService = inject(SettingsService);

  requestTab = signal<string | number>(0);
  responseTab = signal<string | number>(0);

  request = computed(() => {
    return this.workspace.requests().find(r => r.id === this.data.requestId);
  });

  editorLayout = computed(() => this.settingsService.current().editorLayout);

  constructor() {
    // Workaround for ngx-ui tabs indicator not showing on initial render
    // The effect in TabsComponent fires before DOM is ready, so we re-set after render
    afterNextRender(() => {
      this.requestTab.set('params');
      this.responseTab.set('general');
    });
  }
}
