import { settingsService } from '../settings/settingsService';
import * as commands from '../../lib/ipc/commands';
import type {
  Extension,
  ExtensionManifest,
  ExtensionResult,
  IExtensionManager,
  ExtensionCommand,
} from 'asyar-sdk/contracts';

import type { ExtendedManifest } from '../../types/ExtendedManifest';
import { isBuiltInFeature } from './extensionDiscovery';
import { extensionBridge, type ExtensionBridge } from 'asyar-sdk/contracts';
import { logService } from '../log/logService';
import { actionService } from '../action/actionService';

import { commandService } from './commandService';
import { performanceService } from '../performance/performanceService';
import { viewManager } from './viewManager';
import type { ExtensionRecord } from '../../types/ExtensionRecord';

import { searchService } from '../search/SearchService';
import { collectProbes, walkthroughService } from '../walkthrough/walkthroughService';
import { invalidateTopItemsCache } from '../search/topItemsCache';
import { applyTheme } from '../theme/themeService';
import { ExtensionIpcRouter } from './ExtensionIpcRouter';
import { ExtensionLoader } from './ExtensionLoader';
import { resetLauncherState } from '../../lib/launcher/launcherReset';
import type { ServiceRegistry } from './defineServiceRegistry';
import { buildServiceRegistry } from './buildServiceRegistry';
import { ExtensionEventSubscriptions } from './extensionEventSubscriptions';
import { TimerBridge } from '../timers/timerBridge';
import { dispatch } from './extensionDispatcher';

/**
 * Shape of a loaded extension module. Can be either a direct Extension instance
 * or an ES module wrapper where the extension is the default export.
 */
type LoadedExtensionModule = Extension | { default: Extension };

import { extensionSearchAggregator } from './extensionSearchAggregator';
import { extensionStateManager } from './extensionStateManager';
import { extensionIframeManager } from './extensionIframeManager';
import {
  getBuiltinDynamicDispatcher,
  isBuiltinDynamicExtension,
} from './builtinDynamicDispatchers';

/**
 * Manages application extensions
 */
export class ExtensionManager implements IExtensionManager {
  private bridge: ExtensionBridge = extensionBridge;
  private manifestsById: Map<string, ExtendedManifest> = new Map();
  private extensionModulesById: Map<string, LoadedExtensionModule> = new Map();
  private initialized = false;
  private eventSubscriptions = new ExtensionEventSubscriptions();
  private timerBridge = new TimerBridge();
  private allLoadedCommands: {
    cmd: ExtensionCommand;
    manifest: ExtensionManifest;
    isBuiltIn: boolean;
  }[] = [];
  private mountedComponents = new Map<string, any>(); // mountId -> component instance

  public isReady = false;
  private _extensionRecords: ExtensionRecord[] = [];

  public get extensionRecords() {
    return this._extensionRecords;
  }

  private readonly serviceRegistry: ServiceRegistry;
  private loader: ExtensionLoader;

  get currentExtension(): ExtensionManifest | null {
    const currentView = viewManager.getActiveView();
    if (!currentView) return null;
    const extensionId = currentView.split('/')[0];
    return this.getManifestById(extensionId) ?? null;
  }

  private resolveExtensionInstance(module: LoadedExtensionModule): Extension {
    return extensionSearchAggregator.resolveExtensionInstance(module);
  }

  public getLoadedExtensionModule(id: string): LoadedExtensionModule | undefined {
    return this.extensionModulesById.get(id);
  }

  constructor() {
    this.serviceRegistry = buildServiceRegistry({
      extensionManager: this,
      getManifestById: this.getManifestById.bind(this),
      handleCommandAction: this.handleCommandAction.bind(this),
    });

    extensionIframeManager.init(viewManager);
    actionService.setExtensionForwarder(
      extensionIframeManager.sendActionExecuteToExtension.bind(extensionIframeManager),
    );

    this.loader = new ExtensionLoader(
      this.bridge,
      (id, manifest) => {
        this.manifestsById.set(id, manifest);
      },
      (id, module) => {
        this.extensionModulesById.set(id, module);
      },
      (cmd, manifest, isBuiltIn) => {
        this.allLoadedCommands.push({ cmd, manifest, isBuiltIn });
      },
    );

    const ipcRouter = new ExtensionIpcRouter(
      this.serviceRegistry,
      this.getManifestById.bind(this),
      this.goBack.bind(this),
      () => searchService.saveIndex(),
    );
    ipcRouter.setup();
  }

