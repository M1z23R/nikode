import { Component, inject, signal, OnInit, computed, ElementRef, viewChildren, afterNextRender, Injector } from '@angular/core';
import {
  ModalComponent,
  ButtonComponent,
  InputComponent,
  CheckboxComponent,
  DIALOG_REF,
  DialogRef
} from '@m1z23r/ngx-ui';
import { SettingsService, AppSettings, KeyboardShortcut, DEFAULT_SHORTCUTS } from '../../core/services/settings.service';
import { KeyboardShortcutService } from '../../core/services/keyboard-shortcut.service';
import { APP_VERSION } from '../../core/tokens/version.token';

type SettingsTab = 'general' | 'network' | 'shortcuts' | 'about';

@Component({
  selector: 'app-settings-dialog',
  imports: [ModalComponent, ButtonComponent, InputComponent, CheckboxComponent],
  template: `
    <ui-modal title="Settings" [width]="'500px'">
      <div class="settings-layout">
        <nav class="settings-nav">
          <button
            class="nav-item"
            [class.active]="activeTab() === 'general'"
            (click)="activeTab.set('general')">
            General
          </button>
          <button
            class="nav-item"
            [class.active]="activeTab() === 'network'"
            (click)="activeTab.set('network')">
            Network
          </button>
          <button
            class="nav-item"
            [class.active]="activeTab() === 'shortcuts'"
            (click)="activeTab.set('shortcuts')">
            Shortcuts
          </button>
          <button
            class="nav-item"
            [class.active]="activeTab() === 'about'"
            (click)="activeTab.set('about')">
            About
          </button>
        </nav>

        <div class="settings-content">
          @switch (activeTab()) {
            @case ('general') {
              <div class="settings-section">
                <h3>Editor</h3>
                <div class="setting-item">
                  <ui-checkbox
                    [checked]="autosave()"
                    (checkedChange)="autosave.set($event)">
                    Auto-save requests when switching tabs
                  </ui-checkbox>
                </div>
              </div>
            }

            @case ('network') {
              <div class="settings-section">
                <h3>Proxy</h3>
                <ui-input
                  label="Proxy URL"
                  hint="Leave empty to disable proxy"
                  placeholder="http://localhost:8080"
                  [(value)]="proxyUrl" />
              </div>

              <div class="settings-section">
                <h3>Request</h3>
                <ui-input
                  label="Timeout (seconds)"
                  type="number"
                  hint="Maximum time to wait for a response"
                  [(value)]="timeoutStr" />

                <div class="setting-item">
                  <ui-checkbox
                    [checked]="followRedirects()"
                    (checkedChange)="followRedirects.set($event)">
                    Follow redirects automatically
                  </ui-checkbox>
                </div>

                <div class="setting-item">
                  <ui-checkbox
                    [checked]="validateSsl()"
                    (checkedChange)="validateSsl.set($event)">
                    Validate SSL certificates
                  </ui-checkbox>
                </div>
              </div>
            }

            @case ('shortcuts') {
              <div class="settings-section">
                <div class="shortcuts-header">
                  <h3>Keyboard Shortcuts</h3>
                  <ui-button variant="ghost" size="sm" (clicked)="resetShortcuts()">Reset to Default</ui-button>
                </div>
                <div class="shortcuts-list">
                  @for (shortcut of shortcuts(); track shortcut.action) {
                    <div class="shortcut-item">
                      <div class="shortcut-info">
                        <span class="shortcut-label">{{ shortcut.label }}</span>
                        <span class="shortcut-description">{{ shortcut.description }}</span>
                      </div>
                      <div class="shortcut-key-wrapper">
                        @if (editingShortcut() === shortcut.action) {
                          <input
                            class="shortcut-input"
                            [value]="recordedKeys()"
                            placeholder="Press keys..."
                            readonly
                            (keydown)="recordShortcut($event)"
                            #shortcutInput />
                          <ui-button variant="ghost" size="sm" (clicked)="saveRecordedShortcut(shortcut.action)">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          </ui-button>
                          <ui-button variant="ghost" size="sm" (clicked)="cancelRecording()">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <line x1="18" y1="6" x2="6" y2="18"/>
                              <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </ui-button>
                        } @else {
                          <button class="shortcut-key" (click)="startRecording(shortcut.action)">
                            {{ formatShortcut(shortcut.keys) }}
                          </button>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>
            }

            @case ('about') {
              <div class="settings-section">
                <div class="about-header">
                  <h2>Nikode</h2>
                  <span class="version-badge">v{{ version }}</span>
                </div>
                <p class="about-description">
                  A modern API client for developers.
                </p>
              </div>

              <div class="settings-section">
                <h3>Links</h3>
                <div class="link-list">
                  <a href="https://github.com/m1z23r/nikode" target="_blank" rel="noopener" class="link-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    GitHub Repository
                  </a>
                  <a href="https://github.com/m1z23r/nikode/issues" target="_blank" rel="noopener" class="link-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    Report an Issue
                  </a>
                  <a href="https://github.com/m1z23r/nikode/discussions" target="_blank" rel="noopener" class="link-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    Discussions
                  </a>
                </div>
              </div>
            }
          }
        </div>
      </div>

      <ng-container footer>
        <ui-button variant="ghost" (clicked)="cancel()">Cancel</ui-button>
        <ui-button color="primary" (clicked)="save()">Save</ui-button>
      </ng-container>
    </ui-modal>
  `,
  styles: [`
    .settings-layout {
      display: flex;
      height: 320px;
      gap: 1.5rem;
    }

    .settings-nav {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 120px;
      border-right: 1px solid var(--ui-border);
      padding-right: 1rem;
    }

    .nav-item {
      display: block;
      padding: 0.5rem 0.75rem;
      border: none;
      background: none;
      color: var(--ui-text-secondary);
      text-align: left;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.875rem;
      transition: background-color 0.15s, color 0.15s;
    }

    .nav-item:hover {
      background-color: var(--ui-bg-hover);
      color: var(--ui-text);
    }

    .nav-item.active {
      background-color: var(--ui-bg-tertiary);
      color: var(--ui-text);
      font-weight: 500;
    }

    .settings-content {
      flex: 1;
      min-width: 0;
    }

    .settings-section {
      margin-bottom: 1.5rem;
    }

    .settings-section h3 {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ui-text-muted);
      margin: 0 0 0.75rem 0;
    }

    .setting-item {
      margin-top: 0.75rem;
    }

    .about-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }

    .about-header h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
    }

    .version-badge {
      font-size: 0.75rem;
      padding: 0.125rem 0.5rem;
      background-color: var(--ui-bg-tertiary);
      border-radius: 9999px;
      color: var(--ui-text-secondary);
    }

    .about-description {
      margin: 0;
      color: var(--ui-text-secondary);
      font-size: 0.875rem;
    }

    .link-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .link-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      color: var(--ui-text);
      text-decoration: none;
      border-radius: 4px;
      font-size: 0.875rem;
      transition: background-color 0.15s;
    }

    .link-item:hover {
      background-color: var(--ui-bg-hover);
    }

    .link-item svg {
      color: var(--ui-text-muted);
    }

    .shortcuts-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.75rem;
    }

    .shortcuts-header h3 {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ui-text-muted);
      margin: 0;
    }

    .shortcuts-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-height: 280px;
      overflow-y: auto;
    }

    .shortcut-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem 0.75rem;
      background-color: var(--ui-bg-tertiary);
      border-radius: 4px;
    }

    .shortcut-info {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .shortcut-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--ui-text);
    }

    .shortcut-description {
      font-size: 0.75rem;
      color: var(--ui-text-muted);
    }

    .shortcut-key-wrapper {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .shortcut-key {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.5rem;
      background-color: var(--ui-bg-secondary);
      border: 1px solid var(--ui-border);
      border-radius: 4px;
      font-size: 0.75rem;
      font-family: monospace;
      color: var(--ui-text);
      cursor: pointer;
      transition: background-color 0.15s, border-color 0.15s;
    }

    .shortcut-key:hover {
      background-color: var(--ui-bg-hover);
      border-color: var(--ui-text-muted);
    }

    .shortcut-input {
      width: 120px;
      padding: 0.25rem 0.5rem;
      background-color: var(--ui-bg);
      border: 1px solid var(--ui-primary);
      border-radius: 4px;
      font-size: 0.75rem;
      font-family: monospace;
      color: var(--ui-text);
      outline: none;
    }
  `]
})
export class SettingsDialogComponent implements OnInit {
  readonly dialogRef = inject(DIALOG_REF) as DialogRef<void>;
  private settingsService = inject(SettingsService);
  private keyboardShortcutService = inject(KeyboardShortcutService);
  private injector = inject(Injector);
  protected version = inject(APP_VERSION);

