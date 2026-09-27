import { describe, expect, test } from 'bun:test';
import { createCapabilities, type NativeCaller } from '../src/capabilities';

type RecordedCall = {
  method: string;
  params?: Record<string, unknown>;
  options?: { signal?: AbortSignal; timeoutMs?: number };
};

function fakeCaller(handlers: Record<string, unknown>): {
  calls: RecordedCall[];
  call: NativeCaller;
} {
  const calls: RecordedCall[] = [];
  const call: NativeCaller = async (method, params, options) => {
    calls.push({ method, params, options });
    if (!(method in handlers)) {
      throw new Error(`unexpected native route: ${method}`);
    }
    const handler = handlers[method];
    return (typeof handler === 'function' ? handler(params) : handler) as never;
  };
  return { calls, call };
}

describe('createCapabilities wire shapes', () => {
  test('apps.list reads the shell result key (apps, not items)', async () => {
    const app = { id: 'spotify', name: 'Spotify', iconUri: 'file:///icons/spotify.png' };
    const { calls, call } = fakeCaller({ 'apps.list': { apps: [app] } });
    const capabilities = createCapabilities(call);

    const result = await capabilities.apps.list('spot');

    expect(result).toEqual([app]);
    expect(calls).toEqual([{ method: 'apps.list', params: { query: 'spot' } }]);
  });

  test('apps.list forwards an omitted query', async () => {
    const { calls, call } = fakeCaller({ 'apps.list': { apps: [] } });
    const capabilities = createCapabilities(call);

    await capabilities.apps.list();

    expect(calls[0].params).toEqual({ query: undefined });
  });

  test('media.current passes the shell snapshot through unchanged', async () => {
    const snapshot = {
      playing: true,
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      positionMs: 1000,
      durationMs: 200_000,
      updatedAtMs: 1_720_000_000_000,
    };
    const { calls, call } = fakeCaller({ 'media.current': snapshot });
    const capabilities = createCapabilities(call);

    const result = await capabilities.media.current();

    expect(result).toEqual(snapshot);
    expect(calls).toEqual([{ method: 'media.current', params: undefined }]);
  });

  test('media.control sends the command param the shell reads', async () => {
    const { calls, call } = fakeCaller({ 'media.control': {} });
    const capabilities = createCapabilities(call);

    await capabilities.media.control('playPause');

    expect(calls).toEqual([{ method: 'media.control', params: { command: 'playPause' } }]);
  });

  test('media.control accepts every transport command the shell implements', async () => {
    const { calls, call } = fakeCaller({ 'media.control': {} });
    const capabilities = createCapabilities(call);

    await capabilities.media.control('next');
    await capabilities.media.control('previous');

    expect(calls.map((c) => c.params?.command)).toEqual(['next', 'previous']);
  });

  test('media.control rejects unknown transport commands at compile time', () => {
    const { call } = fakeCaller({ 'media.control': {} });
    const capabilities = createCapabilities(call);

    // @ts-expect-error unknown transport commands are a type error
    void capabilities.media.control('rewind');
  });

  test('http.fetch passes an AbortSignal through call options, never params', async () => {
    const controller = new AbortController();
    const { calls, call } = fakeCaller({ 'http.fetch': { status: 200, headers: {} } });
    const capabilities = createCapabilities(call);

    await capabilities.http.fetch('https://api.example.com', {
      signal: controller.signal,
      method: 'GET',
    });

    expect(calls[0].params).toEqual({ url: 'https://api.example.com', method: 'GET' });
    expect(calls[0].options?.signal).toBe(controller.signal);
  });
});

describe('oauth capability group', () => {
  test('authorize sends the provider and optional clientId with long-poll options', async () => {
    const { calls, call } = fakeCaller({
      'oauth.authorize': { ok: true, expiresAt: '2026-09-27T10:00:00Z', scope: 'user-read' },
    });
    const capabilities = createCapabilities(call);
    const controller = new AbortController();

    const result = await capabilities.oauth.authorize('spotify', {
      clientId: 'abc123',
      signal: controller.signal,
      timeoutMs: 150_000,
    });

    expect(result).toEqual({ ok: true, expiresAt: '2026-09-27T10:00:00Z', scope: 'user-read' });
    expect(calls).toEqual([
      {
        method: 'oauth.authorize',
        params: { provider: 'spotify', clientId: 'abc123' },
        options: { signal: controller.signal, timeoutMs: 150_000 },
      },
    ]);
  });

  test('status and disconnect send the provider, status forwards abort options', async () => {
    const controller = new AbortController();
    const { calls, call } = fakeCaller({
      'oauth.status': { ok: false },
      'oauth.disconnect': { ok: true },
    });
    const capabilities = createCapabilities(call);

    await capabilities.oauth.status('spotify', { signal: controller.signal });
    await capabilities.oauth.disconnect('spotify');

    expect(calls.map((c) => c.method)).toEqual(['oauth.status', 'oauth.disconnect']);
    expect(calls[0].params).toEqual({ provider: 'spotify' });
    expect(calls[0].options?.signal).toBe(controller.signal);
    expect(calls[1].params).toEqual({ provider: 'spotify' });
  });
});

