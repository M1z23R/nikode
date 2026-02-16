import { Component, inject, output, computed } from '@angular/core';
import { ButtonComponent, DialogService } from '@m1z23r/ngx-ui';
import { WorkspaceService } from '../../core/services/workspace.service';
import { UnifiedCollectionService } from '../../core/services/unified-collection.service';
import { APP_VERSION } from '../../core/tokens/version.token';
import { RunnerDialogComponent, RunnerDialogData } from '../runner/runner.dialog';
import { SettingsDialogComponent } from '../settings/settings.dialog';

@Component({
  selector: 'app-footer',
  imports: [ButtonComponent],
  template: `
    <footer class="app-footer">
      <div class="footer-left">
        <ui-button variant="ghost" size="sm" (clicked)="workspace.toggleDarkMode()" title="Toggle theme">
          @if (workspace.isDarkMode()) {
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          } @else {
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          }
        </ui-button>
        <ui-button variant="ghost" size="sm" (clicked)="openSettings()" title="Settings">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </ui-button>
        <ui-button variant="ghost" size="sm" (clicked)="consoleToggle.emit()" title="Toggle console">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="4 17 10 11 4 5"/>
            <line x1="12" y1="19" x2="20" y2="19"/>
          </svg>
        </ui-button>
        <ui-button variant="ghost" size="sm" (clicked)="historyToggle.emit()" title="Toggle history">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </ui-button>
        <ui-button variant="ghost" size="sm" (clicked)="openRunner()" [disabled]="!canRun()" title="Run collection">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </ui-button>
      </div>
      <div class="footer-right">
        <a href="https://github.com/m1z23r/nikode" target="_blank" rel="noopener" class="github-link" title="View on GitHub">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        </a>
        <span class="version">v{{ version }}</span>
      </div>
    </footer>
  `,
  styles: [`
    .app-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 0.5rem;
      background-color: var(--ui-bg-secondary);
      border-top: 1px solid var(--ui-border);
      height: 32px;
      flex-shrink: 0;
    }

    .footer-left, .footer-right {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .github-link {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      color: var(--ui-text-muted);
      border-radius: 4px;
      transition: color 0.15s, background-color 0.15s;
    }

    .github-link:hover {
      color: var(--ui-text);
      background-color: var(--ui-bg-hover);
    }

    .version {
      font-size: 0.75rem;
      color: var(--ui-text-muted);
      padding: 0 0.5rem;
    }
  `]
})
export class FooterComponent {
  protected workspace = inject(WorkspaceService);
  protected version = inject(APP_VERSION);
  private dialogService = inject(DialogService);
  private unifiedCollectionService = inject(UnifiedCollectionService);

  consoleToggle = output();
  historyToggle = output();

  protected canRun = computed(() => !!this.workspace.activeRequest());

  protected openSettings(): void {
    this.dialogService.open<SettingsDialogComponent, void, void>(SettingsDialogComponent, {});
  }

  protected openRunner(): void {
    const activeRequest = this.workspace.activeRequest();
    if (!activeRequest) return;

    const collection = this.unifiedCollectionService.getCollection(activeRequest.collectionPath);
    if (!collection) return;

    this.dialogService.open<RunnerDialogComponent, RunnerDialogData, void>(
      RunnerDialogComponent,
      {
        data: {
          collectionPath: activeRequest.collectionPath,
          targetId: null,
          targetType: 'collection',
          targetName: collection.name,
        },
      }
    );
  }
}
