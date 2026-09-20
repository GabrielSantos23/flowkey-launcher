/** @vitest-environment jsdom
 *
 * Integration test for the reactive launcher chain: typing a query must flow
 * signal → Effect 5 (search) → orchestrator.items → remap →
 * searchResultItemsMapped → notifyReact. Only the IPC boundary is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));

vi.mock('../../services/log/logService', () => ({
  logService: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), custom: vi.fn() },
}));

vi.mock('../../services/feedback/feedbackService', () => ({
  feedbackService: { report: vi.fn(), dismiss: vi.fn(), confirmAlert: vi.fn() },
}));

vi.mock('../../services/appInitializer', () => ({
  appInitializer: {
    init: vi.fn().mockResolvedValue(true),
    isAppInitialized: vi.fn(() => true),
  },
}));

vi.mock('../../services/extension/extensionManager', () => ({
  default: {
    searchAll: vi.fn().mockResolvedValue([]),
    getManifestById: vi.fn(() => undefined),
    getLoadedExtensionModule: vi.fn(() => undefined),
    getCommandArgMeta: vi.fn().mockResolvedValue(null),
    handleCommandAction: vi.fn(),
    isExtensionEnabled: vi.fn(() => true),
    init: vi.fn().mockResolvedValue(true),
    isInitialized: true,
  },
}));

vi.mock('../../services/extension/commandService', () => ({
  commandService: {
    liveSubtitles: {},
    executeCommand: vi.fn(),
    commands: new Map(),
    clearCommandsForExtension: vi.fn(),
  },
}));

vi.mock('../../services/extension/viewManager', () => ({
  viewManager: {
    activeView: null,
    activeViewSearchable: false,
    getNavigationStackSize: vi.fn(() => 0),
    navigateToView: vi.fn(),
    goBack: vi.fn(),
    withReplacementSemantics: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    setModuleResolver: vi.fn(),
    init: vi.fn(),
    isViewActive: vi.fn(() => false),
  },
}));

vi.mock('../../services/context/contextModeService', () => ({
  contextModeService: {
    getMatch: vi.fn(() => null),
    getHint: vi.fn(() => null),
    isActive: vi.fn(() => false),
    activate: vi.fn(),
    deactivate: vi.fn(),
    contextActivationId: null,
    activeContext: null,
    contextHint: null,
    pinnedHintProviderId: null,
    getProviderForCommand: vi.fn(() => null),
  },
}));

vi.mock('../../built-in-features/aliases/aliasStore', () => ({
  aliasStore: { getForTarget: vi.fn(() => null) },
}));

vi.mock('../../services/run/runService', () => ({
  runService: {
    active: [],
    unacknowledgedFailures: [],
    keptAgents: [],
    unacknowledgedScriptResults: [],
    onStateChanged: vi.fn(),
  },
}));

vi.mock('../../services/action/actionService', () => ({
  actionService: {
    registerAction: vi.fn(),
    unregisterAction: vi.fn(),
    clearActionsForExtension: vi.fn(),
    setContext: vi.fn(),
    setExtensionForwarder: vi.fn(),
    executeExtensionAction: vi.fn(),
    refreshFiltered: vi.fn(),
  },
}));

vi.mock('../../built-in-features/shortcuts/shortcutStore', () => ({
  shortcutStore: { shortcuts: [], init: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/extension/extensionDiscovery', () => ({
  isBuiltInFeature: vi.fn(() => false),
  discoverExtensions: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../lib/ipc/commands', () => ({
  commands: {
    mergedSearch: vi.fn().mockResolvedValue({ results: [], aliasMatch: null }),
  },
  mergedSearch: vi.fn().mockResolvedValue({ results: [], aliasMatch: null }),
}));

import { searchOrchestrator } from '../../services/search/searchOrchestrator';
import { searchStores } from '../../services/search/stores/search';
import * as commandsModule from '../../lib/ipc/commands';
import { LauncherController } from './launcherController';
import { subscribeReact } from '../../lib/reactive';

const mergedSearch = vi.mocked((commandsModule as any).mergedSearch);

function makeResult(over: Record<string, unknown> = {}) {
  return {
    objectId: 'cmd_test_demo',
    name: 'Demo Command',
    type: 'command',
    score: 1,
    ...over,
  } as any;
}

describe('reactive launcher chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchStores.query = '';
    searchStores.selectedIndex = -1;
    searchStores.isLoading = false;
    searchOrchestrator.items = [];
    mergedSearch.mockResolvedValue({ results: [makeResult()], aliasMatch: null });
  });

  it('typing a query flows signals → search → mapped results → React notify', async () => {
    const onReact = vi.fn();
    const unsub = subscribeReact(onReact);
    const controller = new LauncherController();
    controller.setupEffects();
    await new Promise((r) => setTimeout(r, 0));
    onReact.mockClear();

    // Simulate the user typing.
    controller.state.localSearchValue = 'demo';
    searchStores.query = 'demo';
    await new Promise((r) => setTimeout(r, 20));

    expect(searchOrchestrator.items).toHaveLength(1);
    expect(controller.searchResultItemsMapped).toHaveLength(1);
    expect(controller.searchResultItemsMapped[0].object_id).toBe('cmd_test_demo');
    expect(onReact).toHaveBeenCalled();
    unsub();
  });

  it('initial handleSearch seeds top items on the empty query', async () => {
    mergedSearch.mockResolvedValue({
      results: [makeResult({ objectId: 'app_test_1', name: 'Test App', type: 'application' })],
      aliasMatch: null,
    });
    const controller = new LauncherController();
    controller.setupEffects();
    await new Promise((r) => setTimeout(r, 30));

    expect(searchOrchestrator.items.length).toBeGreaterThanOrEqual(1);
    expect(controller.searchResultItemsMapped.some((i) => i.object_id === 'app_test_1')).toBe(true);
  });
});
