import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NAMESPACES } from 'asyar-sdk/contracts';

const mockStartProgressForExtension = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

// Mock all service dependencies BEFORE importing the module under test
vi.mock('../log/logService', () => ({
  logService: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), custom: vi.fn() },
}));
vi.mock('../settings/settingsService', () => ({
  settingsService: {
    getSettings: vi.fn().mockReturnValue({ search: {} }),
    updateSettings: vi.fn(),
    isExtensionEnabled: vi.fn().mockReturnValue(true),
  },
}));
vi.mock('../notification/notificationService', () => ({
  notificationService: {},
}));
vi.mock('../clipboard/clipboardHistoryService', () => ({
  clipboardHistoryService: {},
}));
vi.mock('./commandService', () => ({
  commandService: { commands: new Map(), registerCommand: vi.fn(), executeCommand: vi.fn() },
}));
vi.mock('../action/actionService', () => ({
  actionService: {},
}));
vi.mock('../statusBar/statusBarService', () => ({
  statusBarService: {},
}));
vi.mock('../search/searchBarAccessoryService', () => ({
  searchBarAccessoryService: {
    set: vi.fn(),
    clearForExtension: vi.fn(),
  },
}));
vi.mock('../auth/gateService', () => ({
  gate: { allows: vi.fn(), gate: vi.fn() },
}));
vi.mock('../auth/authService', () => ({
  authService: { isLoggedIn: true, entitlements: [] },
}));
vi.mock('../storage/extensionStorageService', () => ({
  extensionStorageService: {},
}));
vi.mock('./extensionPreferencesService', () => ({
  extensionPreferencesService: {
    getEffectivePreferences: vi.fn(),
    set: vi.fn(),
    reset: vi.fn(),
  },
}));
vi.mock('../storage/extensionCacheService', () => ({
  extensionCacheService: {},
}));
vi.mock('../feedback/feedbackService', () => ({
  feedbackService: {
    startProgressForExtension: mockStartProgressForExtension,
  },
}));
vi.mock('../selection/selectionService', () => ({
  selectionService: {},
}));
vi.mock('../oauth/extensionOAuthService', () => ({
  extensionOAuthService: {},
}));
vi.mock('../shell/shellService', () => ({
  shellService: {},
}));
vi.mock('../fileManager/fileManagerService', () => ({
  fileManagerService: {},
}));
vi.mock('../interop/interopService', () => ({
  InteropService: vi.fn().mockImplementation(function () {}),
}));
vi.mock('../application/applicationService', () => ({
  applicationService: {},
}));
vi.mock('../windowManagement/windowManagementService', () => ({
  windowManagementService: {},
}));
vi.mock('../opener/openerService', () => ({
  openerService: {},
}));
vi.mock('../network/networkService', () => ({
  networkService: {},
}));
vi.mock('../systemEvents/systemEventsService', () => ({
  systemEventsService: { subscribe: vi.fn(), unsubscribe: vi.fn() },
}));
vi.mock('../appEvents/appEventsService', () => ({
  appEventsService: { subscribe: vi.fn(), unsubscribe: vi.fn() },
}));
vi.mock('../power/powerService', () => ({
  powerService: { keepAwake: vi.fn(), release: vi.fn(), list: vi.fn() },
}));
vi.mock('../run/runService', () => ({
  runService: {},
}));

import { buildServiceRegistry } from './buildServiceRegistry';

function makeRegistry() {
  return buildServiceRegistry({
    extensionManager: {} as any,
    getManifestById: vi.fn(),
    handleCommandAction: vi.fn(),
  });
}

describe('buildServiceRegistry', () => {
  it('returns a registry with every bound namespace and no removed ai service', () => {
    const mockExtensionManager = {} as any;
    const mockGetManifestById = vi.fn();
    const mockHandleCommandAction = vi.fn();

    const registry = buildServiceRegistry({
      extensionManager: mockExtensionManager,
      getManifestById: mockGetManifestById,
      handleCommandAction: mockHandleCommandAction,
    });

    const registryKeys = Object.keys(registry);
    // Namespaces deliberately not wired into the JS-side registry.
    //
    // 'snippets' — Shortcode contributions flow Tauri-direct via the
    //              snippets:registerShortcodes / unregisterShortcodes IPC
    //              topics handled by the launcher's extension IPC router,
    //              not through the JS service registry.
    const UNBOUND_NAMESPACES = new Set(['snippets']);
    expect(registryKeys, `'ai' must NOT be in registry`).not.toContain('ai');
    expect(registryKeys, `'snippets' must NOT be in registry`).not.toContain('snippets');
    for (const ns of NAMESPACES) {
      if (UNBOUND_NAMESPACES.has(ns)) continue;
      expect(registryKeys, `Missing namespace: ${ns}`).toContain(ns);
    }
    expect(registryKeys.length).toBe(NAMESPACES.length - UNBOUND_NAMESPACES.size);
  });

  it('uses the provided extensionManager as the "extensions" entry', () => {
    const mockExtensionManager = { id: 'mock-em' } as any;

    const registry = buildServiceRegistry({
      extensionManager: mockExtensionManager,
      getManifestById: vi.fn(),
      handleCommandAction: vi.fn(),
    });

    expect(registry.extensions).toBe(mockExtensionManager);
  });
});