  public get isInitialized(): boolean {
    return this.initialized;
  }

  public getExtensions(): ExtensionRecord[] {
    return this._extensionRecords;
  }

  public getExtensionCompatibility(id: string) {
    return extensionStateManager.getExtensionCompatibility(id);
  }

  async init(): Promise<boolean> {
    if (this.initialized) {
      logService.debug('ExtensionManager already initialized.');
      return true;
    }
    logService.custom('🔄 Initializing extension manager...', 'EXTN', 'blue');
    try {
      await performanceService.init();

      if (!settingsService.isInitialized()) {
        await settingsService.init();
      }

      // Apply persisted custom theme if one is set
      const activeTheme = settingsService.getSettings().appearance?.activeTheme;
      if (activeTheme) {
        applyTheme(activeTheme).catch((err) => {
          logService.error(`Failed to apply persisted theme on startup: ${err}`);
        });
      }

      performanceService.startTiming('extension-loading');
      await this.loadExtensions();
      const loadMetrics = performanceService.stopTiming('extension-loading');
      logService.custom(
        `🧩 Extensions loaded in ${loadMetrics.duration?.toFixed(2)}ms`,
        'PERF',
        'green',
      );

      // Initialize services after extensions are loaded
      const firstViewComponentById = new Map(
        this._extensionRecords.map((r) => [r.manifest.id, r.firstViewComponent]),
      );
      extensionSearchAggregator.init(
        this.extensionModulesById,
        this.manifestsById,
        this.isExtensionEnabled.bind(this),
        this.navigateToView.bind(this),
        firstViewComponentById,
      );
      extensionStateManager.init(this.manifestsById, this.reloadExtensionsFilesAndSync.bind(this));

      // Initialize ViewManager *after* manifests are loaded
      viewManager.init(this.manifestsById);

      viewManager.setModuleResolver({
        getModule: (id: string) => this.extensionModulesById.get(id),
        resolveInstance: (module) =>
          extensionSearchAggregator.resolveExtensionInstance(module as any),
      });

      performanceService.startTiming('command-index-sync');
      await this.syncCommandIndex();
      const syncMetrics = performanceService.stopTiming('command-index-sync');
      logService.custom(
        `🔄 Commands index synced in ${syncMetrics.duration?.toFixed(2)}ms`,
        'PERF',
        'blue',
      );

      this.updateExtensionRecords();

      await this.syncWalkthroughTasks();

      await this.eventSubscriptions.subscribe({
        isExtensionEnabled: this.isExtensionEnabled.bind(this),
        executeCommand: (objectId, args) => commandService.executeCommand(objectId, args),
        reloadExtensions: this.reloadExtensions.bind(this),
        getManifestById: this.getManifestById.bind(this),
      });
      await this.timerBridge.subscribe({
        isExtensionEnabled: this.isExtensionEnabled.bind(this),
      });

      this.initialized = true;
      return true;
    } catch (error) {
      logService.error(`Failed to initialize extension manager: ${error}`);
      return false;
    }
  }

  public async handleCommandAction(
    commandObjectId: string,
    args?: Record<string, any>,
  ): Promise<any> {
    logService.debug(`Handling command action for: ${commandObjectId}`);

    const dyn = parseDynamicObjectId(commandObjectId);
    if (dyn) {
      const builtinDispatcher = getBuiltinDynamicDispatcher(dyn.extensionId);
      if (builtinDispatcher) {
        await builtinDispatcher(dyn.dynamicId, args);

        searchService.saveIndex();
        void commands.hideWindow().then(resetLauncherState);

        void commands
          .recordItemUsage(commandObjectId)
          .then(() => invalidateTopItemsCache())
          .catch((err) =>
            logService.error(`Failed to record usage for ${commandObjectId}: ${err}`),
          );
        return { type: 'no-view' };
      }
      return this.handleDynamicCommandAction(dyn, commandObjectId, args);
    }

    try {
      const result = await commandService.executeCommand(commandObjectId, args);
      if (result?.type === 'no-view') {
        searchService.saveIndex();
        void commands.hideWindow().then(resetLauncherState);
      } else if (result?.type === 'view' && typeof result.viewPath === 'string') {
        this.navigateToView(result.viewPath);
      }
      logService.debug(`Recording usage for command: ${commandObjectId}`);
      commands
        .recordItemUsage(commandObjectId)
        .then(() => {
          logService.debug(`Usage recorded for ${commandObjectId}`);
          invalidateTopItemsCache();
        })
        .catch((err) => logService.error(`Failed to record usage for ${commandObjectId}: ${err}`));
      return result;
    } catch (error) {
      logService.error(`Error handling command action for ${commandObjectId}: ${error}`);
      throw error;
    }
  }

