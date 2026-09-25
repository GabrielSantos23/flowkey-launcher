import { describe, expect, test } from 'bun:test';
import { createElement, useState, useEffect, type ComponentType } from 'react';
import type { SidecarMessage, UiMessage, UiTree, ListTree } from '@flowkey/native-sdk';
import type { CommandProps } from '@flowkey/react-ui';
import { Action } from '@flowkey/react-ui';
import { RootManager, ManagedRoot, PUSH_INTERVAL_MS, MAX_ROOTS } from '../src/roots';
import { Dispatcher } from '../src/loader';

const manifest = {
  id: 'test-ext',
  name: 'Test Ext',
  version: '1.0.0',
  commands: [{ id: 'open', title: 'Open', mode: 'view' as const }],
  nativeMethods: [],
  httpHosts: [],
};

function itemTree(label: string): UiTree {
  return {
    type: 'list',
    sections: [
      {
        items: [{ id: 'x', title: label, actions: [{ id: 'copy', title: 'Copy', primary: true }] }],
      },
    ],
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('RootManager eviction', () => {
  test('never evicts the active root, evicts oldest inactive instead', () => {
    const manager = new RootManager(() => {}, (async () => undefined) as never);
    const module = { manifest, component: () => null };
    for (let i = 0; i < MAX_ROOTS; i++) {
      manager.ensure('ext', `cmd${i}`, module);
    }
    expect(manager.size).toBe(MAX_ROOTS);
    const active = manager.ensure('ext', 'cmd0', module);
    manager.ensure('ext', 'cmd4', module);
    expect(manager.size).toBe(MAX_ROOTS);
    expect(manager.get('ext', 'cmd0')).toBe(active);
    expect(manager.get('ext', 'cmd1')).toBeUndefined();
    expect(manager.get('ext', 'cmd4')).toBeDefined();
    manager.destroyAll();
    expect(manager.size).toBe(0);
  });
});

describe('ManagedRoot push throttle', () => {
  function makeRoot(component: ComponentType<CommandProps>) {
    const messages: SidecarMessage[] = [];
    const manager = new RootManager(
      (message) => messages.push(message),
      (async () => undefined) as never,
    );
    const root = manager.ensure('test-ext', 'open', { manifest, component });
    return { manager, root, messages };
  }

  test('first async commit pushes immediately, later commits within the interval merge into one trailing push', async () => {
    let bump: ((delta: number) => void) | null = null;
    const component = () => {
      const [n, setN] = useState(0);
      bump = (delta: number) => setN((prev) => prev + delta);
      return createElement('list', null, createElement('list-item', { id: 'x', title: `t${n}` }));
    };
    const { root, messages } = makeRoot(component);
    root.updateProps({ query: 'q', preferences: {} });
    const pushes = () => messages.filter((m) => m.type === 'uiPush');
    expect(pushes().length).toBe(0);
    bump!(1);
    await sleep(30);
    expect(pushes().length).toBe(1);
    bump!(1);
    bump!(1);
    await sleep(30);
    expect(pushes().length).toBe(1);
    await sleep(PUSH_INTERVAL_MS);
    expect(pushes().length).toBe(2);
    const last = pushes()[1];
    if (last.type === 'uiPush') {
      const tree = last.tree as ListTree;
      expect(tree.sections[0].items[0].title).toBe('t3');
      expect(last.query).toBe('q');
    }
    root.destroy();
  });

  test('skips pushes whose serialized tree is byte-identical to the last one sent', async () => {
    let changeHiddenState: (() => void) | null = null;
    const component = () => {
      const [n] = useState(0);
      const [, setM] = useState(0);
      changeHiddenState = () => setM((prev) => prev + 1);
      return createElement('list', null, createElement('list-item', { id: 'x', title: `t${n}` }));
    };
    const { root, messages } = makeRoot(component);
    root.updateProps({ query: 'q', preferences: {} });
    const pushes = () => messages.filter((m) => m.type === 'uiPush');
    expect(pushes().length).toBe(0);
    for (let i = 0; i < 3; i++) {
      changeHiddenState!();
      await sleep(20);
    }
    await sleep(PUSH_INTERVAL_MS);
    expect(pushes().length).toBe(0);
    root.destroy();
  });
});

describe('ManagedRoot abort and drop-after-destroy', () => {
  test('in-flight native call rejects as aborted on destroy and emits no further nativeCall', async () => {
    const nativeCalls: string[] = [];
    let capturedSignal: AbortSignal | null = null;
    const component = (props: CommandProps) => {
      const [result, setResult] = useState('pending');
      useEffect(() => {
        props.native
          .call('clipboard.write', {}, { signal: props.signal })
          .then((value) => setResult(`ok:${String(value)}`))
          .catch((error) => setResult(`err:${String(error.code)}`));
      }, []);
      capturedSignal = props.signal;
      return createElement('list', null, createElement('list-item', { id: 'x', title: result }));
    };
    const messages: SidecarMessage[] = [];
    const nativeCall = async (
      _extensionId: string,
      method: string,
      _params: unknown,
      options?: { signal?: AbortSignal },
    ) => {
      nativeCalls.push(method);
      await new Promise((_resolve, reject) => {
        const signal = options?.signal;
        if (signal?.aborted) {
          reject({ code: 'aborted' });
          return;
        }
        signal?.addEventListener('abort', () => reject({ code: 'aborted' }), { once: true });
      });
    };
    const manager = new RootManager((message) => messages.push(message), nativeCall as never);
    const root = manager.ensure('test-ext', 'open', { manifest, component });
    root.updateProps({ query: '', preferences: {} });
    await sleep(30);
    expect(nativeCalls).toEqual(['clipboard.write']);
    root.destroy();
    await sleep(30);
    expect(root.destroyed).toBe(true);
    expect(nativeCalls).toEqual(['clipboard.write']);
    expect(capturedSignal!.aborted).toBe(true);
    expect(messages.filter((m) => m.type === 'uiPush')).toHaveLength(0);
  });

  test('native.call after destroy rejects as aborted without emitting nativeCall', async () => {
    let lastNative: CommandProps['native'] | null = null;
    const component = (props: CommandProps) => {
      lastNative = props.native;
      return createElement('list', null, createElement('list-item', { id: 'x', title: 't' }));
    };
    const messages: SidecarMessage[] = [];
    const manager = new RootManager(
      (message) => messages.push(message),
      (async () => undefined) as never,
    );
    const root = manager.ensure('test-ext', 'open', { manifest, component });
    root.updateProps({ query: '', preferences: {} });
    root.destroy();
    let rejection: { code?: string } | null = null;
    try {
      await lastNative!.call('clipboard.write');
    } catch (error) {
      rejection = error as { code?: string };
    }
    expect(rejection?.code).toBe('aborted');
    expect(messages.filter((m) => m.type === 'nativeCall')).toHaveLength(0);
  });

  test('showHud dispatches a nativeCall for hud.show with the given options', async () => {
    let lastNative: CommandProps['native'] | null = null;
    const component = (props: CommandProps) => {
      useEffect(() => {
        void props.native.showHud({ title: 'Playing next track', duration: 5 });
      }, []);
      lastNative = props.native;
      return createElement('list', null, createElement('list-item', { id: 'x', title: 't' }));
    };
    const messages: SidecarMessage[] = [];
    const nativeCalls: Array<{ method: string; params: unknown }> = [];
    const manager = new RootManager((message) => messages.push(message), (async (
      _extensionId: string,
      method: string,
      params?: Record<string, unknown>,
    ) => {
      nativeCalls.push({ method, params });
      return undefined;
    }) as never);
    const root = manager.ensure('test-ext', 'open', { manifest, component });
    root.updateProps({ query: '', preferences: {} });
    await sleep(30);
    expect(nativeCalls).toEqual([
      { method: 'hud.show', params: { title: 'Playing next track', duration: 5 } },
    ]);
    root.destroy();
  });
});

function makeDispatcherHarness(component: ComponentType<CommandProps>) {
  const messages: SidecarMessage[] = [];
  const emit = (message: SidecarMessage) => messages.push(message);
  const dispatcher = new Dispatcher([{ manifest, component, preferences: {} }] as never, emit);
  const open = async () => {
    await dispatcher.handle(
      {
        type: 'action',
        requestId: 'a-open',
        extensionId: 'test-ext',
        actionId: '__open__',
        item: { id: 'open', title: 'Open' },
      } as never,
      emit,
    );
    const ui = messages.find((m) => m.type === 'ui') as UiMessage | undefined;
    const tree = ui?.tree as ListTree | undefined;
    return tree?.sections[0].items[0].actions?.[0].id;
  };
  const search = (query: string, requestId: string, commandId?: string) =>
    dispatcher.handle(
      { type: 'search', requestId, extensionId: 'test-ext', query, commandId } as never,
      emit,
    );
  const act = (actionId: string, requestId: string) =>
    dispatcher.handle(
      { type: 'action', requestId, extensionId: 'test-ext', actionId } as never,
      emit,
    );
  return { dispatcher, messages, open, search, act };
}

describe('Dispatcher react integration', () => {
  test('__open__ mounts a fresh root, searches reuse it, destroy creates a new one', async () => {
    let mounts = 0;
    const component = () => {
      useEffect(() => {
        mounts++;
      }, []);
      return createElement('list', null, createElement('list-item', { id: 'x', title: 't' }));
    };
    const { messages, open, search } = makeDispatcherHarness(component);
    await open();
    const mountsAfterOpen = mounts;
    expect(mountsAfterOpen).toBeGreaterThanOrEqual(1);
    await search('a', 's-1', 'open');
    await search('b', 's-2', 'open');
    expect(mounts).toBe(mountsAfterOpen);
    expect(messages.filter((m) => m.type === 'ui')).toHaveLength(3);
    await search('', 's-3');
    await search('c', 's-4', 'open');
    expect(mounts).toBeGreaterThan(mountsAfterOpen);
  });

  test('pushes emitted during an async action reach the wire before the action response', async () => {
    const component = () => {
      const [phase, setPhase] = useState('idle');
      return createElement(
        'list',
        null,
        createElement('list-item', {
          id: 'x',
          title: phase,
          actions: createElement(Action, {
            title: 'Run',
            primary: true,
            onAction: async () => {
              setPhase('working');
              await sleep(40);
              setPhase('done');
              await sleep(40);
            },
          }),
        }),
      );
    };
    const { messages, open, act } = makeDispatcherHarness(component);
    const token = await open();
    expect(token).toBeTruthy();
    const before = messages.length;
    await act(token!, 'a-1');
    const after = messages.slice(before);
    const kinds = after.map((m) => m.type);
    const pushIndex = kinds.indexOf('uiPush');
    const responseIndex = kinds.indexOf('ui');
    expect(pushIndex).toBeGreaterThanOrEqual(0);
    expect(responseIndex).toBeGreaterThan(pushIndex);
    const response = after.find((m) => m.type === 'ui') as UiMessage;
    const tree = response.tree as ListTree;
    expect(tree.sections[0].items[0].title).toBe('done');
  });

  test('no pushes are emitted after the root is destroyed by a root-level search', async () => {
    const component = () => {
      const [n, setN] = useState(0);
      useEffect(() => {
        const timer = setInterval(() => setN((prev) => prev + 1), 40);
        return () => clearInterval(timer);
      }, []);
      return createElement('list', null, createElement('list-item', { id: 'x', title: `t${n}` }));
    };
    const { messages, open, search } = makeDispatcherHarness(component);
    await open();
    await sleep(120);
    const pushesBeforeDestroy = messages.filter((m) => m.type === 'uiPush').length;
    expect(pushesBeforeDestroy).toBeGreaterThan(0);
    await search('', 's-root');
    const pushCountAtDestroy = messages.filter((m) => m.type === 'uiPush').length;
    await sleep(150);
    expect(messages.filter((m) => m.type === 'uiPush').length).toBe(pushCountAtDestroy);
  });

  test('unknown action token on an active root returns a structured unknownAction error', async () => {
    const component = () =>
      createElement(
        'list',
        null,
        createElement('list-item', {
          id: 'x',
          title: 't',
          actions: createElement(Action, { title: 'Copy', primary: true, onAction: () => {} }),
        }),
      );
    const { messages, open, act } = makeDispatcherHarness(component);
    await open();
    await act('nope', 'a-bad');
    const errors = messages.filter((m) => m.type === 'error');
    expect(errors).toHaveLength(1);
    expect((errors[0] as { error: { code: string } }).error.code).toBe('unknownAction');
  });

  test('functional modules keep the request/response path unchanged', async () => {
    const messages: SidecarMessage[] = [];
    const emit = (message: SidecarMessage) => messages.push(message);
    const dispatcher = new Dispatcher(
      [
        {
          manifest,
          preferences: {},
          handlers: {
            search: async (query: string) => itemTree(`q:${query}`),
            onAction: async () => null,
          },
        },
      ] as never,
      emit,
    );
    await dispatcher.handle(
      { type: 'search', requestId: 's-1', extensionId: 'test-ext', query: 'hello' } as never,
      emit,
    );
    expect(messages.find((m) => m.type === 'ui')).toBeDefined();
    await dispatcher.handle(
      {
        type: 'action',
        requestId: 'a-1',
        extensionId: 'test-ext',
        actionId: 'copy',
        item: { id: 'x', title: 't' },
      } as never,
      emit,
    );
    expect(messages.filter((m) => m.type === 'ui')).toHaveLength(2);
  });
});

describe('native.call options passthrough', () => {
  test('functional extensions reach the bridge with a custom timeoutMs', async () => {
    const messages: SidecarMessage[] = [];
    const emit = (message: SidecarMessage) => messages.push(message);
    const dispatcher = new Dispatcher(
      [
        {
          manifest,
          preferences: {},
          handlers: {
            search: async (
              _query: string,
              ctx: {
                native: {
                  call: (
                    method: string,
                    params?: Record<string, unknown>,
                    options?: { timeoutMs?: number },
                  ) => Promise<unknown>;
                };
              },
            ) => {
              await ctx.native.call('oauth.authorize', { provider: 'spotify' }, { timeoutMs: 60 });
              return itemTree('never');
            },
          },
        },
      ] as never,
      emit,
    );
    const started = Date.now();
    await dispatcher.handle(
      { type: 'search', requestId: 's-9', extensionId: 'test-ext', query: '' } as never,
      emit,
    );
    const elapsed = Date.now() - started;
    const error = messages.find((m) => m.type === 'error') as
      { error: { code: string } } | undefined;
    expect(error?.error.code).toBe('nativeTimeout');
    expect(elapsed).toBeLessThan(2000);
  });
});