describe('buildServiceRegistry search entry', () => {
  it('search.rank delegates to the rank_items Tauri command with a named-key payload', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockResolvedValueOnce(['b']);

    const registry = makeRegistry() as any;
    const items = [
      { id: 'a', title: 'Apple' },
      { id: 'b', title: 'Banana' },
    ];
    const result = await registry.search.rank('ban', items);

    expect(invoke).toHaveBeenCalledWith('rank_items', { query: 'ban', items });
    expect(result).toEqual(['b']);
  });
});

describe('buildServiceRegistry feedback entry', () => {
  it('returns only the clone-safe progress ID to Tier 2 callers', async () => {
    mockStartProgressForExtension.mockResolvedValueOnce('feedback-1');
    const registry = makeRegistry() as any;

    const result = await registry.feedback.showProgress('ext.test', {
      title: 'Downloading',
    });

    expect(result).toBe('feedback-1');
    expect(structuredClone(result)).toBe('feedback-1');
    expect(mockStartProgressForExtension).toHaveBeenCalledWith('ext.test', {
      title: 'Downloading',
    });
  });
});

// ── CI guard: keep INJECTS_EXTENSION_ID / ALWAYS_INJECTS_CALLER_ID in sync ──
//
// The dispatcher in ExtensionIpcRouter prepends `extensionId` (or caller id)
// to a handler's args ONLY when the namespace is in the matching set.
// Forgetting to add a new namespace produces the silent bug the router's
// own docblock warns about. This test walks every handler in the registry
// and asserts: if first parameter is named `extensionId`, the namespace
// must be in INJECTS_EXTENSION_ID (analogous for `caller`).

import { INJECTS_EXTENSION_ID, ALWAYS_INJECTS_CALLER_ID } from './ExtensionIpcRouter';

function* enumerateMethods(svc: unknown): Generator<[string, Function]> {
  if (svc === null || typeof svc !== 'object') return;
  const seen = new Set<string>();
  for (const [k, v] of Object.entries(svc)) {
    if (typeof v === 'function' && !seen.has(k)) {
      seen.add(k);
      yield [k, v];
    }
  }
  let proto = Object.getPrototypeOf(svc);
  while (proto && proto !== Object.prototype) {
    for (const k of Object.getOwnPropertyNames(proto)) {
      if (k === 'constructor' || seen.has(k)) continue;
      const v = (svc as Record<string, unknown>)[k];
      if (typeof v === 'function') {
        seen.add(k);
        yield [k, v as Function];
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
}

function firstParamName(fn: Function): string | null {
  const src = fn.toString();
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const m =
    noComments.match(/^(?:async\s+)?(?:function\s*)?(?:\w+\s*)?\(\s*([$\w]+)/) ||
    noComments.match(/^\s*([$\w]+)\s*=>/);
  return m ? m[1] : null;
}

describe('Extension IPC router injection contract vs buildServiceRegistry', () => {
  it('every method whose first param is extensionId belongs to an INJECTS_EXTENSION_ID namespace', () => {
    const registry = makeRegistry() as Record<string, unknown>;
    const violations: string[] = [];

    for (const [namespace, svc] of Object.entries(registry)) {
      if (!svc || typeof svc !== 'object') continue;
      for (const [methodName, fn] of enumerateMethods(svc)) {
        const p1 = firstParamName(fn);
        if (p1 === 'extensionId' && !INJECTS_EXTENSION_ID.has(namespace)) {
          violations.push(
            `${namespace}.${methodName} expects (extensionId, ...) but '${namespace}' is not in INJECTS_EXTENSION_ID`,
          );
        }
      }
    }

    expect(
      violations,
      `Add the missing namespace(s) to INJECTS_EXTENSION_ID in ExtensionIpcRouter.ts:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('every method whose first param is caller belongs to an ALWAYS_INJECTS_CALLER_ID namespace', () => {
    const registry = makeRegistry() as Record<string, unknown>;
    const violations: string[] = [];

    for (const [namespace, svc] of Object.entries(registry)) {
      if (!svc || typeof svc !== 'object') continue;
      for (const [methodName, fn] of enumerateMethods(svc)) {
        const p1 = firstParamName(fn);
        if (p1 === 'caller' && !ALWAYS_INJECTS_CALLER_ID.has(namespace)) {
          violations.push(
            `${namespace}.${methodName} expects (caller, ...) but '${namespace}' is not in ALWAYS_INJECTS_CALLER_ID`,
          );
        }
      }
    }

    expect(
      violations,
      `Add the missing namespace(s) to ALWAYS_INJECTS_CALLER_ID in ExtensionIpcRouter.ts:\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});
