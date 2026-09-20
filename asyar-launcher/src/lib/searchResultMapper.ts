import { logService } from '../services/log/logService';
import { applicationService } from '../services/application/applicationsService';
import { windowService } from '../services/window/windowService';
import { viewManager } from '../services/extension/viewManager';
import extensionManager from '../services/extension/extensionManager';
import { contextModeService } from '../services/context/contextModeService';
import { isBuiltInFeature } from '../services/extension/extensionDiscovery';
import { runService } from '../services/run/runService';
import { favoritesService } from '../services/favorites/favoritesService';
import type { SearchResult } from '../services/search/interfaces/SearchResult';
import type { MappedSearchItem } from '../services/search/types/MappedSearchItem';
import type { ActiveContext } from '../services/context/contextModeService';
import type { ItemShortcut } from '../built-in-features/shortcuts/shortcutStore';
import type { Run } from 'asyar-sdk/contracts';

export interface BuildMappedItemsParams {
  searchItems: SearchResult[];
  activeContext: ActiveContext | null;
  shortcutStore: ItemShortcut[];
  localSearchValue: string;
  selectedIndex: number;
  liveSubtitles?: Record<string, string | null>;
  activeRuns?: Run[];
  failedRuns?: Run[];
  scriptResultRuns?: Run[];
  runTiers?: Map<string, number>;
  query?: string;
  onError: (msg: string) => void;
}

export interface BuildMappedItemsResult {
  mappedItems: MappedSearchItem[];
  selectedOriginal: SearchResult | null;
}

function runKindLabel(kind: Run['kind']): string {
  switch (kind) {
    case 'shell-script':
      return 'Script';
    default:
      return 'Run';
  }
}

function runKindIcon(kind: Run['kind']): string {
  switch (kind) {
    case 'shell-script':
      return 'icon:terminal';
    default:
      return 'icon:activity';
  }
}

function buildRunAction(runId: string): () => Promise<void> {
  return async () => {
    logService.debug(`[searchResultMapper] Opening RunView for run: ${runId}`);
    runService.selectedRunId = runId;
    viewManager.navigateToView('runs/RunView');
  };
}

function buildRunMappedItem(run: Run): MappedSearchItem {
  const isFailed = run.status === 'failed';
  const isKeptDone = run.status === 'succeeded';
  const type = isFailed ? 'run-failed' : isKeptDone ? 'run-done' : 'run';
  const subtitle = isFailed
    ? `Failed · ${run.tailOutput ?? run.errorMessage ?? '(no output)'}`
    : isKeptDone
      ? (run.tailOutput ?? `Finished in ${(run.endedAt! - run.startedAt) / 1000}s`)
      : run.label;

  return {
    object_id: `run_${run.id}`,
    title: run.label,
    type,
    typeLabel: runKindLabel(run.kind),
    icon: runKindIcon(run.kind),
    subtitle,
    score: 1.0,
    action: buildRunAction(run.id),
  };
}

const NO_MATCH_TIER = 5;

export function buildMappedItems(params: BuildMappedItemsParams): BuildMappedItemsResult {
  const {
    searchItems,
    activeContext,
    shortcutStore,
    localSearchValue,
    selectedIndex,
    liveSubtitles,
    activeRuns = [],
    failedRuns = [],
    scriptResultRuns = [],
    runTiers,
    query = '',
    onError,
  } = params;

  // Map active/failed/kept runs to MappedSearchItem
  const q = query.trim();
  const allRuns: Run[] = [...activeRuns, ...failedRuns, ...scriptResultRuns];

  // Interleave runs and search items by tier
  const mappedRuns: MappedSearchItem[] = allRuns
    .filter((run) => {
      if (!q) return true;
      const tier = runTiers?.get(run.id) ?? NO_MATCH_TIER;
      return tier < NO_MATCH_TIER;
    })
    .map(buildRunMappedItem);

  const mappedSearch: MappedSearchItem[] = searchItems.map((result) => {
    const { objectId, name, type, path, score, action: originalExtAction } = result;

    let actionFunction: () => Promise<void>;

    if (originalExtAction) {
      actionFunction = async () => {
        logService.debug(`Executing direct extension action for ${name}`);
        try {
          await Promise.resolve(originalExtAction());
        } catch (err) {
          logService.error(`Direct extension action failed: ${err}`);
          onError(`Action failed for ${name}`);
          throw err;
        }
      };
    } else if (type === 'application') {
      actionFunction = async () => {
        logService.debug(`Calling applicationsService.open for ${name} (ID: ${objectId})`);
        try {
          await applicationService.open(result);
          await windowService.hide();
        } catch (err) {
          logService.error(`applicationsService.open failed: ${err}`);
          onError(`Failed to open ${name}`);
          throw err;
        }
      };
    } else if (type === 'command' && objectId) {
      const commandObjectId = objectId;
      const isPortalCommand =
        activeContext !== null &&
        objectId === `cmd_portals_${activeContext.provider.id.replace('portal_', '')}`;

      actionFunction = async () => {
        logService.debug(`Triggering command for ${name} (${commandObjectId})`);
        try {
          const extensionId = commandObjectId.split('_')[1];
          if (isPortalCommand) {
            contextModeService.activate(activeContext.provider.id, localSearchValue);
            return;
          }

          if (isBuiltInFeature(extensionId)) {
            await extensionManager.handleCommandAction(commandObjectId);
          } else {
            await extensionManager.handleCommandAction(commandObjectId);
          }
        } catch (err) {
          logService.error(`Failed to trigger command: ${err}`);
          onError(`Failed to execute ${name}`);
          throw err;
        }
      };
    } else {
      actionFunction = async () => {
        logService.debug(`Default action triggered for ${name}`);
      };
    }

    // liveSubtitles arrives as a Record from some callers and a Map from
    // others (pre-React code used Map) — accept both.
    const liveSubtitle = objectId
      ? liveSubtitles instanceof Map
        ? liveSubtitles.get(objectId)
        : liveSubtitles?.[objectId]
      : undefined;
    // Extension-contributed results (calculator, units, …) ride through Rust's
    // merged_search with their subtitle in `description`.
    const subtitle = liveSubtitle ?? result.subtitle ?? result.description;

    const shortcut = shortcutStore.find((s) => s.objectId === objectId);

    return {
      object_id: objectId,
      title: name,
      type: type as any,
      typeLabel: type === 'application' ? 'App' : type === 'command' ? 'Command' : 'Item',
      icon: result.icon,
      subtitle,
      score,
      style: result.style,
      action: actionFunction,
      shortcut: shortcut ? shortcut.key : undefined,
      isFavorite: favoritesService.isFavorite(objectId),
    };
  });

  const allMapped = [...mappedRuns, ...mappedSearch];
  const selectedOriginal =
    selectedIndex >= 0 && selectedIndex < searchItems.length ? searchItems[selectedIndex] : null;

  return {
    mappedItems: allMapped,
    selectedOriginal,
  };
}
