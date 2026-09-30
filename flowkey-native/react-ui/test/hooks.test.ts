import { describe, expect, test } from 'bun:test';
import { createElement, useEffect } from 'react';
import {
  createCapabilities,
  type ExtensionEnvironment,
  type ListTree,
  type NativeCaller,
} from '@flowkey-cli/native-sdk';
import {
  Action,
  ActionPanel,
  List,
  ReactRoot,
  useCachedPromise,
  useCachedState,
  useDebounce,
  useFetch,
  usePromise,
} from '../src';
import type { CommandProps, CommittedGeneration } from '../src';

const environment: ExtensionEnvironment = {
  extensionId: 'hooks-test',
  extensionName: 'Hooks Test',
  extensionVersion: '1.0.0',
  isDevelopment: true,
};

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

function baseProps(overrides: Partial<CommandProps> = {}): CommandProps {
  const native = {
    call: (<T>() => Promise.resolve(undefined as T)) as unknown as CommandProps['native']['call'],
    showHud: () => Promise.resolve(),
  };
  return {
    query: '',
    preferences: {},
    native,
    capabilities: createCapabilities(native.call),
    signal: new AbortController().signal,
    window: {
      closeMainWindow: () => {},
      popToRoot: () => {},
      clearSearchBar: () => {},
      launchCommand: () => {},
    },
    environment,
    ...overrides,
  };
}

function basePropsWithCaller(
  call: NativeCaller,
  overrides: Partial<CommandProps> = {},
): CommandProps {
  return baseProps({
    native: { call, showHud: () => Promise.resolve() },
    capabilities: createCapabilities(call),
    ...overrides,
  });
}

function renderHarness(component: (props: CommandProps) => ReturnType<typeof createElement>): {
  root: ReactRoot;
  generations: CommittedGeneration[];
  errors: unknown[];
} {
  const generations: CommittedGeneration[] = [];
  const errors: unknown[] = [];
  const root = new ReactRoot(component as never, {
    onCommit: (tree, json, registry) => generations.push({ tree, json, registry }),
    onError: (error) => errors.push(error),
  });
  return { root, generations, errors };
}

function firstTitle(generation: CommittedGeneration | null): string {
  if (!generation) return 'no-commit';
  const tree = generation.tree as ListTree;
  return tree.sections[0].items[0].title;
}

function item(title: string): ReturnType<typeof createElement> {
  return createElement(
    List,
    { key: 'l' },
    createElement(List.Item, {
      key: 'i',
      id: 'x',
      title,
      actions: createElement(
        ActionPanel,
        { key: 'a' },
        createElement(Action, { key: 'act', title: 'noop', onAction: () => {} }),
      ),
    }),
  );
}

describe('usePromise', () => {
  test('starts loading and resolves into data', async () => {
    const { root, generations } = renderHarness((props) => {
      const state = usePromise(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return 'payload';
      }, []);
      return item(state.isLoading ? 'loading' : String(state.data));
    });

    root.update(baseProps());
    expect(firstTitle(root.current)).toBe('loading');

    await tick();
    root.flushEffects();
    await tick();

    expect(firstTitle(root.current)).toBe('payload');
    expect(generations.length).toBeGreaterThanOrEqual(2);
    root.unmount();
  });

  test('captures errors without throwing', async () => {
    const { root, errors } = renderHarness((props) => {
      const state = usePromise(async () => {
        throw new Error('kaboom');
      }, []);
      return item(state.error ? `err:${(state.error as Error).message}` : 'pending');
    });

    root.update(baseProps());
    await tick();
    root.flushEffects();
    await tick();

    expect(firstTitle(root.current)).toBe('err:kaboom');
    expect(errors).toEqual([]);
    root.unmount();
  });
});

describe('useFetch', () => {
  test('requests through the http capability and parses JSON', async () => {
    const call = (async (method: string, params?: Record<string, unknown>) => {
      if (method !== 'http.fetch') throw new Error(`unexpected route ${method}`);
      expect(params?.url).toBe('https://api.example.com/me');
      // the shell returns the body under `bodyText` (the SDK maps it to `body`)
      return { status: 200, headers: {}, bodyText: JSON.stringify({ name: 'flowkey' }) };
    }) as unknown as NativeCaller;
    const { root } = renderHarness((props) => {
      const state = useFetch<{ name: string }>('https://api.example.com/me');
      return item(state.isLoading ? 'loading' : String(state.data?.name));
    });

    root.update(basePropsWithCaller(call));
    await tick();
    root.flushEffects();
    await tick();

    expect(firstTitle(root.current)).toBe('flowkey');
    root.unmount();
  });
});

