import { Component, inject, signal, computed, afterNextRender } from '@angular/core';
import { TAB_DATA, TabsComponent, TabComponent, SplitComponent, SplitPaneComponent } from '@m1z23r/ngx-ui';
import { GraphQLService } from '../../core/services/graphql.service';
import { SettingsService } from '../../core/services/settings.service';
import { GqlUrlBarComponent } from './gql-url-bar.component';
import { QueryEditorComponent } from './panels/query-editor.component';
import { VariablesEditorComponent } from './panels/variables-editor.component';
import { GqlHeadersPanelComponent } from './panels/gql-headers-panel.component';
import { GqlResponsePanelComponent } from './panels/gql-response-panel.component';

export interface GraphQLTabData {
  requestId: string;
}

@Component({
  selector: 'app-graphql-tab-content',
  imports: [
    GqlUrlBarComponent,
    QueryEditorComponent,
    VariablesEditorComponent,
    GqlHeadersPanelComponent,
    GqlResponsePanelComponent,
    TabsComponent,
    TabComponent,
    SplitComponent,
    SplitPaneComponent,
  ],
  template: `
    @if (request(); as req) {
      <div class="tab-content">
        <app-gql-url-bar [request]="req" />
        <ui-split [orientation]="editorLayout()" class="split-container">
          <ui-split-pane [size]="50" [minSize]="20">
            <div class="config-panels">
              <ui-tabs [activeTab]="configTab()" (activeTabChange)="configTab.set($any($event))" variant="underline">
                <ui-tab id="query" label="Query">
                  <app-query-editor [request]="req" />
                </ui-tab>
                <ui-tab id="variables" label="Variables">
                  <app-variables-editor [request]="req" />
                </ui-tab>
                <ui-tab id="headers" [label]="'Headers' + (req.headers.length > 0 ? ' (' + req.headers.length + ')' : '')">
                  <app-gql-headers-panel [request]="req" />
                </ui-tab>
              </ui-tabs>
            </div>
          </ui-split-pane>
          <ui-split-pane [minSize]="20">
            <div class="response-panels">
              <app-gql-response-panel [request]="req" />
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

    .config-panels, .response-panels {
      display: flex;
      flex-direction: column;
      height: 100%;
      border: 1px solid var(--ui-border);
      border-radius: 8px;
      overflow: hidden;
    }

    :host ::ng-deep .config-panels > ui-tabs,
    :host ::ng-deep .response-panels > ui-tabs {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    :host ::ng-deep .config-panels > ui-tabs > .ui-tabs,
    :host ::ng-deep .response-panels > ui-tabs > .ui-tabs {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    :host ::ng-deep .config-panels .ui-tabs__panels,
    :host ::ng-deep .response-panels .ui-tabs__panels {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    :host ::ng-deep .config-panels ui-tab:has(> .ui-tab-panel),
    :host ::ng-deep .response-panels ui-tab:has(> .ui-tab-panel) {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    :host ::ng-deep .config-panels .ui-tab-panel,
    :host ::ng-deep .response-panels .ui-tab-panel {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
  `]
})
export class GraphQLTabContentComponent {
  private readonly data = inject(TAB_DATA) as GraphQLTabData;
  private readonly graphqlService = inject(GraphQLService);
  private readonly settingsService = inject(SettingsService);

  configTab = signal<string | number>(0);

  request = computed(() => {
    return this.graphqlService.requests().find(r => r.id === this.data.requestId);
  });

  editorLayout = computed(() => this.settingsService.current().editorLayout);

  constructor() {
    afterNextRender(() => {
      this.configTab.set('query');
    });
  }
}
