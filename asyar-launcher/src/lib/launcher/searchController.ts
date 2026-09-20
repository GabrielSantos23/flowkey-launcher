import { searchStores } from '../../services/search/stores/search';
import { logService } from '../../services/log/logService';
import extensionManager from '../../services/extension/extensionManager';
import { contextModeService } from '../../services/context/contextModeService';
import { contextActivationId } from '../../services/context/contextModeService';
import { searchOrchestrator } from '../../services/search/searchOrchestrator';
import type { LauncherState } from './launcherState';
import { feedbackService } from '../../services/feedback/feedbackService';
import type { ContextHint, ActiveContext } from '../../services/context/contextModeService';
import { resetListScroll } from '../listScroll';
import { effect as launcherEffect } from '../../lib/reactive';
/**
 * Macrotask flush — the React-era replacement for Svelte's `tick()`.
 */
function flushUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Pure derivation: decides what `contextModeService.contextHint` should be.
 *
 * - When a Tier 2 view is active the chip must be null so it doesn't float
 *   over the view's own search bar.
 * - When a context (portal) is already committed the hint is also null.
 * - Otherwise delegates to `computeHint` (wraps `contextModeService.getHint`).
 */
export function nextContextHint(args: {
  activeViewActive: boolean;
  localSearchValue: string;
  activeContext: ActiveContext | null;
  computeHint: (text: string) => ContextHint | null;
}): ContextHint | null {
  if (args.activeViewActive) return null;
  if (args.activeContext != null) return null;
  return args.computeHint(args.localSearchValue);
}

export function setupSearchEffects(state: LauncherState) {
  // Sync localSearchValue whenever searchStores.query is modified externally
  // (e.g. viewManager.navigateToView, viewManager.goBack, resetLauncherState)
  launcherEffect(() => {
    const q = searchStores.query;
    if (state.localSearchValue !== q) {
      state.localSearchValue = q;
    }
  });

  // Effect 3: Handle context activation signal
  launcherEffect(() => {
    const signal = state.contextActivationIdVal;
    if (signal !== null) {
      contextModeService.contextActivationId = null;
      contextModeService.activate(signal, '');
      state.localSearchValue = '';
      searchStores.query = '';
      flushUi().then(() => state.getSearchInput()?.focus());
    }
  });

  // Effect 4: Sync contextQuery from activeContext
  launcherEffect(() => {
    state.contextQuery = state.activeContext?.query ?? '';
  });

  // Effect 5: Trigger detection and search
  launcherEffect(() => {
    if (!state.activeViewVal && state.localSearchValue !== undefined && !state.activeContext) {
      const match = contextModeService.getMatch(state.localSearchValue);
      if (match) {
        contextModeService.activate(match.provider.id, match.query);
        searchOrchestrator.handleSearch(match.query || match.provider.display.name);
      } else {
        if (contextModeService.isActive()) contextModeService.deactivate();
        searchOrchestrator.handleSearch(state.localSearchValue);
      }
    } else if (
      state.activeViewVal &&
      state.activeViewSearchableVal &&
      state.localSearchValue !== undefined
    ) {
      logService.debug(`Search in extension: "${state.localSearchValue}"`);
      extensionManager.handleViewSearch(state.localSearchValue);
    }
    contextModeService.contextHint = nextContextHint({
      activeViewActive: !!state.activeViewVal,
      localSearchValue: state.localSearchValue ?? '',
      activeContext: state.activeContext ?? null,
      computeHint: (text) => contextModeService.getHint(text),
    });
  });

  // Effect 6: clear pinned hint when the search bar is wiped.
  // The user abandoned the prepared query; don't keep forcing a chip.
  launcherEffect(() => {
    if (!state.localSearchValue) {
      contextModeService.pinnedHintProviderId = null;
    }
  });
}

/** Handler methods that operate on search/context state */
export function createSearchHandlers(state: LauncherState) {
  return {
    handleSearchInput(event: Event) {
      const value = (event.target as HTMLInputElement).value;
      state.localSearchValue = value;
      searchStores.query = value;
      feedbackService.dismiss();
      const listContainer = state.getListContainer();
      if (listContainer) resetListScroll(listContainer);
    },

    handleContextDismiss(_clearAll = false) {
      contextModeService.deactivate();
      state.localSearchValue = '';
      searchStores.query = '';
      state.contextQuery = '';
      const listContainer = state.getListContainer();
      if (listContainer) resetListScroll(listContainer);
      flushUi().then(() => state.getSearchInput()?.focus());
    },

    handleChipDismiss() {
      this.handleContextDismiss(true);
      if (state.activeViewVal) {
        extensionManager.goBack();
      }
    },

    handleContextQueryChange(detail: { query: string }) {
      const query = detail.query;
      contextModeService.updateQuery(query);
      searchOrchestrator.handleSearch(query);
      const listContainer = state.getListContainer();
      if (listContainer) resetListScroll(listContainer);
    },

    handleBackClick() {
      if (state.activeViewVal) {
        extensionManager.goBack();
      }
    },
  };
}
