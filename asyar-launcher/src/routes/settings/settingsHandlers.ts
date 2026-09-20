import { getCurrentWindow } from '@tauri-apps/api/window';
import { updateShortcut } from '../../utils/shortcutManager';
import { settingsService } from '../../services/settings/settingsService';
import extensionManager from '../../services/extension/extensionManager';
import { extensionStateManager } from '../../services/extension/extensionStateManager';
import { extensionPreferencesService } from '../../services/extension/extensionPreferencesService';
import { feedbackService } from '../../services/feedback/feedbackService';
import { permissionConsentService } from '../../services/extension/permissionConsentService';
import type { AppSettings } from '../../services/settings/types/AppSettingsType';
import { logService } from '../../services/log/logService';
import type { CompatibilityStatus } from '../../types/CompatibilityStatus';
import type { ExtensionCommand, PreferenceDeclaration } from 'asyar-sdk/contracts';

// Define interface for extension items with enabled status
export interface ExtensionItem {
  title: string;
  subtitle?: string;
  keywords?: string;
  type?: string;
  iconUrl?: string;
  version?: string;
  action?: () => void;
  enabled?: boolean;
  id?: string;
  compatibility?: CompatibilityStatus;
  commands?: ExtensionCommand[];
  preferences?: any[];
  isBuiltIn?: boolean;
  permissions?: string[];
  permissionArgs?: Record<string, unknown>;
}

// Initialize with default settings first
export const DEFAULT_SETTINGS: AppSettings = {
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
  shortcut: {
    modifier: 'Super',
    key: 'K',
  },
  appearance: {
    theme: 'system' as const,
    launchView: 'default' as const,
    windowWidth: 800,
    windowHeight: 600,
    activeTheme: null,
  },
  extensions: {
    enabled: {},
    autoUpdate: true,
  },
  onboarding: {
    completed: false,
  },
  feedback: {
    promptSeen: false,
  },
  updates: {
    channel: 'stable' as const,
    autoCheck: true,
  },
  developer: {
    enabled: false,
    showInspector: false,
    verboseLogging: false,
    tracing: false,
    allowSideloading: false,
  },
  privacy: {
    crashReportMode: 'off',
    usageShareMode: 'off',
  },
  fileSearch: {
    enabled: true,
    includeRoots: [],
    excludePatterns: [],
    indexHidden: false,
  },
};

/** True when an icon string looks like an image file shipped with the
 * extension (has an image extension). Anything else (emoji, short text) is
 * rendered directly by the UI's text-icon fallback. */
function isIconFilePath(icon: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(icon);
}

export class SettingsHandler {
  settings: AppSettings = { ...DEFAULT_SETTINGS };
  selectedModifier = 'Super';
  selectedKey = 'K';
  isSaving = false;
  saveMessage = '';
  saveError = false;
  activeTab = 'general';
  selectedTheme = 'system';
  selectedLaunchView: 'default' | 'compact' = 'default';
  isLoading = true;
  initError = '';

  // Extensions state
  extensions: ExtensionItem[] = [];
  isLoadingExtensions = false;
  extensionError = '';
  togglingExtension: string | null = null;
  pendingExtensionSelection: string | null = null;

  private unsubscribe: (() => void) | null = null;
  private unlistenPreferencesChanged: (() => void) | null = null;
  private unlistenConsentChanged: (() => void) | null = null;
  private unlistenExtensionsUpdated: (() => void) | null = null;
  private unlistenWindowFocus: (() => void) | null = null;
  preferencesVersion = 0;

  constructor() {}

