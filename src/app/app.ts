import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { SplitComponent, SplitPaneComponent, DialogService, TabsService } from '@m1z23r/ngx-ui';
import { CollectionService } from './core/services/collection.service';
import { UnifiedCollectionService } from './core/services/unified-collection.service';
import { WorkspaceService } from './core/services/workspace.service';
import { KeyboardShortcutService } from './core/services/keyboard-shortcut.service';
import { SettingsService } from './core/services/settings.service';
import { AuthService } from './core/services/auth.service';
import { SidebarComponent } from './features/sidebar/sidebar.component';
import { RequestEditorComponent } from './features/request-editor/request-editor.component';
import { EnvironmentSelectorComponent } from './features/environments/environment-selector.component';
import { FooterComponent } from './features/footer/footer.component';
import { ConsolePanelComponent } from './features/console/console-panel.component';
import { HistoryPanelComponent } from './features/history/history-panel.component';
import { SettingsDialogComponent } from './features/settings/settings.dialog';
import { UserMenuComponent } from './features/auth/user-menu.component';
import { WorkspaceSwitcherComponent } from './features/workspaces/workspace-switcher.component';

@Component({
  selector: 'app-root',
  imports: [
    SidebarComponent,
    RequestEditorComponent,
    EnvironmentSelectorComponent,
    FooterComponent,
    ConsolePanelComponent,
    HistoryPanelComponent,
    SplitComponent,
    SplitPaneComponent,
    UserMenuComponent,
    WorkspaceSwitcherComponent
  ],
  template: `
    <div class="app-shell">
      <header class="app-header">
        <div class="header-left">
          <app-user-menu />
          @if (auth.isAuthenticated()) {
            <app-workspace-switcher />
          }
        </div>
        <div class="header-center">
          <h1 class="logo">
            <svg width="24" height="24" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="512" height="512" rx="80" ry="80" fill="#374151"/>
              <text x="256" y="380" font-family="Arial, Helvetica, sans-serif" font-size="360" font-weight="bold" fill="#f3f4f6" text-anchor="middle">N</text>
            </svg>
            Nikode
          </h1>
        </div>
        <div class="header-right">
          <app-environment-selector />
        </div>
      </header>

      <div class="app-content">
        <ui-split orientation="vertical" class="content-console-split">
          <ui-split-pane [size]="bottomPanelVisible() ? 75 : 100" [minSize]="30">
            <ui-split orientation="horizontal" class="sidebar-editor-split">
              <ui-split-pane [size]="20" [minSize]="10" [maxSize]="40">
                <app-sidebar />
              </ui-split-pane>
              <ui-split-pane [minSize]="30">
                <app-request-editor />
              </ui-split-pane>
            </ui-split>
          </ui-split-pane>
          @if (consoleVisible()) {
            <ui-split-pane [minSize]="10">
              <app-console-panel />
            </ui-split-pane>
          }
          @if (historyVisible()) {
            <ui-split-pane [minSize]="10">
              <app-history-panel />
            </ui-split-pane>
          }
        </ui-split>
      </div>

      <app-footer (consoleToggle)="toggleConsole()" (historyToggle)="toggleHistory()" />
    </div>

  `,
  styles: [`
    .app-shell {
      display: grid;
      grid-template-rows: 48px 1fr 32px;
      height: 100vh;
      overflow: hidden;
    }

    .app-header {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      padding: 0 1rem;
      background-color: var(--ui-bg-secondary);
      border-bottom: 1px solid var(--ui-border);
    }

    .header-left {
      justify-self: start;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .header-center {
      justify-self: center;
    }

    .header-right {
      justify-self: end;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--ui-text);
      margin: 0;
    }

    .app-content {
      overflow: hidden;
    }

    .content-console-split,
    .sidebar-editor-split {
      height: 100%;
    }
  `]
})
export class App implements OnInit, OnDestroy {
  private collectionService = inject(CollectionService);
  private unifiedCollectionService = inject(UnifiedCollectionService);
  private workspaceService = inject(WorkspaceService);
  private settingsService = inject(SettingsService);
  private keyboardShortcutService = inject(KeyboardShortcutService);
  private dialogService = inject(DialogService);
  private tabsService = inject(TabsService);
  protected auth = inject(AuthService);

  consoleVisible = signal(false);
  historyVisible = signal(false);

  readonly bottomPanelVisible = () => this.consoleVisible() || this.historyVisible();

  ngOnInit(): void {
    this.collectionService.openRecentCollections();
    this.registerKeyboardShortcuts();
  }

  ngOnDestroy(): void {
    this.unregisterKeyboardShortcuts();
  }

  toggleConsole(): void {
    this.consoleVisible.update(v => !v);
  }

  toggleHistory(): void {
    this.historyVisible.update(v => !v);
  }

  private registerKeyboardShortcuts(): void {
    this.keyboardShortcutService.registerHandler('saveRequest', () => {
      const activeId = this.workspaceService.activeId();
      if (activeId) {
        this.workspaceService.saveRequest(activeId);
      }
    });

    this.keyboardShortcutService.registerHandler('saveCollection', () => {
      const activeRequest = this.workspaceService.activeRequest();
      if (activeRequest) {
        this.unifiedCollectionService.save(activeRequest.collectionPath);
      }
    });

    this.keyboardShortcutService.registerHandler('sendRequest', () => {
      const activeId = this.workspaceService.activeId();
      if (activeId) {
        this.workspaceService.sendRequest(activeId);
      }
    });

    this.keyboardShortcutService.registerHandler('toggleConsole', () => {
      this.toggleConsole();
    });

    this.keyboardShortcutService.registerHandler('toggleHistory', () => {
      this.toggleHistory();
    });

    this.keyboardShortcutService.registerHandler('openSettings', () => {
      this.dialogService.open<SettingsDialogComponent, void, void>(SettingsDialogComponent, {});
    });

    this.keyboardShortcutService.registerHandler('toggleDarkMode', () => {
      this.workspaceService.toggleDarkMode();
    });

    this.keyboardShortcutService.registerHandler('closeTab', () => {
      const activeId = this.tabsService.activeTabId();
      if (activeId) {
        this.tabsService.closeById(activeId);
      }
    });

    this.keyboardShortcutService.registerHandler('toggleLayout', () => {
      this.settingsService.toggleEditorLayout();
    });
  }

  private unregisterKeyboardShortcuts(): void {
    this.keyboardShortcutService.unregisterHandler('saveRequest');
    this.keyboardShortcutService.unregisterHandler('saveCollection');
    this.keyboardShortcutService.unregisterHandler('sendRequest');
    this.keyboardShortcutService.unregisterHandler('toggleConsole');
    this.keyboardShortcutService.unregisterHandler('toggleHistory');
    this.keyboardShortcutService.unregisterHandler('openSettings');
    this.keyboardShortcutService.unregisterHandler('toggleDarkMode');
    this.keyboardShortcutService.unregisterHandler('closeTab');
    this.keyboardShortcutService.unregisterHandler('toggleLayout');
  }
}