  // Query for shortcut inputs
  private shortcutInputs = viewChildren<ElementRef<HTMLInputElement>>('shortcutInput');

  activeTab = signal<SettingsTab>('general');

  // Form state
  autosave = signal(false);
  proxyUrl = signal('');
  timeoutStr = signal('30');
  followRedirects = signal(true);
  validateSsl = signal(true);

  // Shortcuts state
  shortcuts = signal<KeyboardShortcut[]>([]);
  editingShortcut = signal<string | null>(null);
  recordedKeys = signal('');

  ngOnInit(): void {
    const current = this.settingsService.current();
    this.autosave.set(current.autosave);
    this.proxyUrl.set(current.proxyUrl);
    this.timeoutStr.set(String(current.timeout));
    this.followRedirects.set(current.followRedirects);
    this.validateSsl.set(current.validateSsl);
    this.shortcuts.set([...current.keyboardShortcuts]);

    // Disable shortcuts while settings dialog is open
    this.keyboardShortcutService.setEnabled(false);
  }

  cancel(): void {
    this.keyboardShortcutService.setEnabled(true);
    this.dialogRef.close();
  }

  save(): void {
    const timeout = parseInt(this.timeoutStr(), 10);
    this.settingsService.update({
      autosave: this.autosave(),
      proxyUrl: this.proxyUrl().trim(),
      timeout: isNaN(timeout) || timeout < 1 ? 30 : timeout,
      followRedirects: this.followRedirects(),
      validateSsl: this.validateSsl(),
      keyboardShortcuts: this.shortcuts(),
    });
    this.keyboardShortcutService.setEnabled(true);
    this.dialogRef.close();
  }