  async init() {
    try {
      this.settings = { ...DEFAULT_SETTINGS };
      this.selectedModifier = this.settings.shortcut.modifier;
      this.selectedKey = this.settings.shortcut.key;
      this.selectedTheme = this.settings.appearance.theme;
      this.selectedLaunchView = this.settings.appearance.launchView;

      const success = await settingsService.init();

      if (!success) {
        logService.error('Settings initialization failed');
        this.initError = 'Settings initialization failed. Using defaults.';
      } else {
        this.settings = settingsService.getSettings();
        this.selectedModifier = this.settings.shortcut.modifier;
        this.selectedKey = this.settings.shortcut.key;
        this.selectedTheme = this.settings.appearance.theme;
        this.selectedLaunchView = this.settings.appearance.launchView;
      }

      this.setupSubscription();
    } catch (error) {
      logService.error(`Failed to load settings: ${error}`);
      this.initError = 'Failed to load settings. Using defaults.';
    } finally {
      this.isLoading = false;
      document.body.classList.add('settings-page');
      await this.loadExtensions();

      try {
        const { listen } = await import('@tauri-apps/api/event');
        this.unlistenPreferencesChanged = await listen<{ extensionId: string }>(
          'asyar:preferences-changed',
          () => {
            this.preferencesVersion++;
          },
        );
        this.unlistenConsentChanged = await listen('asyar:consent-changed', () => {
          this.preferencesVersion++;
        });
        this.unlistenExtensionsUpdated = await listen('asyar:extensions-updated', () => {
          void this.loadExtensions();
        });
        this.unlistenWindowFocus = await listen('tauri://focus', () => {
          void this.loadExtensions();
        });
      } catch (err) {
        logService.warn(`Failed to wire settings event listener: ${err}`);
      }
    }
  }

