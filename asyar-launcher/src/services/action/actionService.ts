import { logService } from '../log/logService';
import { toFullActionId } from './actionId';
import type { ExtensionAction, IActionService } from 'asyar-sdk/contracts';
import { ActionContext } from 'asyar-sdk/contracts';
import * as commands from '../../lib/ipc/commands';
import { searchService } from '../search/SearchService';
import { searchOrchestrator } from '../search/searchOrchestrator';
import { searchStores } from '../search/stores/search';
import { feedbackService } from '../feedback/feedbackService';
import { islandService } from '../island/islandService';
import { commandService } from '../extension/commandService';
import { applicationService } from '../application/applicationService';
import { writeText } from 'tauri-plugin-clipboard-x-api';
import { developerSettingsService } from '../settings/developerSettingsService';
import { favoritesService } from '../favorites/favoritesService';

// Module-level platform detection for the Uninstall action. macOS moves the
// .app bundle to Trash via `trash::delete`; Windows resolves the .lnk
// shortcut's display name against the registry's Uninstall keys and launches
// the vendor UninstallString. Linux is unsupported — packaging is too
// fragmented (apt/dnf/pacman/flatpak/snap/AppImage) for a single first-party
// path — and the action stays hidden there.
const IS_WINDOWS = true;
const UNINSTALL_SUPPORTED = IS_WINDOWS;

