import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/log/logService', () => ({
  logService: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../built-in-features/aliases/aliasStore', () => ({
  aliasStore: {
    byObjectId: new Map(),
    getForTarget: vi.fn().mockReturnValue(undefined),
  },
}));
vi.mock('../services/extension/extensionManager', () => ({
  __esModule: true,
  default: {
    getManifestById: vi.fn(),
    handleCommandAction: vi.fn().mockResolvedValue(undefined),
    manifestCommandHasArguments: vi.fn(),
  },
}));
vi.mock('../services/application/applicationsService', () => ({
  applicationService: { open: vi.fn() },
}));
vi.mock('../services/run/runService', () => ({
  runService: { selectedRunId: null, active: [], recent: [] },
}));
vi.mock('../services/extension/viewManager', () => ({
  viewManager: { navigateToView: vi.fn() },
}));
vi.mock('../services/search/searchOrchestrator', () => ({
  searchOrchestrator: { tryExecuteResultAction: vi.fn().mockReturnValue(false) },
}));
vi.mock('../services/window/windowService', () => ({
  windowService: { hide: vi.fn().mockResolvedValue(undefined) },
}));

import { buildMappedItems } from './searchResultMapper';
import { categorizeItem, buildSectionedView } from '../components/list/sectionedListLogic';
import type { SearchResult } from '../services/search/interfaces/SearchResult';
import type { Run } from 'asyar-sdk/contracts';

function makeRun(over: Partial<Run> = {}): Run {
  return {
    id: 'r-1',
    kind: 'shell-script',
    title: 'test run',
    status: 'running',
    startedAt: Date.now(),
    cancellable: true,
    ...over,
  };
}

function makeResult(over: Partial<SearchResult> = {}): SearchResult {
  return {
    objectId: 'cmd_1',
    name: 'Some Command',
    type: 'command',
    score: 0.9,
    ...over,
  };
}

describe('contract: definition rows and run rows are orthogonal', () => {
  describe('scripts', () => {
    it('an active script run is visible alongside its def row', () => {
      const run = makeRun({
        id: 'r-script-active',
        kind: 'shell-script',
        title: 'Update Hosts',
        status: 'running',
        subjectId: 'cmd_scripts_dyn_updates',
      });
      const defRow = makeResult({
        objectId: 'cmd_scripts_dyn_updates',
        name: 'updates',
        type: 'command',
      });

      const { mappedItems } = buildMappedItems({
        searchItems: [defRow],
        activeContext: null,
        shortcutStore: [],
        localSearchValue: '',
        selectedIndex: 0,
        onError: vi.fn(),
        activeRuns: [run],
      });

      const ids = mappedItems.map((m) => m.object_id);
      expect(ids).toContain('run_r-script-active');
      expect(ids).toContain('cmd_scripts_dyn_updates');
    });

    it('a kept-done script result is visible alongside its def row', () => {
      const result = makeRun({
        id: 'r-script-done',
        kind: 'shell-script',
        title: 'Hosts Update',
        status: 'succeeded',
        subjectId: 'cmd_scripts_dyn_hosts',
        tailOutput: 'OK',
        endedAt: Date.now(),
      });
      const defRow = makeResult({
        objectId: 'cmd_scripts_dyn_hosts',
        name: 'hosts',
        type: 'command',
      });

      const { mappedItems } = buildMappedItems({
        searchItems: [defRow],
        activeContext: null,
        shortcutStore: [],
        localSearchValue: '',
        selectedIndex: 0,
        onError: vi.fn(),
        scriptResultRuns: [result],
      });

      const ids = mappedItems.map((m) => m.object_id);
      expect(ids).toContain('run_r-script-done');
      expect(ids).toContain('cmd_scripts_dyn_hosts');
    });

    it('a failed script run is visible alongside its def row', () => {
      const failed = makeRun({
        id: 'r-script-failed',
        kind: 'shell-script',
        title: 'Broken Script',
        status: 'failed',
        subjectId: 'cmd_scripts_dyn_broken',
        errorMessage: 'exit 1',
        endedAt: Date.now(),
      });
      const defRow = makeResult({
        objectId: 'cmd_scripts_dyn_broken',
        name: 'broken',
        type: 'command',
      });

      const { mappedItems } = buildMappedItems({
        searchItems: [defRow],
        activeContext: null,
        shortcutStore: [],
        localSearchValue: '',
        selectedIndex: 0,
        onError: vi.fn(),
        failedRuns: [failed],
      });

      const ids = mappedItems.map((m) => m.object_id);
      expect(ids).toContain('run_r-script-failed');
      expect(ids).toContain('cmd_scripts_dyn_broken');
    });
  });
});

