import { Injectable, inject, NgZone, OnDestroy } from '@angular/core';
import { SettingsService, ShortcutAction } from './settings.service';

export type ShortcutHandler = () => void;

@Injectable({ providedIn: 'root' })
export class KeyboardShortcutService implements OnDestroy {
  private settingsService = inject(SettingsService);
  private ngZone = inject(NgZone);

  private handlers = new Map<ShortcutAction, ShortcutHandler>();
  private boundKeydownHandler = this.handleKeydown.bind(this);
  private enabled = true;

  constructor() {
    // Listen outside Angular zone to avoid unnecessary change detection
    this.ngZone.runOutsideAngular(() => {
      document.addEventListener('keydown', this.boundKeydownHandler);
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.boundKeydownHandler);
  }

  registerHandler(action: ShortcutAction, handler: ShortcutHandler): void {
    this.handlers.set(action, handler);
  }

  unregisterHandler(action: ShortcutAction): void {
    this.handlers.delete(action);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (!this.enabled) return;

    // Skip if user is typing in an input, textarea, or contenteditable
    const target = event.target as HTMLElement;
    if (this.isInputElement(target)) {
      // Allow certain shortcuts even in inputs (like Ctrl+S, F5)
      const shortcutKey = this.eventToShortcutKey(event);
      const shortcuts = this.settingsService.keyboardShortcuts;
      const matchedShortcut = shortcuts.find(s => this.normalizeKeys(s.keys) === shortcutKey);

      // Only allow save, send, and close shortcuts in input elements
      if (!matchedShortcut || !['saveRequest', 'sendRequest', 'closeTab', 'saveCollection'].includes(matchedShortcut.action)) {
        return;
      }
    }

    const shortcutKey = this.eventToShortcutKey(event);
    const shortcuts = this.settingsService.keyboardShortcuts;

    for (const shortcut of shortcuts) {
      if (this.normalizeKeys(shortcut.keys) === shortcutKey) {
        const handler = this.handlers.get(shortcut.action);
        if (handler) {
          event.preventDefault();
          event.stopPropagation();
          // Run handler inside Angular zone
          this.ngZone.run(() => handler());
        }
        return;
      }
    }
  }

  private isInputElement(element: HTMLElement): boolean {
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
      return true;
    }
    // Check for contenteditable (CodeMirror uses this)
    if (element.getAttribute('contenteditable') === 'true') {
      return true;
    }
    // Check for CodeMirror
    if (element.classList.contains('cm-content') || element.closest('.cm-editor')) {
      return true;
    }
    return false;
  }

  private eventToShortcutKey(event: KeyboardEvent): string {
    const parts: string[] = [];

    if (event.ctrlKey || event.metaKey) parts.push('ctrl');
    if (event.shiftKey) parts.push('shift');
    if (event.altKey) parts.push('alt');

    // Get the key, normalizing special keys
    let key = event.key.toLowerCase();

    // Handle special keys
    if (key === ' ') key = 'space';
    if (key === 'escape') key = 'esc';
    if (key === 'arrowup') key = 'up';
    if (key === 'arrowdown') key = 'down';
    if (key === 'arrowleft') key = 'left';
    if (key === 'arrowright') key = 'right';

    // Handle backtick - can be reported differently on various keyboards
    // Use event.code as fallback for backtick detection
    if (key === 'dead' || event.code === 'Backquote') {
      if (event.code === 'Backquote') {
        key = '`';
      }
    }

    // Don't add modifier keys themselves
    if (!['control', 'shift', 'alt', 'meta'].includes(key)) {
      parts.push(key);
    }

    return parts.join('+');
  }

  private normalizeKeys(keys: string): string {
    return keys
      .toLowerCase()
      .split('+')
      .map(k => k.trim())
      .sort((a, b) => {
        // Sort modifiers first (ctrl, shift, alt), then key
        const order = { ctrl: 0, shift: 1, alt: 2 };
        const aOrder = order[a as keyof typeof order] ?? 3;
        const bOrder = order[b as keyof typeof order] ?? 3;
        return aOrder - bOrder;
      })
      .join('+');
  }

  /**
   * Get a display-friendly format of a shortcut key string
   */
  formatShortcut(keys: string): string {
    return keys
      .split('+')
      .map(k => {
        const key = k.trim().toLowerCase();
        switch (key) {
          case 'ctrl': return 'Ctrl';
          case 'shift': return 'Shift';
          case 'alt': return 'Alt';
          case 'meta': return 'Cmd';
          case 'esc': return 'Esc';
          case '`': return '`';
          default: return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
        }
      })
      .join(' + ');
  }
}