/** Human-readable byte size. Matches Finder-style rounding (1 KB = 1000 B). */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1000;
  let unitIdx = 0;
  while (value >= 1000 && unitIdx < units.length - 1) {
    value /= 1000;
    unitIdx++;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIdx]}`;
}

export interface ApplicationAction {
  id: string;
  label: string;
  icon?: string;
  description?: string;
  category?: string;
  extensionId?: string;
  disabled?: boolean;
  context?: ActionContext; // Use the enum type here too for consistency
  confirm?: boolean;
  destructive?: boolean;
  execute: () => Promise<void> | void;
  shortcut?: string;
  visible?: () => boolean;
}

/**
 * ActionService implementation for the main application
 * Connects extension actions to the application UI
 */
export class ActionService implements IActionService {
  private allActions: Map<string, ApplicationAction> = new Map();
  private currentContext: ActionContext = ActionContext.CORE;
  private currentExtensionId?: string;
  private sendToExtension?: (
    extensionId: string,
    actionId: string,
    role?: 'view' | 'worker',
    payload?: unknown,
  ) => void;
  // Which iframe role registered the handler for a given full actionId
  // (`act_<extensionId>_<shortId>`). Populated by the IPC router from the
  // calling iframe's data-role attribute when the SDK calls
  // actions:registerActionHandler. Consumed by executeAction so the launcher
  // posts asyar:action:execute to the iframe that actually owns the handler.
  // Absent = legacy single-iframe extension or handler never registered.
  private handlerRoles: Map<string, 'view' | 'worker'> = new Map();

  // Svelte 5 reactive state
  public filteredActions: ApplicationAction[] = [];

  constructor() {
    this.registerBuiltInActions();
    this.updateState();
  }

  setExtensionForwarder(
    fn: (
      extensionId: string,
      actionId: string,
      role?: 'view' | 'worker',
      payload?: unknown,
    ) => void,
  ): void {
    this.sendToExtension = fn;
  }

  /**
   * Stamp which iframe role owns the handler for a manifest-declared action.
   * Called by ExtensionIpcRouter when the SDK round-trips
   * actions:registerActionHandler. The short `actionId` is whatever the
   * extension passed to registerActionHandler; we key on the full
   * `act_<extensionId>_<actionId>` so lookups on dispatch are direct.
   */
  recordActionHandlerRole(extensionId: string, actionId: string, role: 'view' | 'worker'): void {
    this.handlerRoles.set(toFullActionId(extensionId, actionId), role);
  }

  getActionHandlerRole(fullActionId: string): 'view' | 'worker' | undefined {
    return this.handlerRoles.get(fullActionId);
  }

  /**
   * Set the current action context and optional active extensionId
   */
  setContext(context: ActionContext, extensionId?: string | { commandId?: string }): void {
    const extId = typeof extensionId === 'string' ? extensionId : undefined;
    // Only update if context or extensionId actually changes
    if (this.currentContext !== context || this.currentExtensionId !== extId) {
      this.currentContext = context;
      this.currentExtensionId = extId;
      logService.debug(`Action context set to: ${context}${extId ? ` (extension: ${extId})` : ''}`);
      this.updateState(); // Update the Svelte state with filtered actions
    }
  }

  /**
   * Get the current action context
   */
  getContext(): ActionContext {
    return this.currentContext;
  }

  /**
   * Register an action from an extension or core
   */
  registerAction(action: ExtensionAction | ApplicationAction): void {
    // Ensure it conforms to ApplicationAction structure internally
    const appAction: ApplicationAction = {
      id: action.id,
      label: 'title' in action ? action.title : action.label, // Handle both interfaces
      icon: action.icon,
      description: action.description,
      extensionId: 'extensionId' in action ? action.extensionId : undefined,
      category: action.category,
      // Use the context provided, default if necessary, ensure it's the enum type
      context: action.context || ActionContext.EXTENSION_VIEW,
      confirm: 'confirm' in action ? action.confirm : undefined,
      destructive: 'destructive' in action ? action.destructive : undefined,
      shortcut: 'shortcut' in action ? action.shortcut : undefined,
      execute: action.execute,
      disabled: 'disabled' in action ? action.disabled : undefined,
      visible: 'visible' in action ? (action as any).visible : undefined,
    };

    this.allActions.set(appAction.id, appAction); // Store in the master list
    logService.debug(
      `Registered action: ${appAction.id} from ${
        appAction.extensionId || 'core'
      }, context: ${appAction.context || 'default'}`,
    );

    // Update the state if the action matches the current context
    this.updateState();
  }

  /**
   * Unregister an action
   */
  unregisterAction(actionId: string): void {
    const hadAction = this.allActions.delete(actionId);
    const hadRole = this.handlerRoles.delete(actionId);
    if (hadAction) {
      logService.debug(`Unregistered action: ${actionId}`);
      this.updateState();
    } else if (!hadRole) {
      logService.warn(`Attempted to unregister non-existent action: ${actionId}`);
    }
  }

  /**
   * Remove all actions registered by a specific extension.
   * Call this when an extension view is closed to prevent stale actions from persisting.
   */
  clearActionsForExtension(extensionId: string): void {
    let changed = false;
    for (const [id, action] of this.allActions) {
      if (action.extensionId === extensionId) {
        this.allActions.delete(id);
        changed = true;
      }
    }
    // Drop stored handler-role entries even if no metadata exists — the SDK
    // may have rolled up handlers before registerAction arrived, or an
    // extension may have registered a handler for a manifest-only action.
    const rolePrefix = `act_${extensionId}_`;
    for (const key of this.handlerRoles.keys()) {
      if (key.startsWith(rolePrefix)) {
        this.handlerRoles.delete(key);
      }
    }
    if (changed) {
      logService.debug(`[ActionService] Cleared all actions for extension: ${extensionId}`);
      this.updateState();
    }
  }

  /**
   * Get all registered actions (primarily for internal use or debugging)
   * Note: This returns ALL actions, not filtered by context.
   */
  getAllActions(): ApplicationAction[] {
    return Array.from(this.allActions.values());
  }

  /**
   * Get actions filtered by the current context
   */
  private getFilteredActions(): ApplicationAction[] {
    const filtered = Array.from(this.allActions.values()).filter(
      this.filterActionsByContext.bind(this),
    );

    // Log details about filtered actions
    logService.debug(
      `Filtering actions for context: ${this.currentContext}. Found ${filtered.length} actions.`,
    );

    return filtered;
  }

  /**
   * Get actions based on a specific context (implements IActionService method)
   */
  getActions(context?: ActionContext): ExtensionAction[] {
    const targetContext = context || this.currentContext;
    if (targetContext === ActionContext.COMMAND_RESULT) {
      logService.warn(
        'getActions(COMMAND_RESULT) called directly; may not return correct results.',
      );
    }
    return Array.from(this.allActions.values())
      .filter((action) => action.context === targetContext) // Simple context filter for this specific method
      .map((action) => ({
        // Map back to ExtensionAction interface
        id: action.id,
        title: action.label,
        description: action.description,
        icon: action.icon,
        // Ensure extensionId is a string, default to 'core' if undefined
        extensionId: action.extensionId || 'core',
        category: action.category,
        context: action.context, // Pass context through
        execute: action.execute,
      }));
  }

  /**
   * Filter actions based on the current internal context
   */
  private filterActionsByContext(action: ApplicationAction): boolean {
    // If a visibility callback is defined and returns false, hide the action
    if (action.visible && !action.visible()) {
      return false;
    }

    // Handle EXTENSION_VIEW context specifically. Only the active
    // extension's own actions are shown — GLOBAL actions from unrelated
    // extensions (e.g. Spotify) must not leak into another extension's
    // action drawer, where they have no meaning for the selected content.
    if (this.currentContext === ActionContext.EXTENSION_VIEW) {
      if (action.context === ActionContext.EXTENSION_VIEW) {
        if (this.currentExtensionId && action.extensionId) {
          return action.extensionId === this.currentExtensionId;
        }
        return !action.extensionId;
      }
      return false;
    }

    // Handle specific contexts (SEARCH_VIEW, etc.)
    if (action.context === this.currentContext && this.currentContext !== ActionContext.CORE) {
      return true;
    }

    // Handle GLOBAL actions - show them in CORE context
    if (action.context === ActionContext.GLOBAL && this.currentContext === ActionContext.CORE) {
      return true;
    }

    // Fallback: If context is CORE, show CORE actions only if no context-specific actions are available
    if (this.currentContext === ActionContext.CORE && action.context === ActionContext.CORE) {
      const specificActionCount = Array.from(this.allActions.values()).filter(
        (a) =>
          a.context === this.currentContext &&
          a.context !== ActionContext.CORE &&
          a.context !== ActionContext.GLOBAL,
      ).length;
      return specificActionCount === 0;
    }

    return false;
  }

  /**
   * Execute an action by ID
   */
  async executeAction(actionId: string): Promise<void> {
    const action = this.allActions.get(actionId); // Get from the master list
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }

    logService.info(`Executing action: ${actionId} from ${action.extensionId || 'core'}`);

    try {
      if (typeof action.execute === 'function') {
        await action.execute();
      } else if (action.extensionId && this.sendToExtension) {
        // Forward the stored role (if any) so the iframe manager can target
        // the correct iframe. undefined = legacy/unknown — let the forwarder
        // fall back to view-prefer default.
        this.sendToExtension(action.extensionId, actionId, this.handlerRoles.get(actionId));
      } else {
        throw new Error(`Action execute is not a function: ${actionId}`);
      }
    } catch (error) {
      logService.error(`Error executing action ${actionId}: ${error}`);
      throw error;
    }
  }

  /**
   * Dispatch a Tier 2 result-action: look up which iframe role registered the
   * handler for (extensionId, actionId) and post the action-execute envelope
   * with the payload. Falls back to the 'worker' role since search-result
   * handlers are registered from the worker in activate().
   */
  executeExtensionAction(extensionId: string, actionId: string, payload?: unknown): boolean {
    // The SDK's action registry keys handlers on the full `act_<ext>_<short>`
    // id (both registerActionHandler and the asyar:action:execute receiver),
    // so the envelope must carry the full id — callers pass the short id.
    const fullActionId = toFullActionId(extensionId, actionId);
    const role = this.handlerRoles.get(fullActionId);
    this.sendToExtension?.(extensionId, fullActionId, role ?? 'worker', payload);
    return true;
  }

  /**
   * Register built-in application actions
   */
  private registerBuiltInActions() {
    this.registerAction({
      id: 'settings',
      label: 'Settings',
      icon: 'icon:settings',
      description: 'Configure application settings',
      category: 'System',
      context: ActionContext.CORE,
      execute: async () => {
        logService.info('Executing built-in action: Open Settings');
        try {
          await commands.showSettingsWindow();
        } catch (err) {
          logService.error(`Failed to open settings window: ${err}`);
        }
      },
    });

    this.registerAction({
      id: 'send_feedback',
      label: 'Send Feedback',
      icon: 'icon:info',
      description: 'Share an idea, praise, or report a problem',
      category: 'System',
      context: ActionContext.CORE,
      execute: async () => {
        logService.info('Executing built-in action: Send Feedback');
        try {
          await commandService.executeCommand('cmd_feedback_send-feedback');
        } catch (err) {
          logService.error(`Failed to open feedback window: ${err}`);
        }
      },
    });

    this.registerAction({
      id: 'reset_search',
      label: 'Reset Search Index',
      icon: 'icon:refresh',
      description: 'Reset the search index',
      category: 'System',
      context: ActionContext.CORE,
      visible: () => developerSettingsService.isDeveloperMode,
      execute: async () => {
        logService.info('Executing built-in action: Reset Search Index');
        await searchService.resetIndex();
      },
    });

    this.registerAction({
      id: 'factory_reset',
      label: 'Reset Flowkey to Factory Default',
      icon: 'icon:trash',
      description:
        'Erase all Flowkey data — settings, history, snippets, shortcuts, installed extensions — and quit',
      category: 'Danger',
      context: ActionContext.CORE,
      confirm: true,
      visible: () => developerSettingsService.isDeveloperMode,
      execute: async () => {
        logService.info('Executing built-in action: Factory Reset');
        const confirmed = await feedbackService.confirmAlert({
          title: 'Reset Flowkey to Factory Default?',
          message:
            'Flowkey will quit. The next time you launch it, every setting, clipboard entry, snippet, shortcut, alias, OAuth token, and installed extension will be erased. This cannot be undone.',
          confirmText: 'Reset & Quit',
          cancelText: 'Cancel',
          variant: 'danger',
        });
        if (!confirmed) return;
        // Rust wipes app_data_dir + the OS keychain, but localStorage lives
        // outside app_data_dir and lib/persistence/extensionStore.ts mirrors
        // some Tauri-store data (portals, snippets-enabled) into it with a
        // migrate-back-on-load fallback — clear it here or "erased" data
        // resurrects itself on next launch.
        localStorage.clear();
        // Rust writes a sentinel and calls app.exit(0); the wipe runs at the
        // next cold start before any DB connection is opened. The promise
        // does not resolve on this page because the process exits.
        await commands.factoryReset();
      },
    });

    this.registerAction({
      id: 'uninstall_application',
      label: 'Uninstall Application',
      icon: 'icon:trash',
      description: 'Launch the installer to remove this application',
      category: 'Danger',
      context: ActionContext.CORE,
      confirm: true,
      destructive: true,
      visible: () => {
        if (!UNINSTALL_SUPPORTED) return false;
        const idx = searchStores.selectedIndex;
        if (idx < 0) return false;
        const item = searchOrchestrator.items[idx];
        if (!item || item.type !== 'application') return false;
        if (!item.path) return false;
        // Windows has no single-prefix system boundary — the registry
        // SystemComponent flag is the backstop instead, enforced by
        // ensure_windows_entry_allowed in Rust.
        return true;
      },
      execute: async () => {
        const idx = searchStores.selectedIndex;
        if (idx < 0) return;
        const item = searchOrchestrator.items[idx];
        if (!item || item.type !== 'application' || !item.path) return;

        const appName = item.name;
        const appPath = item.path;

        // Windows skips the data scan entirely; the vendor uninstaller
        // handles data cleanup.
        const dataPaths: string[] = [];
        const confirmMessage = `This will launch the uninstaller for ${appName}. The vendor's uninstaller will take over from there.`;

        const confirmButton = 'Open Uninstaller';
        const successHud = 'Uninstaller launched';

        const confirmed = await feedbackService.confirmAlert({
          title: `Uninstall ${appName}?`,
          message: confirmMessage,
          confirmText: confirmButton,
          variant: 'danger',
        });
        if (!confirmed) return;

        try {
          await applicationService.uninstallApplication(appPath, dataPaths);
          await islandService.show({ icon: '📦', title: successHud, dismissLauncher: true });
        } catch (err) {
          logService.error(`Uninstall failed for '${appPath}': ${err}`);
          const reason = err instanceof Error ? err.message : String(err);
          await islandService.show({
            icon: '⚠️',
            title: `Uninstall failed: ${reason}`,
            dismissLauncher: true,
          });
        }
      },
    });

    this.registerAction({
      id: 'copy_deeplink',
      label: 'Copy Deeplink',
      icon: 'icon:link',
      description: 'Copy a deep link URL for this command',
      category: 'Share',
      context: ActionContext.CORE,
      shortcut: 'Super+Shift+C',
      visible: () => {
        const idx = searchStores.selectedIndex;
        if (idx < 0) return false;
        const item = searchOrchestrator.items[idx];
        return item?.type === 'command';
      },
      execute: async () => {
        const idx = searchStores.selectedIndex;
        if (idx < 0) return;
        const item = searchOrchestrator.items[idx];
        if (!item || item.type !== 'command' || !item.extensionId) return;

        const extensionId = item.extensionId;
        const commandId = item.objectId.slice('cmd_'.length + extensionId.length + 1);
        const url = `asyar://extensions/${encodeURIComponent(extensionId)}/${encodeURIComponent(commandId)}`;

        await writeText(url);
        await islandService.show({
          icon: '🔗',
          title: 'Deeplink Copied to Clipboard',
          dismissLauncher: true,
        });
      },
    });

    this.registerAction({
      id: 'view_extension_commands',
      label: 'View Extension Commands',
      icon: 'icon:list',
      description: 'Show all commands provided by this extension',
      category: 'Extension',
      context: ActionContext.CORE,
      shortcut: 'Super+Shift+E',
      visible: () => {
        const idx = searchStores.selectedIndex;
        if (idx < 0) return false;
        const item = searchOrchestrator.items[idx];
        return !!(item && item.type === 'command' && item.extensionId);
      },
      execute: async () => {
        const idx = searchStores.selectedIndex;
        if (idx < 0) return;
        const item = searchOrchestrator.items[idx];
        if (!item || item.type !== 'command' || !item.extensionId) return;

        const extensionId = item.extensionId;
        const slug = extensionId.split('.').pop() ?? extensionId;
        searchStores.query = `@${slug} `;
      },
    });

    this.registerAction({
      id: 'configure_extension',
      label: 'Configure Extension Settings',
      icon: 'icon:settings',
      description: 'Open preferences and settings for this extension',
      category: 'Extension',
      context: ActionContext.CORE,
      shortcut: 'Super+Shift+,',
      visible: () => {
        const idx = searchStores.selectedIndex;
        if (idx < 0) return false;
        const item = searchOrchestrator.items[idx];
        return !!(item && item.type === 'command' && item.extensionId);
      },
      execute: async () => {
        const idx = searchStores.selectedIndex;
        if (idx < 0) return;
        const item = searchOrchestrator.items[idx];
        if (!item || item.type !== 'command' || !item.extensionId) return;

        await commands.showSettingsWindow('extensions', item.extensionId);
      },
    });

    // Favorites: pin/unpin the selected application or command into the
    // "Favorites" section at the top of the root list. Two actions instead of
    // one toggle so the label always names the effect. Persisted in Rust
    // (search_index.db); favoritesService mirrors the id set for visibility.
    const favoritableSelected = (): { objectId: string } | null => {
      const idx = searchStores.selectedIndex;
      if (idx < 0) return null;
      const item = searchOrchestrator.items[idx];
      // Only indexed items (apps and commands) can be favorited — extension
      // result ids are ephemeral and would orphan their pin.
      if (!item || (item.type !== 'application' && item.type !== 'command')) return null;
      return { objectId: item.objectId };
    };

    this.registerAction({
      id: 'pin_favorite',
      label: 'Pin to Favorites',
      icon: 'icon:pin',
      description: 'Show this item in the Favorites section at the top',
      category: 'Favorites',
      context: ActionContext.CORE,
      visible: () => {
        const selected = favoritableSelected();
        return !!selected && !favoritesService.isFavorite(selected.objectId);
      },
      execute: async () => {
        const selected = favoritableSelected();
        if (!selected) return;
        await favoritesService.toggle(selected.objectId);
        // Re-run the current search so the Favorites section updates in place.
        await searchOrchestrator.handleSearch(searchStores.query);
      },
    });

    this.registerAction({
      id: 'unpin_favorite',
      label: 'Unpin from Favorites',
      icon: 'icon:pin',
      description: 'Remove this item from the Favorites section',
      category: 'Favorites',
      context: ActionContext.CORE,
      visible: () => {
        const selected = favoritableSelected();
        return !!selected && favoritesService.isFavorite(selected.objectId);
      },
      execute: async () => {
        const selected = favoritableSelected();
        if (!selected) return;
        await favoritesService.toggle(selected.objectId);
        await searchOrchestrator.handleSearch(searchStores.query);
      },
    });
  }

  /**
   * Update the reactive state with currently relevant actions based on context.
   */
  private updateState() {
    this.filteredActions = this.getFilteredActions();
  }

  /**
   * No-op on the host side — this method exists only on the SDK proxy for
   * Tier 2 extensions to register iframe-local handlers. Tier 1 built-ins
   * call setActionExecutor() instead.
   */
  registerActionHandler(_actionId: string, _handler: () => Promise<void> | void): void {
    // intentional no-op
  }

  /**
   * Wire an execute callback into an already-registered action without
   * overwriting its other fields (visible, label, context, etc.).
   *
   * Use this for Tier 1 built-in extensions that want to respond to
   * manifest-declared actions: the host registers the action metadata +
   * visible() callback; the extension calls setActionExecutor() in
   * initialize() to supply the actual handler.
   *
   * No-op if the action does not exist yet.
   */
  setActionExecutor(actionId: string, executor: () => Promise<void> | void): void {
    const action = this.allActions.get(actionId);
    if (!action) return;
    action.execute = executor;
  }

  /**
   * Public trigger for re-filtering actions.
   * Call when external state (e.g. selected search result) changes
   * and visible() callbacks need re-evaluation.
   */
  refreshFiltered(): void {
    this.updateState();
  }
}

export const actionService = new ActionService();

// Backward compatibility for actionStore
export const actionStore = {
  get subscribe() {
    return (fn: (v: ApplicationAction[]) => void) => {
      fn(actionService.filteredActions);
      return () => {};
    };
  },
};