  // Shortcuts methods
  startRecording(action: string): void {
    this.editingShortcut.set(action);
    this.recordedKeys.set('');
    // Focus the input after Angular renders it
    afterNextRender(() => {
      const inputs = this.shortcutInputs();
      if (inputs.length > 0) {
        inputs[0].nativeElement.focus();
      }
    }, { injector: this.injector });
  }

  recordShortcut(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const parts: string[] = [];
    if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
    if (event.shiftKey) parts.push('Shift');
    if (event.altKey) parts.push('Alt');

    let key = event.key;
    // Normalize special keys
    if (key === ' ') key = 'Space';
    else if (key === 'Escape') key = 'Esc';
    else if (key.startsWith('Arrow')) key = key.replace('Arrow', '');
    else if (key === 'Dead' && event.code === 'Backquote') key = '`';
    else if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
      key = key.length === 1 ? key.toUpperCase() : key;
    } else {
      // Don't record modifier-only presses
      return;
    }

    parts.push(key);
    this.recordedKeys.set(parts.join('+'));
  }

  saveRecordedShortcut(action: string): void {
    const keys = this.recordedKeys();
    if (!keys) {
      this.cancelRecording();
      return;
    }

    // Convert to lowercase format for storage
    const normalizedKeys = keys.toLowerCase();

    this.shortcuts.update(shortcuts =>
      shortcuts.map(s => s.action === action ? { ...s, keys: normalizedKeys } : s)
    );
    this.editingShortcut.set(null);
    this.recordedKeys.set('');
  }

  cancelRecording(): void {
    this.editingShortcut.set(null);
    this.recordedKeys.set('');
  }

  resetShortcuts(): void {
    this.shortcuts.set([...DEFAULT_SHORTCUTS]);
  }

  formatShortcut(keys: string): string {
    return this.keyboardShortcutService.formatShortcut(keys);
  }
}