  setupSubscription() {
    this.unsubscribe = settingsService.subscribe((newSettings) => {
      this.settings = newSettings;
      this.selectedModifier = newSettings.shortcut.modifier;
      this.selectedKey = newSettings.shortcut.key;
      this.selectedTheme = newSettings.appearance.theme;
      this.selectedLaunchView = newSettings.appearance.launchView;
    });
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.unlistenPreferencesChanged) {
      this.unlistenPreferencesChanged();
      this.unlistenPreferencesChanged = null;
    }
    if (this.unlistenConsentChanged) {
      this.unlistenConsentChanged();
      this.unlistenConsentChanged = null;
    }
    if (this.unlistenExtensionsUpdated) {
      this.unlistenExtensionsUpdated();
      this.unlistenExtensionsUpdated = null;
    }
    if (this.unlistenWindowFocus) {
      this.unlistenWindowFocus();
      this.unlistenWindowFocus = null;
    }
  }

  async loadExtensions() {
    try {
      this.isLoadingExtensions = true;
      this.extensionError = '';

      if (!extensionManager.isInitialized) {
        await extensionManager.init();
      }

      const raw = extensionManager.getExtensions();
      const items: ExtensionItem[] = [];

      for (const ext of raw) {
        const manifest = ext.manifest;
        if (!manifest) continue;

        const id = manifest.id;
        const enabled = extensionStateManager.isExtensionEnabled(id);
        const compatibility = extensionManager.getExtensionCompatibility(id);
        const rawIcon = (manifest as { icon?: string }).icon;
        let iconUrl: string | undefined;
        if (rawIcon) {
          if (
            rawIcon.startsWith('icon:') ||
            rawIcon.startsWith('asyar-') ||
            rawIcon.startsWith('http') ||
            rawIcon.startsWith('/')
          ) {
            iconUrl = rawIcon;
          } else if (isIconFilePath(rawIcon)) {
            // A real image file shipped with the extension — serve it through
            // the asyar-extension:// scheme handler.
            iconUrl = `asyar-extension://${id}/${rawIcon}`;
          } else {
            // Emoji or short text — rendered as-is by the icon fallback.
            iconUrl = rawIcon;
          }
        }

        items.push({
          id,
          title: manifest.name,
          subtitle: manifest.description,
          keywords: manifest.commands?.map((c) => c.name).join(', ') || '',
          type: manifest.type || 'extension',
          iconUrl,
          version: manifest.version,
          enabled,
          compatibility,
          commands: manifest.commands,
          preferences: manifest.preferences,
          isBuiltIn: ext.isBuiltIn,
          permissions: manifest.permissions,
          permissionArgs: manifest.permissionArgs,
        });
      }

      this.extensions = items;
    } catch (error) {
      logService.error(`Failed to load extensions: ${error}`);
      this.extensionError = `Failed to load extensions: ${String(error)}`;
    } finally {
      this.isLoadingExtensions = false;
    }
  }

  async toggleExtension(extension: string | ExtensionItem) {
    const extensionId = typeof extension === 'string' ? extension : extension.id || '';
    if (!extensionId) return;

    try {
      this.togglingExtension = extensionId;
      const target = this.extensions.find((e) => e.id === extensionId);
      if (!target) return;

      const newStatus = !target.enabled;
      await extensionStateManager.setExtensionEnabled(extensionId, newStatus);
      target.enabled = newStatus;
      this.extensions = [...this.extensions];
    } catch (error) {
      logService.error(`Failed to toggle extension ${extensionId}: ${error}`);
      this.extensionError = 'Failed to update extension status.';
    } finally {
      this.togglingExtension = null;
    }
  }

  async requestUninstallExtension(extension: string | ExtensionItem) {
    const extensionId = typeof extension === 'string' ? extension : extension.id || '';
    const extensionTitle =
      typeof extension === 'string' ? extension : extension.title || extension.id || '';
    if (!extensionId) return;

    try {
      await extensionStateManager.uninstallExtension(extensionId, extensionTitle, async () => {
        await this.loadExtensions();
      });
      await this.loadExtensions();
    } catch (error) {
      logService.error(`Failed to uninstall extension ${extensionId}: ${error}`);
      this.extensionError = 'Failed to uninstall extension.';
    }
  }

  async handleShortcutChange(detail: { modifier: string; key: string }) {
    try {
      this.isSaving = true;
      this.saveMessage = 'Saving shortcut...';
      this.saveError = false;

      const updated = await updateShortcut(detail.modifier, detail.key);
      if (updated) {
        this.selectedModifier = detail.modifier;
        this.selectedKey = detail.key;
        this.saveMessage = 'Shortcut saved!';
      } else {
        throw new Error('Failed to update shortcut');
      }
    } catch (error) {
      logService.error(`Failed to handle shortcut change: ${error}`);
      this.saveError = true;
      this.saveMessage = 'Failed to save shortcut';
    } finally {
      this.isSaving = false;
      setTimeout(() => {
        this.saveMessage = '';
        this.saveError = false;
      }, 3000);
    }
  }

  async handleStartAtLoginToggle() {
    try {
      const success = await settingsService.updateSettings('general', {
        startAtLogin: !this.settings.general.startAtLogin,
      });

      if (!success) {
        throw new Error('Failed to update autostart setting');
      }
    } catch (error) {
      logService.error(`Failed to update autostart setting: ${error}`);
      this.saveError = true;
      this.saveMessage = 'Failed to update startup setting';

      setTimeout(() => {
        this.saveMessage = '';
        this.saveError = false;
      }, 3000);
    }
  }

  async handleAutostartToggle() {
    return this.handleStartAtLoginToggle();
  }

  async handleShowDockIconToggle() {
    try {
      const success = await settingsService.updateSettings('general', {
        showDockIcon: !this.settings.general.showDockIcon,
      });

      if (!success) {
        throw new Error('Failed to update dock icon setting');
      }
    } catch (error) {
      logService.error(`Failed to update dock icon setting: ${error}`);
      this.saveError = true;
      this.saveMessage = 'Failed to update dock icon setting';

      setTimeout(() => {
        this.saveMessage = '';
        this.saveError = false;
      }, 3000);
    }
  }

  async handleShowTrayIconToggle() {
    try {
      const success = await settingsService.updateSettings('general', {
        showTrayIcon: !this.settings.general.showTrayIcon,
      });

      if (!success) {
        throw new Error('Failed to update menu bar icon setting');
      }
    } catch (error) {
      logService.error(`Failed to update menu bar icon setting: ${error}`);
      this.saveError = true;
      this.saveMessage = 'Failed to update menu bar icon setting';

      setTimeout(() => {
        this.saveMessage = '';
        this.saveError = false;
      }, 3000);
    }
  }

  async handleTrayIconToggle() {
    return this.handleShowTrayIconToggle();
  }

  async handleExtensionSearchToggle() {
    try {
      const success = await settingsService.updateSettings('search', {
        enableExtensionSearch: !this.settings.search.enableExtensionSearch,
      });
      if (success) {
        this.saveMessage =
          'Search settings updated. Please restart Flowkey for these changes to take effect.';
        this.saveError = false;
      } else {
        throw new Error('Failed to update extension search setting');
      }
    } catch (error) {
      logService.error(`Failed to update extension search setting: ${error}`);
      this.saveError = true;
      this.saveMessage = 'Failed to update search setting';
    } finally {
      setTimeout(() => {
        this.saveMessage = '';
        this.saveError = false;
      }, 5000);
    }
  }

  async handleExtensionActionsToggle() {
    try {
      const success = await settingsService.updateSettings('search', {
        allowExtensionActions: !this.settings.search.allowExtensionActions,
      });
      if (!success) throw new Error('Failed to update extension actions setting');
    } catch (error) {
      logService.error(`Failed to update extension actions setting: ${error}`);
      this.saveError = true;
      this.saveMessage = 'Failed to update extension actions setting';
      setTimeout(() => {
        this.saveMessage = '';
        this.saveError = false;
      }, 3000);
    }
  }

  async handleExtensionAutoUpdateToggle() {
    try {
      const autoUpdate = this.settings.extensions?.autoUpdate !== false;
      const success = await settingsService.updateSettings('extensions', {
        autoUpdate: !autoUpdate,
      });
      if (!success) throw new Error('Failed to update extension auto-update setting');
    } catch (error) {
      logService.error(`Failed to update extension auto-update setting: ${error}`);
      this.saveError = true;
      this.saveMessage = 'Failed to update auto-update setting';
      setTimeout(() => {
        this.saveMessage = '';
        this.saveError = false;
      }, 3000);
    }
  }

  async updateEscapeBehavior(behavior: 'go-back' | 'close-window' | 'hide-and-reset') {
    try {
      const success = await settingsService.updateSettings('general', {
        escapeInViewBehavior: behavior,
      });

      if (!success) {
        throw new Error('Failed to update escape behavior setting');
      }
    } catch (error) {
      logService.error(`Failed to update escape behavior setting: ${error}`);
      this.saveError = true;
      this.saveMessage = 'Failed to update setting';

      setTimeout(() => {
        this.saveMessage = '';
        this.saveError = false;
      }, 3000);
    }
  }

  async updateThemeSetting(theme: AppSettings['appearance']['theme']) {
    try {
      await settingsService.updateSettings('appearance', { theme });
      this.selectedTheme = theme;
    } catch (error) {
      logService.error(`Failed to update theme: ${error}`);
      this.saveError = true;
      this.saveMessage = 'Failed to update theme';

      setTimeout(() => {
        this.saveMessage = '';
        this.saveError = false;
      }, 3000);
    }
  }

  async updateLaunchView(launchView: 'default' | 'compact') {
    try {
      await settingsService.updateSettings('appearance', { launchView });
      this.selectedLaunchView = launchView;
    } catch (error) {
      logService.error(`Failed to update launch view: ${error}`);
      this.saveError = true;
      this.saveMessage = 'Failed to update launch view';

      setTimeout(() => {
        this.saveMessage = '';
        this.saveError = false;
      }, 3000);
    }
  }

  async updateChannel(channel: 'stable' | 'beta') {
    await settingsService.updateSettings('updates', { channel });
  }

  async updateAutoCheck(autoCheck: boolean) {
    await settingsService.updateSettings('updates', { autoCheck });
  }

  goBack() {
    void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().hide());
  }

  async handleDeveloperModeToggle() {
    try {
      const current = this.settings.developer ?? DEFAULT_SETTINGS.developer!;
      await settingsService.updateSettings('developer', {
        ...current,
        enabled: !current.enabled,
      });
    } catch (error) {
      logService.error(`Failed to toggle developer mode: ${error}`);
      this.saveError = true;
      this.saveMessage = 'Failed to update developer mode';
      setTimeout(() => {
        this.saveMessage = '';
        this.saveError = false;
      }, 3000);
    }
  }

  async handleDeveloperSettingToggle(
    key: 'showInspector' | 'verboseLogging' | 'tracing' | 'allowSideloading',
  ) {
    try {
      const current = this.settings.developer ?? DEFAULT_SETTINGS.developer!;
      await settingsService.updateSettings('developer', {
        ...current,
        [key]: !current[key],
      });
    } catch (error) {
      logService.error(`Failed to toggle developer setting ${key}: ${error}`);
      this.saveError = true;
      this.saveMessage = 'Failed to update developer setting';
      setTimeout(() => {
        this.saveMessage = '';
        this.saveError = false;
      }, 3000);
    }
  }
}