  private async handleDynamicCommandAction(
    parsed: { extensionId: string; dynamicId: string },
    commandObjectId: string,
    args?: Record<string, any>,
  ): Promise<any> {
    try {
      await dispatch({
        extensionId: parsed.extensionId,
        kind: 'command',
        payload: { commandId: parsed.dynamicId, args: args ?? {} },
        source: 'search',
        commandMode: 'background',
      });

      searchService.saveIndex();
      void commands.hideWindow().then(resetLauncherState);

      commands
        .recordItemUsage(commandObjectId)
        .then(() => invalidateTopItemsCache())
        .catch((err) => logService.error(`Failed to record usage for ${commandObjectId}: ${err}`));
      return { type: 'no-view' };
    } catch (error) {
      logService.error(`Error dispatching dynamic command ${commandObjectId}: ${error}`);
      throw error;
    }
  }

  private getCmdObjectId(cmd: ExtensionCommand, manifest: ExtensionManifest): string {
    const commandId = cmd.id || 'unknown_cmd';
    const extensionId = manifest.id || 'unknown_ext';
    return `cmd_${extensionId}_${commandId}`;
  }

  private async syncCommandIndex(): Promise<void> {
    await this.loader.syncCommandIndex(this.allLoadedCommands);
  }

  private async syncWalkthroughTasks(): Promise<void> {
    try {
      const { walkthroughProbeSources } = await import('../walkthrough/probeSources');

      await walkthroughService.sync(
        Array.from(this.manifestsById.values()),
        collectProbes(walkthroughProbeSources),
      );
      await walkthroughService.subscribe();
    } catch (error) {
      logService.error(`Failed to sync walkthrough tasks: ${error}`);
    }
  }

  private async reloadExtensionsFilesAndSync(): Promise<void> {
    await this.unloadExtensions();
    await this.loadExtensions();
    await this.syncCommandIndex();
    await this.syncWalkthroughTasks();
  }

  async reloadExtensions(): Promise<void> {
    logService.info('Explicitly reloading extensions...');
    try {
      this.manifestsById.forEach((manifest) => {
        if (manifest && manifest.id) {
          commandService.clearCommandsForExtension(manifest.id);
        }
      });

      performanceService.startTiming('extension-reloading');
      await this.loadExtensions();

      performanceService.startTiming('command-index-sync');
      await this.syncCommandIndex();
      const syncMetrics = performanceService.stopTiming('command-index-sync');
      const loadMetrics = performanceService.stopTiming('extension-reloading');
      logService.custom(
        `🔄 Extensions reloaded and synced in ${loadMetrics.duration?.toFixed(2)}ms`,
        'PERF',
        'green',
      );
    } catch (e) {
      logService.error(`Failed to reload extensions: ${e}`);
      throw e;
    }
  }