describe('contract: Scripts section is status-only', () => {
  it('an idle script def row is NOT filtered out of mappedItems in empty-query mode', () => {
    const defRow = makeResult({
      objectId: 'cmd_scripts_dyn_idle',
      name: 'Idle Script',
      type: 'command',
    });

    const { mappedItems } = buildMappedItems({
      searchItems: [defRow],
      activeContext: null,
      shortcutStore: [],
      localSearchValue: '',
      selectedIndex: 0,
      onError: vi.fn(),
    });

    const ids = mappedItems.map((m) => m.object_id);
    expect(ids).toContain('cmd_scripts_dyn_idle');
  });

  it('an idle script def row categorizes to Commands, not Scripts', () => {
    const defRow = makeResult({
      objectId: 'cmd_scripts_dyn_idle',
      name: 'Idle Script',
      type: 'command',
    });

    const { mappedItems } = buildMappedItems({
      searchItems: [defRow],
      activeContext: null,
      shortcutStore: [],
      localSearchValue: '',
      selectedIndex: 0,
      onError: vi.fn(),
    });

    const defItem = mappedItems.find((m) => m.object_id === 'cmd_scripts_dyn_idle');
    expect(defItem).toBeDefined();
    expect(categorizeItem(defItem!)).toBe('commands');
  });

  it('a script def row with a live run: def goes to Commands, only the run row sits in Scripts', () => {
    const run = makeRun({
      id: 'r-live',
      kind: 'shell-script',
      title: 'Updates',
      status: 'running',
      subjectId: 'cmd_scripts_dyn_updates',
    });
    const defRow = makeResult({
      objectId: 'cmd_scripts_dyn_updates',
      name: 'updates',
      type: 'command',
    });

    const { mappedItems } = buildMappedItems({
      searchItems: [defRow],
      activeContext: null,
      shortcutStore: [],
      localSearchValue: '',
      selectedIndex: 0,
      onError: vi.fn(),
      activeRuns: [run],
    });

    const rows = buildSectionedView(mappedItems);

    const scriptsIds: string[] = [];
    const commandsIds: string[] = [];
    let bucket: 'scripts' | 'commands' | null = null;
    for (const r of rows) {
      if (r.kind === 'header') {
        bucket = r.section as any;
        continue;
      }
      if (bucket === 'scripts') scriptsIds.push(r.item.object_id);
      if (bucket === 'commands') commandsIds.push(r.item.object_id);
    }

    expect(scriptsIds).toEqual(['run_r-live']);
    expect(commandsIds).toContain('cmd_scripts_dyn_updates');
  });

  it('a script run row still categorizes to Scripts', () => {
    const run = makeRun({
      id: 'r-live-2',
      kind: 'shell-script',
      title: 'Updates 2',
      status: 'running',
    });

    const { mappedItems } = buildMappedItems({
      searchItems: [],
      activeContext: null,
      shortcutStore: [],
      localSearchValue: '',
      selectedIndex: 0,
      onError: vi.fn(),
      activeRuns: [run],
    });

    const item = mappedItems.find((m) => m.object_id === 'run_r-live-2');
    expect(item).toBeDefined();
    expect(categorizeItem(item!)).toBe('scripts');
  });
});
