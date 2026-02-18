import { Injectable, signal, computed } from '@angular/core';

export type ShortcutAction =
  | 'saveRequest'
  | 'saveCollection'
  | 'sendRequest'
  | 'toggleConsole'
  | 'toggleHistory'
  | 'openSettings'
  | 'toggleDarkMode'
  | 'closeTab'
  | 'toggleLayout';

export type EditorLayout = 'horizontal' | 'vertical';

export interface KeyboardShortcut {
  action: ShortcutAction;
  keys: string; // e.g., 'ctrl+s', 'f5', 'ctrl+shift+s'
  label: string;
  description: string;
}

export type AutosaveDelay = 5 | 10 | 30 | 60;

export type MergeConflictBehavior = 'ask' | 'keep-local' | 'keep-remote';

export interface AppSettings {
  autosave: boolean;
  autosaveDelay: AutosaveDelay;
  proxyUrl: string;
  timeout: number;
  followRedirects: boolean;
  validateSsl: boolean;
  keyboardShortcuts: KeyboardShortcut[];
  editorLayout: EditorLayout;
  mergeConflictBehavior: MergeConflictBehavior;
}

const STORAGE_KEY = 'nikode-settings';

export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  { action: 'saveRequest', keys: 'ctrl+s', label: 'Save Request', description: 'Save the current request' },
  { action: 'saveCollection', keys: 'ctrl+shift+s', label: 'Save Collection', description: 'Save the active collection' },
  { action: 'sendRequest', keys: 'f5', label: 'Send Request', description: 'Execute the current request' },
  { action: 'toggleLayout', keys: 'ctrl+l', label: 'Toggle Layout', description: 'Switch between horizontal and vertical layout' },
  { action: 'toggleConsole', keys: 'ctrl+`', label: 'Toggle Console', description: 'Show/hide the console panel' },
  { action: 'toggleHistory', keys: 'ctrl+shift+h', label: 'Toggle History', description: 'Show/hide the history panel' },
  { action: 'openSettings', keys: 'ctrl+,', label: 'Open Settings', description: 'Open the settings dialog' },
  { action: 'toggleDarkMode', keys: 'ctrl+shift+d', label: 'Toggle Dark Mode', description: 'Switch between light and dark theme' },
  { action: 'closeTab', keys: 'ctrl+w', label: 'Close Tab', description: 'Close the current tab' },
];

const DEFAULT_SETTINGS: AppSettings = {
  autosave: false,
  autosaveDelay: 10,
  proxyUrl: '',
  timeout: 30,
  followRedirects: true,
  validateSsl: true,
  keyboardShortcuts: DEFAULT_SHORTCUTS,
  editorLayout: 'horizontal',
  mergeConflictBehavior: 'ask',
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private settings = signal<AppSettings>(this.loadSettings());

  readonly current = this.settings.asReadonly();

  readonly autosave = computed(() => this.settings().autosave);
  readonly autosaveDelay = computed(() => this.settings().autosaveDelay);

  get proxyUrl(): string {
    return this.settings().proxyUrl;
  }

  get timeout(): number {
    return this.settings().timeout;
  }

  get followRedirects(): boolean {
    return this.settings().followRedirects;
  }

  get validateSsl(): boolean {
    return this.settings().validateSsl;
  }

  get keyboardShortcuts(): KeyboardShortcut[] {
    return this.settings().keyboardShortcuts;
  }

  get editorLayout(): EditorLayout {
    return this.settings().editorLayout;
  }

  toggleEditorLayout(): void {
    const current = this.settings().editorLayout;
    this.update({ editorLayout: current === 'horizontal' ? 'vertical' : 'horizontal' });
  }

  getShortcutForAction(action: ShortcutAction): KeyboardShortcut | undefined {
    return this.settings().keyboardShortcuts.find(s => s.action === action);
  }

  updateShortcut(action: ShortcutAction, keys: string): void {
    const shortcuts = this.settings().keyboardShortcuts.map(s =>
      s.action === action ? { ...s, keys } : s
    );
    this.update({ keyboardShortcuts: shortcuts });
  }

  resetShortcuts(): void {
    this.update({ keyboardShortcuts: [...DEFAULT_SHORTCUTS] });
  }

  update(updates: Partial<AppSettings>): void {
    const newSettings = { ...this.settings(), ...updates };
    this.settings.set(newSettings);
    this.saveSettings(newSettings);
  }

  private loadSettings(): AppSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge shortcuts: keep saved shortcuts but add any new defaults
        const savedShortcuts: KeyboardShortcut[] = parsed.keyboardShortcuts || [];
        const mergedShortcuts = DEFAULT_SHORTCUTS.map(defaultShortcut => {
          const saved = savedShortcuts.find(s => s.action === defaultShortcut.action);
          return saved ? { ...defaultShortcut, keys: saved.keys } : defaultShortcut;
        });
        return { ...DEFAULT_SETTINGS, ...parsed, keyboardShortcuts: mergedShortcuts };
      }
    } catch {
      // Invalid JSON, use defaults
    }
    return { ...DEFAULT_SETTINGS };
  }

  private saveSettings(settings: AppSettings): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }
}
