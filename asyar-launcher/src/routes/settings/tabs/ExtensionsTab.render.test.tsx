// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({ onClosingRequested: vi.fn().mockResolvedValue(() => {}) })),
}));

const commandStubs: Record<string, ReturnType<typeof vi.fn>> = {};
vi.mock('../../../lib/ipc/commands', () => ({
  listInstalledExtensions: vi.fn().mockResolvedValue([]),
  uninstallExtension: vi.fn().mockResolvedValue(undefined),
  setExtensionEnabled: vi.fn().mockResolvedValue(true),
  getExtensionsDir: vi.fn().mockResolvedValue('C:/x'),
  showOpenExtensionDialog: vi.fn().mockResolvedValue(null),
  installExtensionFromFile: vi.fn().mockResolvedValue(undefined),
  showOpenFolderDialog: vi.fn().mockResolvedValue(null),
  inspectExtensionFolder: vi.fn().mockResolvedValue(null),
  registerDevExtension: vi.fn().mockResolvedValue(true),
  filterCompatibleExtensionsCommand: vi.fn().mockResolvedValue([]),
  getThemeDefinition: vi.fn().mockResolvedValue(null),
  getAliasConflicts: vi.fn().mockResolvedValue([]),
  __getStub: (name: string) => commandStubs[name],
}));

vi.mock('../../../services/extension/extensionManager', () => ({
  default: {
    isInitialized: true,
    init: vi.fn().mockResolvedValue(true),
    getExtensions: vi.fn().mockReturnValue([]),
    getExtensionCompatibility: vi.fn().mockReturnValue(null),
    reloadExtensions: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../../../services/settings/settingsService', () => ({
  settingsService: {
    isInitialized: vi.fn(() => true),
    init: vi.fn().mockResolvedValue(undefined),
    getSettings: vi.fn(() => ({ extensions: {}, developer: {} })),
    updateSettings: vi.fn().mockResolvedValue(undefined),
    currentSettings: { extensions: {}, developer: {} },
  },
}));
vi.mock('../../../services/extension/extensionStateManager', () => ({
  extensionStateManager: {
    isExtensionEnabled: vi.fn(() => true),
    extensionUninstallInProgress: null,
    init: vi.fn(),
  },
}));
vi.mock('../../../services/extension/extensionPreferencesService', () => ({
  extensionPreferencesService: {
    getEffectivePreferences: vi.fn().mockResolvedValue({ extension: {}, commands: {} }),
  },
}));
vi.mock('../../../services/feedback/feedbackService', () => ({
  feedbackService: { report: vi.fn(), dismiss: vi.fn(), current: null },
}));
vi.mock('../../../services/extension/permissionConsentService', () => ({
  permissionConsentService: {
    needsReview: [],
    ensureConsent: vi.fn().mockResolvedValue(true),
    revoke: vi.fn(),
  },
}));
vi.mock('../../../built-in-features/aliases/aliasStore', () => ({
  aliasStore: {
    shortcuts: [],
    byObjectId: new Map(),
    refresh: vi.fn().mockResolvedValue(undefined),
    removeOptimistic: vi.fn(),
  },
}));
vi.mock('../../../built-in-features/aliases/aliasService', () => ({
  aliasService: { unregister: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../../../built-in-features/shortcuts/shortcutStore', () => ({
  shortcutStore: { shortcuts: [], find: vi.fn(() => undefined), init: vi.fn() },
}));
vi.mock('../../../built-in-features/shortcuts/shortcutService', () => ({
  shortcutService: { unregister: vi.fn().mockResolvedValue(undefined) },
}));

import ExtensionsTab from './ExtensionsTab';
import { SettingsHandler } from '../settingsHandlers';
import { render } from '@testing-library/react';

describe('ExtensionsTab render', () => {
  it('renders the tab without crashing', async () => {
    const handler = new SettingsHandler();
    const { container } = render(<ExtensionsTab handler={handler} />);
    expect(container).toBeTruthy();
  });

  it('renders populated with real-shaped extension data', async () => {
    const handler = new SettingsHandler();
    handler.extensions = [
      {
        id: 'clipboard-history',
        title: 'Clipboard History',
        subtitle: 'Clipboard manager',
        keywords: '',
        type: 'extension',
        iconUrl: 'icon:clipboard',
        version: '1.0.0',
        enabled: true,
        compatibility: { status: 'compatible' },
        isBuiltIn: true,
        commands: [
          {
            id: 'show-clipboard',
            name: 'Show Clipboard History',
            description: 'Open the clipboard list',
            icon: 'icon:clipboard',
            mode: 'view',
            component: 'DefaultView',
          },
        ],
        preferences: [{ name: 'limit', type: 'number', title: 'Limit', default: 100 }],
        permissions: ['notifications:send'],
        permissionArgs: undefined,
      } as any,
      {
        id: 'org.asyar.color-picker',
        title: 'Color Picker',
        subtitle: 'Pick colors',
        keywords: '',
        type: 'extension',
        iconUrl: undefined,
        version: '0.2.0',
        enabled: false,
        compatibility: { status: 'compatible' },
        isBuiltIn: false,
        commands: [],
        preferences: [],
        permissions: [],
        permissionArgs: undefined,
      } as any,
    ];
    const { container } = render(<ExtensionsTab handler={handler} />);
    expect(container.textContent).toContain('Clipboard History');
  });
});