describe('clipboard history-management wrappers', () => {
  test('entry actions send the entry id on the routes the shell registers', async () => {
    const { calls, call } = fakeCaller({
      'clipboard.deleteEntry': {},
      'clipboard.copyEntry': {},
      'clipboard.pasteEntry': {},
      'clipboard.editEntry': {},
    });
    const capabilities = createCapabilities(call);

    await capabilities.clipboard.deleteEntry('h1');
    await capabilities.clipboard.copyEntry('h1');
    await capabilities.clipboard.pasteEntry('h1');
    await capabilities.clipboard.editEntry('h1');

    expect(calls.map((c) => [c.method, c.params])).toEqual([
      ['clipboard.deleteEntry', { id: 'h1' }],
      ['clipboard.copyEntry', { id: 'h1' }],
      ['clipboard.pasteEntry', { id: 'h1' }],
      ['clipboard.editEntry', { id: 'h1' }],
    ]);
  });

  test('clearHistory takes no params', async () => {
    const { calls, call } = fakeCaller({ 'clipboard.clearHistory': {} });
    const capabilities = createCapabilities(call);

    await capabilities.clipboard.clearHistory();

    expect(calls).toEqual([{ method: 'clipboard.clearHistory', params: {}, options: undefined }]);
  });
});

describe('storage.allItems', () => {
  test('composes keys and get calls into a record', async () => {
    const values: Record<string, unknown> = { a: 1, b: { nested: true } };
    const { calls, call } = fakeCaller({
      'storage.keys': { ok: true, keys: ['a', 'b'] },
      'storage.get': (params?: Record<string, unknown>) => ({
        ok: true,
        value: values[String(params?.key)],
      }),
    });
    const capabilities = createCapabilities(call);

    const result = await capabilities.storage.allItems();

    expect(result).toEqual({ a: 1, b: { nested: true } });
    expect(calls[0].method).toBe('storage.keys');
    expect(calls.slice(1).map((c) => c.params?.key)).toEqual(['a', 'b']);
  });
});

describe('cache capability group', () => {
  test('get returns null when the shell reports a miss', async () => {
    const { calls, call } = fakeCaller({ 'cache.get': { ok: true } });
    const capabilities = createCapabilities(call);

    const value = await capabilities.cache.get('tracks');

    expect(value).toBeNull();
    expect(calls[0].params).toEqual({ key: 'tracks' });
  });

  test('set forwards ttlSeconds and delete/clear hit their routes', async () => {
    const { calls, call } = fakeCaller({
      'cache.set': { ok: true },
      'cache.delete': { ok: true },
      'cache.clear': { ok: true },
    });
    const capabilities = createCapabilities(call);

    await capabilities.cache.set('tracks', { items: [1] }, { ttlSeconds: 120 });
    await capabilities.cache.delete('tracks');
    await capabilities.cache.clear();

    expect(calls.map((c) => [c.method, c.params])).toEqual([
      ['cache.set', { key: 'tracks', value: { items: [1] }, ttlSeconds: 120 }],
      ['cache.delete', { key: 'tracks' }],
      ['cache.clear', {}],
    ]);
  });
});

describe('toast and alert capability groups', () => {
  test('toast.show passes the whole option bag to the route', async () => {
    const { calls, call } = fakeCaller({ 'toast.show': { ok: true } });
    const capabilities = createCapabilities(call);

    await capabilities.toast.show({
      title: 'Saved',
      message: 'Note stored',
      style: 'success',
      duration: 3,
    });

    expect(calls).toEqual([
      {
        method: 'toast.show',
        params: { title: 'Saved', message: 'Note stored', style: 'success', duration: 3 },
        options: undefined,
      },
    ]);
  });

  test('alert.confirm resolves the confirmed flag from the shell', async () => {
    const { calls, call } = fakeCaller({ 'alert.confirm': { confirmed: true } });
    const capabilities = createCapabilities(call);

    const confirmed = await capabilities.alert.confirm({
      title: 'Delete note?',
      message: 'This cannot be undone.',
      confirmTitle: 'Delete',
      destructive: true,
    });

    expect(confirmed).toBe(true);
    expect(calls[0].method).toBe('alert.confirm');
    expect(calls[0].params).toEqual({
      title: 'Delete note?',
      message: 'This cannot be undone.',
      confirmTitle: 'Delete',
      destructive: true,
    });
  });

  test('alert.confirm treats a missing flag as declined', async () => {
    const { call } = fakeCaller({ 'alert.confirm': {} });
    const capabilities = createCapabilities(call);

    const confirmed = await capabilities.alert.confirm({ title: 'Continue?' });

    expect(confirmed).toBe(false);
  });
});

