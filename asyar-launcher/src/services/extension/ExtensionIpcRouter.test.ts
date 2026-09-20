/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messageBroker } from 'asyar-sdk/contracts';

vi.mock('../log/logService', () => ({
  logService: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('./extensionIframeManager', () => ({
  extensionIframeManager: { handleSearchResponse: vi.fn() },
}));
vi.mock('./extensionPreferencesService', () => ({
  extensionPreferencesService: { getEffectivePreferences: vi.fn() },
}));
vi.mock('./streamDispatcher', () => ({ streamDispatcher: { abort: vi.fn() } }));
vi.mock('../../lib/ipc/commands', () => ({
  checkExtensionPermission: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../feedback/feedbackService', () => ({
  feedbackService: { report: vi.fn() },
}));
vi.mock('../settings/developerSettingsService', () => ({
  developerSettingsService: { isDeveloperMode: false, tracing: false },
}));

import { invoke } from '@tauri-apps/api/core';
import * as commands from '../../lib/ipc/commands';
import { ExtensionIpcRouter } from './ExtensionIpcRouter';
import type { ServiceRegistry } from './defineServiceRegistry';
import { logService } from '../log/logService';
import { extensionPreferencesService } from './extensionPreferencesService';
import { streamDispatcher } from './streamDispatcher';

describe('ExtensionIpcRouter — host dispatcher integration', () => {
  beforeEach(() => {
    messageBroker.setHostDispatcher(null);
  });

  it('installs a host dispatcher on the SDK broker that routes through the registry', async () => {
    const navigateToView = vi.fn();
    const registry = { extensions: { navigateToView } } as unknown as ServiceRegistry;
    const router = new ExtensionIpcRouter(registry, vi.fn(), vi.fn(), vi.fn());
    router.setup();

    await messageBroker.invoke('extensions:navigateToView', { viewPath: 'store/DefaultView' });

    expect(navigateToView).toHaveBeenCalledWith('store/DefaultView');
  });

  it('propagates service method errors back to invoke() callers', async () => {
    const registry = {
      extensions: {
        navigateToView: () => {
          throw new Error('nav-boom');
        },
      },
    } as unknown as ServiceRegistry;
    const router = new ExtensionIpcRouter(registry, vi.fn(), vi.fn(), vi.fn());
    router.setup();

    await expect(
      messageBroker.invoke('extensions:navigateToView', { viewPath: 'x/V' }),
    ).rejects.toThrow('nav-boom');
  });

  it('runs the service method synchronously — side effects land before invoke() resolves', async () => {
    let pushed = false;
    const registry = {
      extensions: {
        navigateToView: () => {
          pushed = true;
        },
      },
    } as unknown as ServiceRegistry;
    const router = new ExtensionIpcRouter(registry, vi.fn(), vi.fn(), vi.fn());
    router.setup();

    const promise = messageBroker.invoke('extensions:navigateToView', { viewPath: 'x/V' });

    expect(pushed).toBe(true);
    await promise;
  });
});

describe('ExtensionIpcRouter — auto-inject extensionId for fsWatcher', () => {
  type DispatchApiCall = (
    type: string,
    payload: unknown,
    extensionId: string | undefined,
    isPrivilegedHostContext: boolean,
  ) => Promise<unknown>;

  function dispatchAs(router: ExtensionIpcRouter): DispatchApiCall {
    return (
      router as unknown as {
        dispatchApiCall: DispatchApiCall;
      }
    ).dispatchApiCall.bind(router);
  }

  it('fsWatcher:create from an iframe receives extensionId, paths, opts in that order', async () => {
    const create = vi.fn(async () => 'handle-1');
    const registry = {
      fsWatcher: { create, dispose: vi.fn() },
    } as unknown as ServiceRegistry;
    const router = new ExtensionIpcRouter(registry, vi.fn(), vi.fn(), vi.fn());

    await dispatchAs(router)(
      'asyar:api:fsWatcher:create',
      { paths: ['/tmp/asyar-fs-watch'], opts: { recursive: true } },
      'ext.demo',
      false,
    );

    expect(create).toHaveBeenCalledWith('ext.demo', ['/tmp/asyar-fs-watch'], { recursive: true });
  });

  it('fsWatcher:dispose from an iframe receives extensionId, handleId in that order', async () => {
    const create = vi.fn(async () => 'h-1');
    const dispose = vi.fn(async () => undefined);
    const registry = {
      fsWatcher: { create, dispose },
    } as unknown as ServiceRegistry;
    const router = new ExtensionIpcRouter(registry, vi.fn(), vi.fn(), vi.fn());

    await dispatchAs(router)(
      'asyar:api:fsWatcher:dispose',
      { handleId: 'h-abc' },
      'ext.demo',
      false,
    );

    expect(dispose).toHaveBeenCalledWith('ext.demo', 'h-abc');
  });
});

describe('ExtensionIpcRouter — auto-inject extensionId for applicationIndex', () => {
  type DispatchApiCall = (
    type: string,
    payload: unknown,
    extensionId: string | undefined,
    isPrivilegedHostContext: boolean,
  ) => Promise<unknown>;

  function dispatchAs(router: ExtensionIpcRouter): DispatchApiCall {
    return (router as unknown as { dispatchApiCall: DispatchApiCall }).dispatchApiCall.bind(router);
  }

  it('applicationIndex:subscribe from an iframe receives extensionId, eventTypes in that order', async () => {
    const subscribe = vi.fn(async () => 'sub-1');
    const registry = {
      applicationIndex: { subscribe, unsubscribe: vi.fn() },
    } as unknown as ServiceRegistry;
    const router = new ExtensionIpcRouter(registry, vi.fn(), vi.fn(), vi.fn());

    await dispatchAs(router)(
      'asyar:api:applicationIndex:subscribe',
      { eventTypes: ['installed', 'removed'] },
      'ext.demo',
      false,
    );

    expect(subscribe).toHaveBeenCalledWith('ext.demo', ['installed', 'removed']);
  });

  it('applicationIndex:subscribe from privileged host context receives null as the first arg', async () => {
    const subscribe = vi.fn(async () => 'sub-2');
    const registry = {
      applicationIndex: { subscribe, unsubscribe: vi.fn() },
    } as unknown as ServiceRegistry;
    const router = new ExtensionIpcRouter(registry, vi.fn(), vi.fn(), vi.fn());

    await dispatchAs(router)(
      'asyar:api:applicationIndex:subscribe',
      { eventTypes: ['installed'] },
      undefined,
      true,
    );

    expect(subscribe).toHaveBeenCalledWith(null, ['installed']);
  });
});

describe('ExtensionIpcRouter — originRole injection for shell streams', () => {
  type DispatchApiCall = (
    type: string,
    payload: unknown,
    extensionId: string | undefined,
    isPrivilegedHostContext: boolean,
    originRole?: 'view' | 'worker',
  ) => Promise<unknown>;

  function dispatchAs(router: ExtensionIpcRouter): DispatchApiCall {
    return (router as unknown as { dispatchApiCall: DispatchApiCall }).dispatchApiCall.bind(router);
  }

  it('shell:spawn from a worker iframe receives originRole as the trailing argument', async () => {
    const spawn = vi.fn(async () => ({ streaming: true }));
    const registry = {
      shell: { spawn, attach: vi.fn(), list: vi.fn() },
    } as unknown as ServiceRegistry;
    const router = new ExtensionIpcRouter(registry, vi.fn(), vi.fn(), vi.fn());

    await dispatchAs(router)(
      'asyar:api:shell:spawn',
      { program: 'ls', args: ['-la'], spawnId: 'sp-1' },
      'ext.demo',
      false,
      'worker',
    );

    expect(spawn).toHaveBeenCalledWith('ext.demo', 'ls', ['-la'], 'sp-1', 'worker');
  });

  it('shell:attach from a view iframe receives originRole=view as the trailing argument', async () => {
    const attach = vi.fn(async () => ({ spawnId: 'sp-2' }));
    const registry = {
      shell: { spawn: vi.fn(), attach, list: vi.fn() },
    } as unknown as ServiceRegistry;
    const router = new ExtensionIpcRouter(registry, vi.fn(), vi.fn(), vi.fn());

    await dispatchAs(router)(
      'asyar:api:shell:attach',
      { spawnId: 'sp-2' },
      'ext.demo',
      false,
      'view',
    );

    expect(attach).toHaveBeenCalledWith('ext.demo', 'sp-2', 'view');
  });

  it('shell:spawn without originRole appends nothing', async () => {
    const spawn = vi.fn(async () => ({ streaming: true }));
    const registry = {
      shell: { spawn, attach: vi.fn(), list: vi.fn() },
    } as unknown as ServiceRegistry;
    const router = new ExtensionIpcRouter(registry, vi.fn(), vi.fn(), vi.fn());

    await dispatchAs(router)(
      'asyar:api:shell:spawn',
      { program: 'ls', args: [], spawnId: 'sp-3' },
      'ext.demo',
      false,
    );

    expect(spawn).toHaveBeenCalledWith('ext.demo', 'ls', [], 'sp-3');
  });

  it('non-streaming shell methods do not receive originRole', async () => {
    const list = vi.fn(async () => []);
    const registry = {
      shell: { spawn: vi.fn(), attach: vi.fn(), list },
    } as unknown as ServiceRegistry;
    const router = new ExtensionIpcRouter(registry, vi.fn(), vi.fn(), vi.fn());

    await dispatchAs(router)('asyar:api:shell:list', {}, 'ext.demo', false, 'worker');

    expect(list).toHaveBeenCalledWith('ext.demo');
    expect(list.mock.calls[0]).toHaveLength(1);
  });

  it('non-shell namespaces never receive originRole even when one is provided', async () => {
    const navigateToView = vi.fn();
    const registry = {
      extensions: { navigateToView },
    } as unknown as ServiceRegistry;
    const router = new ExtensionIpcRouter(registry, vi.fn(), vi.fn(), vi.fn());

    await dispatchAs(router)(
      'asyar:api:extensions:navigateToView',
      { viewPath: 'store/Default' },
      'ext.demo',
      false,
      'worker',
    );

    expect(navigateToView).toHaveBeenCalledWith('store/Default');
    expect(navigateToView.mock.calls[0]).toHaveLength(1);
  });
});

describe('ExtensionIpcRouter — originRole injection for WebSocket pushes', () => {
  type DispatchApiCall = (
    type: string,
    payload: Record<string, unknown>,
    extensionId: string | undefined,
    isPrivilegedHostContext: boolean,
    originRole?: 'view' | 'worker',
  ) => Promise<unknown>;

  function dispatchAs(router: ExtensionIpcRouter): DispatchApiCall {
    return (router as unknown as { dispatchApiCall: DispatchApiCall }).dispatchApiCall.bind(router);
  }

  it('passes the trusted caller role to network.wsConnect', async () => {
    const wsConnect = vi.fn();
    const registry = { network: { wsConnect } } as unknown as ServiceRegistry;
    const router = new ExtensionIpcRouter(registry, vi.fn(), vi.fn(), vi.fn());

    await dispatchAs(router)(
      'asyar:api:network:wsConnect',
      { socketId: 'socket-1', url: 'wss://example.com', headers: undefined },
      'ext.demo',
      false,
      'worker',
    );

    expect(wsConnect).toHaveBeenCalledWith(
      'ext.demo',
      'socket-1',
      'wss://example.com',
      undefined,
      'worker',
    );
  });
});