describe('useDebounce', () => {
  test('holds the previous value until the delay elapses', async () => {
    const { root } = renderHarness((props) => {
      const debounced = useDebounce(props.query, 10);
      return item(debounced === props.query ? `settled:${debounced}` : `stale:${debounced}`);
    });

    root.update(baseProps({ query: 'first' }));
    expect(firstTitle(root.current)).toBe('settled:first');

    root.update(baseProps({ query: 'second' }));
    expect(firstTitle(root.current)).toBe('stale:first');

    await tick(50);
    expect(firstTitle(root.current)).toBe('settled:second');
    root.unmount();
  });
});

describe('useCachedState', () => {
  test('writes updates through the storage capability', async () => {
    const calls: { method: string; params?: Record<string, unknown> }[] = [];
    const call = (async (method: string, params?: Record<string, unknown>) => {
      calls.push({ method, params });
      if (method === 'storage.get') return { ok: false };
      if (method === 'storage.set') return {};
      throw new Error(`unexpected route ${method}`);
    }) as unknown as NativeCaller;
    const { root } = renderHarness((props) => {
      const [value, setValue] = useCachedState('greeting', 'hello');
      useEffect(() => {
        setValue('changed');
      }, [setValue]);
      return item(value);
    });

    root.update(basePropsWithCaller(call));
    await tick();
    root.flushEffects();
    await tick();
    root.flushEffects();
    await tick();

    expect(firstTitle(root.current)).toBe('changed');
    const setCall = calls.find((c) => c.method === 'storage.set');
    expect(setCall?.params).toEqual({ key: 'greeting', value: 'changed' });
    root.unmount();
  });

  test('hydrates the initial value from storage when present', async () => {
    const call = (async (method: string) => {
      if (method === 'storage.get') return { ok: true, value: 'stored' };
      throw new Error(`unexpected route ${method}`);
    }) as unknown as NativeCaller;
    const { root } = renderHarness((props) => {
      const [value] = useCachedState('greeting', 'hello');
      return item(value);
    });

    root.update(basePropsWithCaller(call));
    await tick();
    root.flushEffects();
    await tick();

    expect(firstTitle(root.current)).toBe('stored');
    root.unmount();
  });
});

describe('useCachedPromise', () => {
  test('hydrates from the cache while loading and writes results back', async () => {
    const calls: { method: string; params?: Record<string, unknown> }[] = [];
    const call = (async (method: string, params?: Record<string, unknown>) => {
      calls.push({ method, params });
      if (method === 'cache.get') return { ok: false };
      if (method === 'cache.set') return {};
      throw new Error(`unexpected route ${method}`);
    }) as unknown as NativeCaller;
    const { root } = renderHarness((props) => {
      const state = useCachedPromise<string>(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return 'computed';
      }, []);
      return item(state.isLoading ? 'loading' : String(state.data));
    });

    root.update(basePropsWithCaller(call));
    await tick();
    root.flushEffects();
    await tick();
    root.flushEffects();
    await tick();

    expect(firstTitle(root.current)).toBe('computed');
    const setCall = calls.find((c) => c.method === 'cache.set');
    expect(setCall?.params?.value).toBe('computed');
    root.unmount();
  });

  test('serves a cache hit while the run is pending, then fresh data wins', async () => {
    const call = (async (method: string) => {
      if (method === 'cache.get') return { ok: true, value: 'cached' };
      if (method === 'cache.set') return {};
      throw new Error(`unexpected route ${method}`);
    }) as unknown as NativeCaller;
    let resolveFn: ((value: string) => void) | null = null;
    const { root } = renderHarness((props) => {
      const state = useCachedPromise<string>(async () => {
        await new Promise<string>((resolve) => {
          resolveFn = resolve;
        });
        return 'computed';
      }, []);
      return item(String(state.data));
    });

    root.update(basePropsWithCaller(call));
    await tick();
    root.flushEffects();
    await tick();

    expect(firstTitle(root.current)).toBe('cached');

    resolveFn!('computed');
    await tick();
    root.flushEffects();
    await tick();

    expect(firstTitle(root.current)).toBe('computed');
    root.unmount();
  });
});