describe('filesystem extras', () => {
  test('mkdir and exists send path params', async () => {
    const { calls, call } = fakeCaller({
      'fs.mkdir': { ok: true },
      'fs.exists': { ok: true, exists: true },
    });
    const capabilities = createCapabilities(call);

    await capabilities.fs.mkdir('C:/vault/archive');
    const exists = await capabilities.fs.exists('C:/vault/archive');

    expect(exists).toBe(true);
    expect(calls.map((c) => [c.method, c.params])).toEqual([
      ['fs.mkdir', { path: 'C:/vault/archive' }],
      ['fs.exists', { path: 'C:/vault/archive' }],
    ]);
  });

  test('copy and move send from/to params; trash sends path', async () => {
    const { calls, call } = fakeCaller({
      'fs.copy': { ok: true },
      'fs.move': { ok: true },
      'fs.trash': { ok: true },
    });
    const capabilities = createCapabilities(call);

    await capabilities.fs.copy('C:/vault/a.md', 'C:/vault/b.md');
    await capabilities.fs.move('C:/vault/a.md', 'C:/vault/b.md');
    await capabilities.fs.trash('C:/vault/a.md');

    expect(calls.map((c) => [c.method, c.params])).toEqual([
      ['fs.copy', { from: 'C:/vault/a.md', to: 'C:/vault/b.md' }],
      ['fs.move', { from: 'C:/vault/a.md', to: 'C:/vault/b.md' }],
      ['fs.trash', { path: 'C:/vault/a.md' }],
    ]);
  });
});

describe('rich clipboard', () => {
  test('writeContent sends text, html and paths', async () => {
    const { calls, call } = fakeCaller({ 'clipboard.write': {} });
    const capabilities = createCapabilities(call);

    await capabilities.clipboard.writeContent({
      text: 'note',
      html: '<b>note</b>',
      paths: ['C:/a.txt'],
    });

    expect(calls[0].method).toBe('clipboard.write');
    expect(calls[0].params).toEqual({ text: 'note', html: '<b>note</b>', paths: ['C:/a.txt'] });
  });

  test('readContent returns the full clipboard snapshot', async () => {
    const { call } = fakeCaller({
      'clipboard.read': { text: 'note', html: '<b>note</b>', paths: ['C:/a.txt'] },
    });
    const capabilities = createCapabilities(call);

    const content = await capabilities.clipboard.readContent();

    expect(content).toEqual({ text: 'note', html: '<b>note</b>', paths: ['C:/a.txt'] });
  });

  test('clear hits the clipboard.clear route', async () => {
    const { calls, call } = fakeCaller({ 'clipboard.clear': { ok: true } });
    const capabilities = createCapabilities(call);

    await capabilities.clipboard.clear();

    expect(calls).toEqual([{ method: 'clipboard.clear', params: {}, options: undefined }]);
  });
});

describe('desktop queries', () => {
  test('frontmost returns the app record or null', async () => {
    const { calls, call } = fakeCaller({
      'apps.frontmost': {
        app: { id: null, name: 'Firefox', path: 'C:/Program Files/firefox.exe' },
      },
    });
    const capabilities = createCapabilities(call);

    const app = await capabilities.apps.frontmost();

    expect(app).toEqual({ id: null, name: 'Firefox', path: 'C:/Program Files/firefox.exe' });
    expect(calls[0].method).toBe('apps.frontmost');
  });

  test('defaultFor resolves the default executable', async () => {
    const { calls, call } = fakeCaller({ 'apps.default': { path: 'C:/app/editor.exe' } });
    const capabilities = createCapabilities(call);

    const result = await capabilities.apps.defaultFor('C:/notes/x.md');

    expect(result).toBe('C:/app/editor.exe');
    expect(calls[0].params).toEqual({ path: 'C:/notes/x.md' });
  });

  test('selectedText forwards the fallback opt-in', async () => {
    const { calls, call } = fakeCaller({ 'system.selectedText': { text: 'selected' } });
    const capabilities = createCapabilities(call);

    const text = await capabilities.system.selectedText({ allowFallback: true });

    expect(text).toBe('selected');
    expect(calls[0].params).toEqual({ allowFallback: true });
  });
});
