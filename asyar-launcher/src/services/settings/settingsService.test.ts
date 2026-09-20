import { describe, it, expect, vi, beforeEach } from 'vitest';
import { settingsService } from './settingsService';
import type { AppSettings } from './types/AppSettingsType';

const mockTauriStore = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  save: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../log/logService', () => ({
  logService: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn().mockResolvedValue(mockTauriStore),
  Store: vi.fn(),
}));

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn().mockResolvedValue('/mock/data/'),
  join: vi.fn().mockImplementation((...args) => args.join('/')),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));

const DEFAULT: AppSettings = {
  general: {
    startAtLogin: false,
    showDockIcon: false,
    showTrayIcon: true,
    escapeInViewBehavior: 'go-back',
  },
  search: {
    searchApplications: true,
    searchSystemPreferences: true,
    fuzzySearch: true,
    enableExtensionSearch: false,
    allowExtensionActions: false,
    additionalScanPaths: [],
    applicationEnabled: {},
  },
  shortcut: { modifier: 'Alt', key: 'Space' },
  appearance: { theme: 'system', launchView: 'default', windowWidth: 800, windowHeight: 600 },
  extensions: {
    enabled: {},
    autoUpdate: true,
  },
  onboarding: {
    completed: false,
  },
  updates: {
    channel: 'stable',
    autoCheck: true,
  },
  privacy: {
    crashReportMode: 'off' as const,
    usageShareMode: 'off' as const,
  },
  fileSearch: {
    enabled: true,
    includeRoots: [],
    excludePatterns: [],
    indexHidden: false,
  },
};

const svc = settingsService as any;

function resetState() {
  svc.currentSettings = JSON.parse(JSON.stringify(DEFAULT));
  svc.initialized = false;
  svc.store = null;
}

function injectStore() {
  mockTauriStore.get.mockResolvedValue(null);
  mockTauriStore.set.mockResolvedValue(undefined);
  mockTauriStore.save.mockResolvedValue(undefined);
  svc.store = mockTauriStore;
}

describe('mergeWithDefaults', () => {
  const merge = (stored: unknown) => svc.mergeWithDefaults(stored);

  it('returns a copy of defaults for null', () => {
    const result = merge(null);
    expect(result.general.startAtLogin).toBe(false);
    expect(result.shortcut.key).toBe('Space');
  });

  it('returns defaults for a non-object value', () => {
    const result = merge('bad input');
    expect(result.appearance.theme).toBe('system');
  });

  it('fills all default fields when stored is an empty object', () => {
    const result = merge({});
    expect(result.general).toEqual(DEFAULT.general);
    expect(result.search).toEqual(DEFAULT.search);
    expect(result.appearance).toEqual(DEFAULT.appearance);
  });

  it('overrides individual fields while keeping other defaults', () => {
    const result = merge({ shortcut: { modifier: 'Alt', key: 'Space' } });
    expect(result.shortcut.modifier).toBe('Alt');
    expect(result.shortcut.key).toBe('Space');
    expect(result.general.startAtLogin).toBe(DEFAULT.general.startAtLogin);
  });

  it('merges extension enabled states', () => {
    const result = merge({ extensions: { enabled: { clipboard: false, store: true } } });
    expect(result.extensions.enabled.clipboard).toBe(false);
    expect(result.extensions.enabled.store).toBe(true);
  });

  it('preserves the user field when present', () => {
    const result = merge({ user: { id: 'u1', syncEnabled: true } });
    expect(result.user).toEqual({ id: 'u1', syncEnabled: true });
  });

  it('sets user to undefined when not in stored data', () => {
    const result = merge({});
    expect(result.user).toBeUndefined();
  });

  it('overrides only the provided appearance fields', () => {
    const result = merge({ appearance: { theme: 'dark' } });
    expect(result.appearance.theme).toBe('dark');
    expect(result.appearance.windowWidth).toBe(DEFAULT.appearance.windowWidth);
  });

  it('mergeWithDefaults fills onboarding with defaults when missing from stored settings', () => {
    const stored = {
      general: {},
      search: {},
      shortcut: {},
      appearance: {},
      extensions: {},
    };
    const merged = merge(stored);
    expect(merged.onboarding).toBeDefined();
    expect(merged.onboarding.completed).toBe(false);
  });

  it('mergeWithDefaults preserves stored onboarding.completed=true', () => {
    const stored = {
      general: {},
      search: {},
      shortcut: {},
      appearance: {},
      extensions: {},
      onboarding: { completed: true },
    };
    const merged = merge(stored);
    expect(merged.onboarding.completed).toBe(true);
  });
});

describe('getSettings', () => {
  beforeEach(resetState);

  it('returns or reflects the current state', () => {
    const s = settingsService.getSettings();
    expect(s.shortcut).toEqual({ modifier: 'Alt', key: 'Space' });
  });

  it('reflects changes made directly to currentSettings', () => {
    svc.currentSettings.shortcut = { modifier: 'Ctrl', key: 'P' };
    expect(settingsService.getSettings().shortcut.key).toBe('P');
  });
});

describe('isInitialized', () => {
  beforeEach(resetState);

  it('returns false on a fresh reset', () => {
    expect(settingsService.isInitialized()).toBe(false);
  });

  it('returns true after being manually set (simulating init)', () => {
    svc.initialized = true;
    expect(settingsService.isInitialized()).toBe(true);
  });
});

describe('updateSettings', () => {
  beforeEach(() => {
    resetState();
    injectStore();
  });

  it('updates the in-memory state and returns true', async () => {
    const ok = await settingsService.updateSettings('shortcut', { key: 'J' });
    expect(ok).toBe(true);
    expect(settingsService.getSettings().shortcut.key).toBe('J');
  });
});