  async unloadExtensions(): Promise<void> {
    this.eventSubscriptions.unsubscribe();
    this.timerBridge.unsubscribe();
    void walkthroughService.unsubscribe();

    this.manifestsById.forEach((manifest) => {
      if (manifest && manifest.id) {
        commandService.clearCommandsForExtension(manifest.id);
      }
    });

    const deactivation = this.bridge
      .deactivateExtensions()
      .then((ids) => ({ timedOut: false as const, ids: ids ?? [] }));
    let fence: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      deactivation,
      new Promise<{ timedOut: true; ids: string[] }>((resolve) => {
        fence = setTimeout(() => resolve({ timedOut: true, ids: [] }), 10_000);
      }),
    ]);
    clearTimeout(fence);
    if (result.timedOut) {
      logService.warn(
        'bridge.deactivateExtensions() did not finish within 10s — continuing unload; some extensions may not have deactivated cleanly',
      );
    } else if (result.ids.length > 0) {
      logService.warn(
        `Extensions failed to deactivate cleanly (hung or threw): ${result.ids.join(', ')}`,
      );
    }

    this.extensionModulesById.clear();
    this.manifestsById.clear();
    this.allLoadedCommands = [];
    this.initialized = false;

    if (viewManager.isViewActive()) {
      while (viewManager.getNavigationStackSize() > 0) {
        viewManager.goBack();
      }
    }

    logService.info('Extensions unloaded and state cleared.');
  }

  async loadExtensions() {
    this.extensionModulesById.clear();
    this.manifestsById.clear();
    this.allLoadedCommands = [];

    const isReadyWrapper = {
      set: (v: boolean) => {
        this.isReady = v;
      },
      subscribe: (fn: (v: boolean) => void) => {
        fn(this.isReady);
        return () => {};
      },
    };

    await this.loader.loadExtensions(this.navigateToView.bind(this), isReadyWrapper as any);
    this.updateExtensionRecords();
  }

  public getManifestById(id: string): ExtendedManifest | undefined {
    return this.manifestsById.get(id);
  }

  public async getCommandArgMeta(commandObjectId: string): Promise<{
    extensionId: string;
    commandId: string;
    commandName: string;
    isBuiltIn: boolean;
    icon?: string;
    args: import('asyar-sdk/contracts').CommandArgument[];
    mode?: 'view' | 'background';
    requireAnyOf?: string[];
    isDynamic?: boolean;
  } | null> {
    if (!commandObjectId.startsWith('cmd_')) return null;
    const rest = commandObjectId.slice(4);
    for (const manifest of this.manifestsById.values()) {
      const prefix = `${manifest.id}_`;
      if (!rest.startsWith(prefix)) continue;
      const commandId = rest.slice(prefix.length);
      const cmd = manifest.commands?.find((c) => c.id === commandId);
      if (!cmd) continue;
      return {
        extensionId: manifest.id,
        commandId,
        commandName: cmd.name,
        isBuiltIn: isBuiltInFeature(manifest.id),
        icon: (cmd as { icon?: string }).icon ?? (manifest as { icon?: string }).icon,
        args:
          (cmd as { arguments?: import('asyar-sdk/contracts').CommandArgument[] }).arguments ?? [],
        mode: (cmd as { mode?: 'view' | 'background' }).mode,
        requireAnyOf: (cmd as { requireAnyOf?: string[] }).requireAnyOf,
        isDynamic: false,
      };
    }

    if (parseDynamicObjectId(commandObjectId) === null) return null;
    try {
      const reply = await commands.getDynamicCommandMeta(commandObjectId);
      if (!reply) return null;
      return {
        extensionId: reply.extensionId,
        commandId: reply.commandId,
        commandName: reply.commandName,
        isBuiltIn: isBuiltinDynamicExtension(reply.extensionId),
        icon: reply.icon,
        args: reply.args as import('asyar-sdk/contracts').CommandArgument[],
        requireAnyOf: reply.requireAnyOf,
        mode: 'background',
        isDynamic: true,
      };
    } catch (err) {
      logService.warn(
        `[ExtensionManager] getDynamicCommandMeta failed for ${commandObjectId}: ${err}`,
      );
      return null;
    }
  }

  public manifestCommandHasArguments(commandObjectId: string): boolean | null {
    if (!commandObjectId.startsWith('cmd_')) return null;
    const rest = commandObjectId.slice(4);
    for (const manifest of this.manifestsById.values()) {
      const prefix = `${manifest.id}_`;
      if (!rest.startsWith(prefix)) continue;
      const commandId = rest.slice(prefix.length);
      const cmd = manifest.commands?.find((c) => c.id === commandId);
      if (!cmd) continue;
      const args = (cmd as { arguments?: unknown[] }).arguments;
      return Array.isArray(args) && args.length > 0;
    }
    return null;
  }

  public setActiveViewActionLabel(label: string | null): void {
    logService.info(`[ExtensionManager] Setting active view action label to: ${label}`);
    viewManager.activeViewPrimaryActionLabel = label;
  }

  public setActiveViewSubtitle(subtitle: string | null): void {
    logService.info(`[ExtensionManager] Setting active view subtitle to: ${subtitle}`);
    viewManager.activeViewSubtitle = subtitle;
  }

  forwardKeyToActiveView(keyEvent: {
    key: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
  }): void {
    extensionIframeManager.forwardKeyToActiveView(keyEvent);
  }

  sendActionExecuteToExtension(extensionId: string, actionId: string): void {
    extensionIframeManager.sendActionExecuteToExtension(extensionId, actionId);
  }

  navigateToView(viewPath: string): void {
    logService.info(`[ExtensionManager] Navigating to view: ${viewPath}`);
    const extensionId = viewPath.split('/')[0];
    extensionStateManager.recordViewUsage(extensionId);
    viewManager.navigateToView(viewPath);
  }

  public goBack(): void {
    viewManager.goBack();
  }

  public handleViewSearch(query: string): Promise<void> {
    return viewManager.handleViewSearch(query);
  }

  handleViewSubmit(query: string): Promise<void> {
    return viewManager.handleViewSubmit(query);
  }

  isExtensionEnabled(extensionId: string): boolean {
    return extensionStateManager.isExtensionEnabled(extensionId);
  }

  async toggleExtensionState(extensionId: string, enabled: boolean): Promise<boolean> {
    return extensionStateManager.toggleExtensionState(extensionId, enabled);
  }

  async getAllExtensionsWithState(): Promise<any[]> {
    return extensionStateManager.getAllExtensionsWithState();
  }

  async getAllExtensions(): Promise<any[]> {
    return extensionStateManager.getAllExtensions(this.navigateToView.bind(this));
  }

  async uninstallExtension(extensionId: string, extensionName?: string): Promise<boolean> {
    return extensionStateManager.uninstallExtension(
      extensionId,
      extensionName,
      this.reloadExtensionsFilesAndSync.bind(this),
    );
  }

  async searchAll(query: string): Promise<ExtensionResult[]> {
    return extensionSearchAggregator.searchAll(query);
  }

  public getLoadedManifests(): ExtensionManifest[] {
    return Array.from(this.manifestsById.values());
  }

  public getLoadedCommands(): {
    cmd: ExtensionCommand;
    manifest: ExtensionManifest;
    isBuiltIn: boolean;
  }[] {
    return this.allLoadedCommands;
  }

  private updateExtensionRecords(): void {
    const records: ExtensionRecord[] = Array.from(this.manifestsById.values()).map((m) => ({
      manifest: m,
      isBuiltIn: isBuiltInFeature(m.id),
      enabled: this.isExtensionEnabled(m.id),
      path: m.id,
    }));
    this._extensionRecords = records;
  }
}

