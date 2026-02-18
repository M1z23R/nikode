import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsService, DEFAULT_SHORTCUTS, AppSettings } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let mockStorage: Record<string, string>;

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
    });

    service = new SettingsService();
  });

  describe('default settings', () => {
    it('should initialize with default values', () => {
      expect(service.autosave()).toBe(false);
      expect(service.timeout).toBe(30);
      expect(service.followRedirects).toBe(true);
      expect(service.validateSsl).toBe(true);
      expect(service.editorLayout).toBe('horizontal');
    });

    it('should have default keyboard shortcuts', () => {
      expect(service.keyboardShortcuts).toEqual(DEFAULT_SHORTCUTS);
    });
  });

  describe('getShortcutForAction', () => {
    it('should return the shortcut for a valid action', () => {
      const shortcut = service.getShortcutForAction('sendRequest');
      expect(shortcut).toBeDefined();
      expect(shortcut?.keys).toBe('f5');
    });

    it('should return undefined for an invalid action', () => {
      const shortcut = service.getShortcutForAction('nonexistent' as never);
      expect(shortcut).toBeUndefined();
    });
  });

  describe('toggleEditorLayout', () => {
    it('should toggle from horizontal to vertical', () => {
      expect(service.editorLayout).toBe('horizontal');
      service.toggleEditorLayout();
      expect(service.editorLayout).toBe('vertical');
    });

    it('should toggle from vertical to horizontal', () => {
      service.update({ editorLayout: 'vertical' });
      service.toggleEditorLayout();
      expect(service.editorLayout).toBe('horizontal');
    });
  });

  describe('updateShortcut', () => {
    it('should update a shortcut key binding', () => {
      service.updateShortcut('sendRequest', 'ctrl+enter');
      const shortcut = service.getShortcutForAction('sendRequest');
      expect(shortcut?.keys).toBe('ctrl+enter');
    });

    it('should persist the change to localStorage', () => {
      service.updateShortcut('sendRequest', 'ctrl+enter');
      const stored = JSON.parse(mockStorage['nikode-settings']);
      const savedShortcut = stored.keyboardShortcuts.find(
        (s: { action: string }) => s.action === 'sendRequest'
      );
      expect(savedShortcut.keys).toBe('ctrl+enter');
    });
  });

  describe('resetShortcuts', () => {
    it('should reset shortcuts to defaults', () => {
      service.updateShortcut('sendRequest', 'ctrl+enter');
      service.resetShortcuts();
      const shortcut = service.getShortcutForAction('sendRequest');
      expect(shortcut?.keys).toBe('f5');
    });
  });

  describe('update', () => {
    it('should update multiple settings at once', () => {
      service.update({ autosave: true, timeout: 60 });
      expect(service.autosave()).toBe(true);
      expect(service.timeout).toBe(60);
    });

    it('should persist settings to localStorage', () => {
      service.update({ autosave: true });
      const stored: AppSettings = JSON.parse(mockStorage['nikode-settings']);
      expect(stored.autosave).toBe(true);
    });
  });

  describe('loading settings', () => {
    it('should load saved settings from localStorage', () => {
      mockStorage['nikode-settings'] = JSON.stringify({
        autosave: true,
        timeout: 120,
        proxyUrl: 'http://proxy.local',
      });

      const newService = new SettingsService();
      expect(newService.autosave()).toBe(true);
      expect(newService.timeout).toBe(120);
      expect(newService.proxyUrl).toBe('http://proxy.local');
    });

    it('should use defaults for invalid JSON', () => {
      mockStorage['nikode-settings'] = 'invalid json';
      const newService = new SettingsService();
      expect(newService.autosave()).toBe(false);
      expect(newService.timeout).toBe(30);
    });

    it('should merge saved shortcuts with new defaults', () => {
      mockStorage['nikode-settings'] = JSON.stringify({
        keyboardShortcuts: [{ action: 'sendRequest', keys: 'ctrl+enter' }],
      });

      const newService = new SettingsService();
      const shortcuts = newService.keyboardShortcuts;

      // Should have all default shortcuts
      expect(shortcuts.length).toBe(DEFAULT_SHORTCUTS.length);

      // But sendRequest should have the saved key binding
      const sendRequest = shortcuts.find((s) => s.action === 'sendRequest');
      expect(sendRequest?.keys).toBe('ctrl+enter');

      // Other shortcuts should have default keys
      const saveRequest = shortcuts.find((s) => s.action === 'saveRequest');
      expect(saveRequest?.keys).toBe('ctrl+s');
    });
  });
});
