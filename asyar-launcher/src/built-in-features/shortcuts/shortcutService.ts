import { shortcutStore, type ItemShortcut } from './shortcutStore';
import { applicationService } from '../../services/application/applicationsService';
import extensionManager from '../../services/extension/extensionManager';
import { parseShortcut, normalizeShortcut, VALID_KEYS, initValidKeys } from './shortcutFormatter';
import { settingsService } from '../../services/settings/settingsService';
import { contextActivationId, contextModeService } from '../../services/context/contextModeService';
import { viewManager } from '../../services/extension/viewManager';
import { searchStores } from '../../services/search/stores/search';
import { portalStore } from '../portals/portalStore';
import { logService } from '../../services/log/logService';
import { commandService } from '../../services/extension/commandService';
import { showWindow, registerItemShortcut, unregisterItemShortcut } from '../../lib/ipc/commands';

/**
 * Flush pending UI work before showing the window — the React replacement
 * for Svelte's `tick()`: two rAFs guarantee a committed frame, same gate the
 * launcher's reveal handshake uses.
 */
async function waitForPaint(): Promise<void> {
  if (typeof requestAnimationFrame === 'function') {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return;
  }
  // Node test environment has no rAF — a macrotask flush is equivalent here.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

class ShortcutService {
  async init(): Promise<void> {
    await initValidKeys();
    await shortcutStore.init();

    // Rust emits this event whenever a user-registered item shortcut fires.
    // Without this subscription the bindings register fine but pressing
    // them does nothing (the dispatch path was lost in the React port).
    const { listen } = await import('@tauri-apps/api/event');
    await listen<string>('user-shortcut-fired', (event) => {
      void this.handleFiredShortcut(event.payload).catch((e) =>
        logService.error(`Failed to handle fired shortcut: ${e}`),
      );
    });

    const shortcuts = shortcutStore.shortcuts;
    await Promise.all(
      shortcuts.map(async (s) => {
        const [modifier, key] = parseShortcut(s.shortcut);
        const ok = await registerItemShortcut(s.objectId, modifier, key);
        if (!ok) {
          logService.warn(`Failed to re-register shortcut ${s.shortcut} for ${s.itemName}`);
        }
      }),
    );
  }

  async register(
    objectId: string,
    itemName: string,
    itemType: 'application' | 'command',
    shortcut: string,
    itemPath?: string,
    itemIcon?: string,
  ): Promise<{ ok: boolean; conflict?: { objectId: string; itemName: string } }> {
    const conflict = await this.isConflict(shortcut, objectId);
    if (conflict) {
      return { ok: false, conflict };
    }

    const [modifier, key] = parseShortcut(shortcut);

    // Reassigning preserves the original icon when the caller doesn't pass one.
    const existing = shortcutStore.getByObjectId(objectId);
    if (existing) {
      await this.unregister(objectId);
    }
    const resolvedIcon = itemIcon ?? existing?.itemIcon;

    const registered = await registerItemShortcut(objectId, modifier, key);
    if (!registered) {
      logService.error(`Failed to register shortcut for ${objectId}`);
      return {
        ok: false,
        conflict: { objectId: 'error', itemName: 'Failed to register shortcut' },
      };
    }
    shortcutStore.add({
      id: crypto.randomUUID(),
      objectId,
      itemName,
      itemType,
      itemPath,
      itemIcon: resolvedIcon,
      shortcut,
      createdAt: Date.now(),
    });
    return { ok: true };
  }

  async unregister(objectId: string): Promise<void> {
    const existing = shortcutStore.getByObjectId(objectId);
    if (!existing) return;

    const [modifier, key] = parseShortcut(existing.shortcut);
    const ok = await unregisterItemShortcut(modifier, key);
    if (ok) {
      shortcutStore.remove(objectId);
    } else {
      logService.error(`Failed to unregister shortcut for ${objectId}`);
    }
  }

  getShortcutForItem(objectId: string): ItemShortcut | undefined {
    return shortcutStore.getByObjectId(objectId);
  }

  getAllShortcuts(): ItemShortcut[] {
    return shortcutStore.getAll();
  }

  async isConflict(
    shortcut: string,
    excludeObjectId?: string,
  ): Promise<{ objectId: string; itemName: string } | null> {
    const normalized = normalizeShortcut(shortcut);
    const all = shortcutStore.getAll();
    const existing = all.find(
      (s) => normalizeShortcut(s.shortcut) === normalized && s.objectId !== excludeObjectId,
    );
    if (existing) {
      return { objectId: existing.objectId, itemName: existing.itemName };
    }

    try {
      if (excludeObjectId !== 'launcher') {
        const persisted = settingsService.getSettings().shortcut;
        const launcherRaw = persisted.modifier
          ? `${persisted.modifier}+${persisted.key}`
          : persisted.key;
        const launcherShortcut = normalizeShortcut(launcherRaw);
        if (normalized === launcherShortcut) {
          return { objectId: 'launcher', itemName: 'Launcher Toggle' };
        }
      }
    } catch (e) {
      // ignore
    }

    return null;
  }

  async handleFiredShortcut(objectId: string): Promise<void> {
    let shortcutInfo = shortcutStore.getByObjectId(objectId);
    if (!shortcutInfo) {
      // Self-heal: the in-memory cache can be stale (e.g. the binding was
      // added in the settings window and the cross-webview reload raced).
      // Reload once and retry before giving up.
      await shortcutStore.reload();
      shortcutInfo = shortcutStore.getByObjectId(objectId);
      if (!shortcutInfo) {
        logService.warn(`Received shortcut for unknown objectId: ${objectId}`);
        return;
      }
    }
    if (shortcutInfo.itemType === 'application') {
      try {
        await applicationService.open({
          objectId: shortcutInfo.objectId,
          name: shortcutInfo.itemName,
          path: shortcutInfo.itemPath || '',
          type: 'application',
          score: 1,
          tier: 5, // untiered: opened directly from a shortcut binding, not search results
          icon: '', // Not used by opening logic
        });
      } catch (e) {
        logService.error(`Failed to open app: ${e}`);
      }
    } else if (shortcutInfo.itemType === 'command') {
      // Fresh entry point: drop any lingering chip/query.
      if (contextModeService.isActive()) contextModeService.deactivate();
      searchStores.query = '';

      if (shortcutInfo.objectId.startsWith('cmd_portals_')) {
        const portalId = shortcutInfo.objectId.replace('cmd_portals_', '');
        // Self-heal shortcuts orphaned by a portal deletion that predates the
        // teardown in deletePortal (or synced in from another device): firing
        // a binding whose portal is gone tears the binding down.
        if (!portalStore.getById(portalId)) {
          logService.warn(`Shortcut fired for deleted portal ${portalId} — unregistering`);
          await this.unregister(shortcutInfo.objectId);
          return;
        }

        const provider = contextModeService.getProviderForCommand(shortcutInfo.objectId);
        if (provider && provider.needsQuery === false) {
          try {
            await commandService.executeCommand(shortcutInfo.objectId);
          } catch (e) {
            logService.error(`Failed to execute portal shortcut: ${e}`);
          }
          return;
        }

        // Portals with query tokens activate a chip mode instead of navigating, so there's no
        // navigateToView for replacement semantics to piggyback on — drain
        // the stack explicitly before seeding the chip.
        while (viewManager.getNavigationStackSize() > 0) {
          viewManager.goBack();
        }
        // The activation signal is consumed by contextModeService.activate(),
        // which resolves context PROVIDER ids — portals register theirs as
        // `portal_<portalId>`. The raw portal id silently activates nothing.
        contextActivationId.set(`portal_${portalId}`);
        await waitForPaint();
        await showWindow();
      } else {
        try {
          // Route through handleCommandAction (the same dispatcher the launcher
          // Enter key uses) so dynamic commands — silent agents, scripts,
          // Apple Shortcuts — resolve through their built-in dispatchers
          // instead of failing in the static-only commandService.commands map.
          // Replacement semantics so escape returns to main, not to whatever
          // stack the user had built before.
          const result = await viewManager.withReplacementSemantics(() =>
            extensionManager.handleCommandAction(shortcutInfo.objectId),
          );
          await waitForPaint();
          // Headless dispatchers (silent agents, background scripts) hide
          // the window inside handleCommandAction and report `type: 'no-view'`
          // back. Re-showing would pop the launcher open after a silent
          // in-place text replace — defeating the headless intent.
          if (result?.type !== 'no-view') {
            await showWindow();
          }
        } catch (e) {
          logService.error(`Failed to execute command: ${e}`);
        }
      }
    }
  }
}

export const shortcutService = new ShortcutService();
