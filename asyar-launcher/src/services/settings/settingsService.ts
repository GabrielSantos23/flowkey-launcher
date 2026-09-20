import { Store, load } from '@tauri-apps/plugin-store';
import { logService } from '../log/logService';
import { appDataDir, join } from '@tauri-apps/api/path';
import { getVersion } from '@tauri-apps/api/app';
import * as commands from '../../lib/ipc/commands';
import type { ISettingsService } from './interfaces/ISettingsService';
import type { AppSettings } from './types/AppSettingsType';

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
    modifier: 'Alt',
    key: 'Space',
  },
  appearance: {
    theme: 'system',
    launchView: 'default',
    windowWidth: 800,
    windowHeight: 600,
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
  user: {
    syncEnabled: true,
  },
  fileSearch: {
    enabled: true,
    includeRoots: [],
    excludePatterns: [],
    indexHidden: false,
  },
};

export class SettingsService implements ISettingsService {
  private store: Store | null = null;
  private storeFilePath = 'settings.dat';
  private listeners: Set<(settings: AppSettings) => void> = new Set();

  public currentSettings: AppSettings = { ...DEFAULT_SETTINGS };
  public initialized = false;
  private isSaving = false;

  async init() {
    if (this.initialized) return true;

    try {
      try {
        const appDirPath = await appDataDir();
        this.storeFilePath = await join(appDirPath, 'settings.dat');
        this.store = await load(this.storeFilePath);
      } catch (storeError) {
        logService.error(`Failed to create store: ${storeError}`);
        this.store = await load('settings.dat');
        logService.info('Using fallback store path');
      }

      const storedRaw = await this.store.get<AppSettings>('settings');
      await this.load();

      this.store.onChange((key, value) => {
        if (this.isSaving) return;
        if (key === 'settings' && value) {
          this.currentSettings = this.mergeWithDefaults(value);
          this.notifySubscribers();
        }
      });

      this.initialized = true;

      if (!storedRaw || (storedRaw as Partial<AppSettings>).updates === undefined) {
        try {
          const version = await getVersion();
          if (/-/.test(version)) {
            this.currentSettings.updates = { ...DEFAULT_SETTINGS.updates, channel: 'beta' };
            await this.save();
          }
        } catch {
          // Non-fatal
        }
      }

      try {
        await this.syncAutostart();
      } catch (autostartError) {
        logService.error(`Autostart sync failed: ${autostartError}`);
      }

      await this.syncShortcut();
      await this.syncDockVisibility();
      await this.syncTrayVisibility();

      return true;
    } catch (error) {
      logService.error(`Failed to initialize settings: ${error}`);
      this.currentSettings = { ...DEFAULT_SETTINGS };
      return false;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async load() {
    try {
      if (!this.store) {
        throw new Error('Store is not initialized');
      }

      const storedSettings = await this.store.get<AppSettings>('settings');
      if (storedSettings) {
        this.currentSettings = this.mergeWithDefaults(storedSettings);
      } else {
        await this.save();
      }
      this.notifySubscribers();
    } catch (error) {
      logService.error(`Failed to load settings: ${error}`);
      throw error;
    }
  }

  async save() {
    this.isSaving = true;
    try {
      if (!this.store) {
        throw new Error('Store is not initialized');
      }

      await this.store.set('settings', this.currentSettings);
      await this.store.save();
      this.notifySubscribers();
      return true;
    } catch (error) {
      logService.error(`Failed to save settings: ${error}`);
      return false;
    } finally {
      this.isSaving = false;
    }
  }

  getSettings(): AppSettings {
    return this.currentSettings;
  }

  async updateSettings<K extends keyof AppSettings>(
    section: K,
    values: Partial<AppSettings[K]>,
  ): Promise<boolean> {
    try {
      this.currentSettings[section] = {
        ...this.currentSettings[section],
        ...values,
      } as AppSettings[K];

      if (section === 'general') {
        if ('startAtLogin' in values) {
          try {
            await this.syncAutostart();
          } catch (error) {
            logService.error(`Failed to sync autostart: ${error}`);
          }
        }
        if ('showDockIcon' in values) {
          await this.syncDockVisibility();
        }
        if ('showTrayIcon' in values) {
          await this.syncTrayVisibility();
        }
      }

      return await this.save();
    } catch (error) {
      logService.error(`Failed to update ${String(section)} settings: ${error}`);
      return false;
    }
  }

  subscribe(callback: (settings: AppSettings) => void) {
    this.listeners.add(callback);
    callback(this.currentSettings);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifySubscribers() {
    for (const listener of this.listeners) {
      try {
        listener(this.currentSettings);
      } catch (err) {
        logService.error(`Error in settings subscriber: ${err}`);
      }
    }
  }

  private async syncAutostart() {
    const shouldEnable = this.currentSettings.general.startAtLogin;

    try {
      const isCurrentlyEnabled = await commands.getAutostartStatus();
      if (shouldEnable !== isCurrentlyEnabled) {
        await commands.initializeAutostartFromSettings(shouldEnable);
      }
    } catch (error) {
      logService.error(`Failed to sync autostart setting: ${error}`);
      throw error;
    }
  }

  private async syncShortcut() {
    try {
      const { modifier, key } = this.currentSettings.shortcut;
      await commands.initializeShortcutFromSettings(modifier, key);
    } catch (error) {
      logService.error(`Failed to sync shortcut: ${error}`);
    }
  }

  private async syncDockVisibility() {
    try {
      await commands.setDockIconVisible(this.currentSettings.general.showDockIcon);
    } catch (error) {
      logService.error(`Failed to sync dock visibility: ${error}`);
    }
  }

  private async syncTrayVisibility() {
    try {
      await commands.setTrayIconVisible(this.currentSettings.general.showTrayIcon);
    } catch (error) {
      logService.error(`Failed to sync tray visibility: ${error}`);
    }
  }

  private mergeWithDefaults(stored: unknown): AppSettings {
    try {
      if (!stored || typeof stored !== 'object') {
        return { ...DEFAULT_SETTINGS };
      }

      const typedStored = stored as Partial<AppSettings>;

      return {
        general: { ...DEFAULT_SETTINGS.general, ...typedStored?.general },
        search: {
          ...DEFAULT_SETTINGS.search,
          ...typedStored?.search,
          additionalScanPaths:
            typedStored?.search?.additionalScanPaths ?? DEFAULT_SETTINGS.search.additionalScanPaths,
          applicationEnabled:
            typedStored?.search?.applicationEnabled ?? DEFAULT_SETTINGS.search.applicationEnabled,
        },
        shortcut: { ...DEFAULT_SETTINGS.shortcut, ...typedStored?.shortcut },
        appearance: {
          ...DEFAULT_SETTINGS.appearance,
          ...typedStored?.appearance,
        },
        extensions: {
          enabled: {
            ...DEFAULT_SETTINGS.extensions.enabled,
            ...typedStored?.extensions?.enabled,
          },
          autoUpdate: typedStored?.extensions?.autoUpdate ?? DEFAULT_SETTINGS.extensions.autoUpdate,
        },
        onboarding: { ...DEFAULT_SETTINGS.onboarding, ...typedStored?.onboarding },
        feedback: typedStored?.feedback
          ? { ...DEFAULT_SETTINGS.feedback, ...typedStored.feedback }
          : DEFAULT_SETTINGS.feedback,
        updates: typedStored?.updates
          ? { ...DEFAULT_SETTINGS.updates, ...typedStored.updates }
          : DEFAULT_SETTINGS.updates,
        user: typedStored?.user,
        developer: typedStored?.developer
          ? { ...DEFAULT_SETTINGS.developer, ...typedStored.developer }
          : DEFAULT_SETTINGS.developer,
        privacy: {
          ...DEFAULT_SETTINGS.privacy,
          ...(typedStored?.privacy ?? {}),
        },
        fileSearch: {
          ...DEFAULT_SETTINGS.fileSearch,
          ...(typedStored?.fileSearch ?? {}),
        },
      };
    } catch (error) {
      logService.error(`Error merging settings: ${error}`);
      return { ...DEFAULT_SETTINGS };
    }
  }

  async updateExtensionState(extensionName: string, enabled: boolean): Promise<boolean> {
    try {
      if (!this.currentSettings.extensions) {
        this.currentSettings.extensions = { enabled: {} };
      } else if (!this.currentSettings.extensions.enabled) {
        this.currentSettings.extensions.enabled = {};
      }

      this.currentSettings.extensions.enabled[extensionName] = enabled;
      return await this.save();
    } catch (error) {
      logService.error(`Failed to update extension state: ${error}`);
      return false;
    }
  }

  async removeExtensionState(extensionName: string): Promise<boolean> {
    try {
      if (this.currentSettings.extensions?.enabled) {
        delete this.currentSettings.extensions.enabled[extensionName];
        return await this.save();
      }
      return true;
    } catch (error) {
      logService.error(`Failed to remove extension state: ${error}`);
      return false;
    }
  }

  isExtensionEnabled(extensionName: string): boolean {
    if (!this.currentSettings.extensions?.enabled) return true;
    return this.currentSettings.extensions.enabled[extensionName] !== false;
  }

  getExtensionStates(): Record<string, boolean> {
    return this.currentSettings.extensions?.enabled ?? {};
  }

  async setWindowSize(width: number, height: number): Promise<boolean> {
    try {
      this.currentSettings.appearance.windowWidth = width;
      this.currentSettings.appearance.windowHeight = height;
      return await this.save();
    } catch (error) {
      logService.error(`Failed to save window size: ${error}`);
      return false;
    }
  }

  async updateGeneralSettings(generalSettings: Partial<AppSettings['general']>): Promise<boolean> {
    return this.updateSettings('general', generalSettings);
  }

  async updateSearchSettings(searchSettings: Partial<AppSettings['search']>): Promise<boolean> {
    return this.updateSettings('search', searchSettings);
  }

  async updateShortcutSettings(
    shortcutSettings: Partial<AppSettings['shortcut']>,
  ): Promise<boolean> {
    return this.updateSettings('shortcut', shortcutSettings);
  }

  async updateAppearanceSettings(
    appearanceSettings: Partial<AppSettings['appearance']>,
  ): Promise<boolean> {
    return this.updateSettings('appearance', appearanceSettings);
  }
}

export const settingsService = new SettingsService();

export const settings = {
  get subscribe() {
    return (fn: (v: AppSettings) => void) => {
      return settingsService.subscribe(fn);
    };
  },
};

export default settingsService;
