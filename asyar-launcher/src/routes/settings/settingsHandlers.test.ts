// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsHandler, DEFAULT_SETTINGS } from './settingsHandlers';
import { permissionConsentService } from '../../services/extension/permissionConsentService';

const { mockGetAll, mockToggleExtensionState } = vi.hoisted(() => ({
  mockGetAll: vi.fn(),
  mockToggleExtensionState: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../services/extension/extensionManager', () => ({
  default: {
    getAllExtensionsWithState: mockGetAll,
    toggleExtensionState: mockToggleExtensionState,
    getExtensions: mockGetAll,
    isInitialized: true,
    init: vi.fn().mockResolvedValue(undefined),
    getExtensionCompatibility: vi.fn().mockReturnValue({ compatible: true }),
  },
}));
const { listenMock, onFocusChangedMock, getCurrentWindowMock } = vi.hoisted(() => {
  const onFocusChangedMock = vi.fn();
  return {
    listenMock: vi.fn(),
    onFocusChangedMock,
    getCurrentWindowMock: vi.fn(() => ({ onFocusChanged: onFocusChangedMock })),
  };
});
vi.mock('@tauri-apps/api/event', () => ({ listen: listenMock }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: getCurrentWindowMock }));
const { mockUpdateSettings } = vi.hoisted(() => ({
  mockUpdateSettings: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../services/settings/settingsService', () => ({
  settingsService: {
    init: vi.fn().mockResolvedValue(true),
    currentSettings: {},
    updateSettings: mockUpdateSettings,
    getSettings: vi.fn().mockReturnValue({}),
    subscribe: vi.fn().mockReturnValue(() => {}),
  },
  settings: { subscribe: vi.fn() },
}));
vi.mock('../../services/extension/extensionStateManager', () => ({
  extensionStateManager: {
    isExtensionEnabled: vi.fn().mockReturnValue(true),
    setExtensionEnabled: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../../services/feedback/feedbackService', () => ({
  feedbackService: {},
}));
vi.mock('../../services/log/logService', () => ({
  logService: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('../../utils/shortcutManager', () => ({ updateShortcut: vi.fn() }));

describe('SettingsHandler.loadExtensions', () => {
  it('maps manifest commands onto each ExtensionItem', async () => {
    mockGetAll.mockReturnValue([
      {
        name: 'Pomodoro',
        isBuiltIn: false,
        manifest: {
          id: 'pomodoro',
          name: 'Pomodoro',
          description: 'Timer',
          type: 'extension',
          commands: [
            {
              id: 'cmd1',
              name: 'Start Timer',
              description: 'Starts the timer',
              trigger: 'pomo start',
            },
          ],
        },
      },
    ]);

    const handler = new SettingsHandler();
    await handler.loadExtensions();

    expect(handler.extensions).toHaveLength(1);
    expect(handler.extensions[0].commands).toEqual([
      { id: 'cmd1', name: 'Start Timer', description: 'Starts the timer', trigger: 'pomo start' },
    ]);
  });

  it('sets commands to empty array when manifest has no commands', async () => {
    mockGetAll.mockReturnValue([
      {
        name: 'Catppuccin',
        isBuiltIn: false,
        manifest: { id: 'cat', name: 'Catppuccin', type: 'theme', commands: [] },
      },
    ]);

    const handler = new SettingsHandler();
    await handler.loadExtensions();

    expect(handler.extensions[0].commands).toEqual([]);
  });

  it('includes built-in extensions alongside third-party ones', async () => {
    mockGetAll.mockReturnValue([
      {
        name: 'Calculator',
        isBuiltIn: true,
        manifest: { id: 'calc', name: 'Calculator', commands: [] },
      },
      {
        name: 'GitHub',
        isBuiltIn: false,
        manifest: { id: 'gh', name: 'GitHub', commands: [] },
      },
    ]);

    const handler = new SettingsHandler();
    await handler.loadExtensions();

    expect(handler.extensions).toHaveLength(2);
    const titles = handler.extensions.map((e) => e.title).sort();
    expect(titles).toEqual(['Calculator', 'GitHub']);
  });
});

describe('SettingsHandler.init — consent cross-window sync', () => {
  beforeEach(() => {
    mockGetAll.mockReset().mockReturnValue([]);
    listenMock.mockClear().mockImplementation(() => Promise.resolve(() => {}));
  });

  it('destroy() unsubscribes the asyar:consent-changed listener', async () => {
    const unlistenConsentChanged = vi.fn();
    listenMock.mockImplementation((eventName: string) =>
      eventName === 'asyar:consent-changed'
        ? Promise.resolve(unlistenConsentChanged)
        : Promise.resolve(() => {}),
    );

    const handler = new SettingsHandler();
    await handler.init();
    handler.destroy();

    expect(unlistenConsentChanged).toHaveBeenCalledOnce();
  });
});

describe('SettingsHandler — general settings handlers', () => {
  beforeEach(() => {
    mockUpdateSettings.mockClear();
  });

  it('handleShowDockIconToggle toggles showDockIcon', async () => {
    const handler = new SettingsHandler();
    handler.settings.general.showDockIcon = false;
    await handler.handleShowDockIconToggle();
    expect(mockUpdateSettings).toHaveBeenCalledWith('general', { showDockIcon: true });
  });

  it('handleShowTrayIconToggle toggles showTrayIcon', async () => {
    const handler = new SettingsHandler();
    handler.settings.general.showTrayIcon = true;
    await handler.handleShowTrayIconToggle();
    expect(mockUpdateSettings).toHaveBeenCalledWith('general', { showTrayIcon: false });
  });
});

describe('SettingsHandler.toggleExtension', () => {
  it('toggles state for extensions', async () => {
    const handler = new SettingsHandler();
    handler.extensions = [
      {
        id: 'com.example.test',
        title: 'Custom Ext',
        isBuiltIn: false,
        enabled: true,
        commands: [],
      },
    ];
    await handler.toggleExtension('com.example.test');
    expect(handler.extensions[0].enabled).toBe(false);
  });
});