let _instance: ExtensionManager | null = null;
function getInstance(): ExtensionManager {
  if (!_instance) _instance = new ExtensionManager();
  return _instance;
}

const lazyExtensionManager = new Proxy({} as ExtensionManager, {
  get(_target, prop) {
    return Reflect.get(getInstance(), prop);
  },
  set(_target, prop, value) {
    return Reflect.set(getInstance(), prop, value);
  },
  has(_target, prop) {
    return Reflect.has(getInstance(), prop);
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(getInstance());
  },
  getOwnPropertyDescriptor(_target, prop) {
    const instance = getInstance();
    return (
      Object.getOwnPropertyDescriptor(instance, prop) ??
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(instance), prop)
    );
  },
  defineProperty(_target, prop, descriptor) {
    return Reflect.defineProperty(getInstance(), prop, descriptor);
  },
  ownKeys() {
    return Reflect.ownKeys(getInstance());
  },
});

export const isReady = {
  get subscribe() {
    return (fn: (v: boolean) => void) => {
      fn(lazyExtensionManager.isReady);
      return () => {};
    };
  },
};

export const extensionManager = lazyExtensionManager;
export default lazyExtensionManager;

function parseDynamicObjectId(objectId: string): { extensionId: string; dynamicId: string } | null {
  if (!objectId.startsWith('cmd_')) return null;
  const rest = objectId.slice(4);
  const idx = rest.lastIndexOf('_dyn_');
  if (idx <= 0) return null;
  const extensionId = rest.slice(0, idx);
  const dynamicId = rest.slice(idx + '_dyn_'.length);
  if (!extensionId || !dynamicId) return null;
  return { extensionId, dynamicId };
}
