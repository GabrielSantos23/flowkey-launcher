import { describe, expect, test } from 'bun:test';
import type { SidecarMessage, WebViewMessage } from '@flowkey-cli/native-sdk';
import spotify from '@flowkey-cli/extension-spotify';
import { Dispatcher, loadExtensions } from '../src/loader';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface RecordedCall {
  requestId: string;
  method: string;
  params: Record<string, unknown> | undefined;
  options: { signal?: AbortSignal; timeoutMs?: number } | undefined;
}

const okJson = (body: unknown) => ({
  result: { status: 200, bodyText: JSON.stringify(body), headers: {}, truncated: false },
});

function harness(preferences: Record<string, unknown> = {}) {
  const messages: SidecarMessage[] = [];
  const emit = (message: SidecarMessage) => {
    messages.push(message);
    if (message.type === 'nativeCall' && message.method === 'media.current') {
      dispatcher.handleNativeResult({
        type: 'nativeResult',
        requestId: message.requestId,
        ok: true,
        result: {
          playing: true,
          title: 'One More Time',
          artist: 'Daft Punk',
          album: 'Discovery',
          positionMs: 11000,
          durationMs: 213000,
          updatedAtMs: Date.now(),
        },
      });
    }
    if (message.type === 'nativeCall' && message.method === 'hud.show') {
      dispatcher.handleNativeResult({
        type: 'nativeResult',
        requestId: message.requestId,
        ok: true,
        result: { ok: true },
      });
    }
  };
  const dispatcher = new Dispatcher([{ ...spotify, preferences }] as never, emit);
  const calls = () =>
    (messages.filter((m) => m.type === 'nativeCall') as unknown as RecordedCall[]).map((call) => ({
      ...call,
      params: call.params as Record<string, unknown>,
    }));
  const resolveLatest = async (
    method: string,
    body: { result?: unknown; error?: { code: string; message: string } },
  ) => {
    await sleep(100);
    const call = calls()
      .filter((candidate) => candidate.method === method)
      .at(-1);
    if (!call) {
      throw new Error(
        `no pending nativeCall for ${method}; have: ${calls()
          .map((c) => c.method + '#' + c.requestId)
          .join(',')}`,
      );
    }
    dispatcher.handleNativeResult({
      type: 'nativeResult',
      requestId: call.requestId,
      ok: !body.error,
      result: body.result,
      error: body.error ?? { code: '', message: '' },
    });
    await sleep(50);
  };
  const open = (commandId = 'search') =>
    dispatcher.handle(
      {
        type: 'action',
        requestId: `a-open-${commandId}`,
        extensionId: 'spotify',
        actionId: '__open__',
        item: { id: commandId, title: commandId },
      } as never,
      (message) => messages.push(message),
    );
  const search = (query: string, requestId: string, commandId = 'search') =>
    dispatcher.handle(
      { type: 'search', requestId, extensionId: 'spotify', query, commandId } as never,
      (message) => messages.push(message),
    );
  const mounts = () => messages.filter((m) => m.type === 'webView') as unknown as WebViewMessage[];
  const pushTrees = () =>
    (
      messages.filter((m) => m.type === 'uiPush') as unknown as Array<{
        tree: { emptyView?: { title?: string } };
      }>
    ).map((message) => message.tree);
  const lastPush = () => pushTrees().at(-1);
  return { dispatcher, messages, calls, resolveLatest, open, search, mounts, pushTrees, lastPush };
}

const WEB_COMMAND_IDS = [
  'search',
  'your-library',
  'now-playing',
  'queue',
  'devices',
  'current-track',
  'add-playing-to-playlist',
  'remove-playing-from-playlist',
  'find-lyrics',
];

describe('spotify registration', () => {
  test('the sidecar registry loads the spotify extension', () => {
    const ids = loadExtensions().map((module) => module.manifest.id);
    expect(ids).toContain('spotify');
    expect(ids.filter((id) => id === 'spotify')).toHaveLength(1);
  });

  test('every view command is a web command sharing one bundle entry', () => {
    const commands = spotify.manifest.commands.filter((command) => command.mode !== 'background');
    expect(commands.map((command) => command.id).sort()).toEqual([...WEB_COMMAND_IDS].sort());
    for (const command of commands) {
      expect(command.ui).toBe('web');
      expect(command.mode).toBe('view');
      expect(command.webEntry).toBe('app.web.js');
    }
  });
});

describe('spotify web view commands', () => {
  test('opening a web command emits a webView mount, not a tree', async () => {
    const h = harness({ clientId: 'pref-client-id' });
    await h.open('search');
    await sleep(50);
    const mount = h.mounts().at(-1);
    expect(mount).toBeTruthy();
    expect(mount!.type).toBe('webView');
    expect(mount!.extensionId).toBe('spotify');
    expect(mount!.commandId).toBe('search');
    expect(mount!.entry).toBe('app.web.js');
    expect(mount!.props.query).toBe('');
    expect(mount!.props.environment.extensionId).toBe('spotify');
    expect(mount!.props.environment.commandId).toBe('search');
    expect(mount!.props.environment.commandMode).toBe('view');
    expect(mount!.props.preferences.clientId).toBe('pref-client-id');
    expect(h.messages.some((m) => m.type === 'ui')).toBe(false);
  });

  test('searches on a web command stream fresh props instead of rendering trees', async () => {
    const h = harness();
    await h.open('search');
    await sleep(50);
    await h.search('daft', 's-1');
    await h.search('daft punk', 's-2');
    await sleep(50);
    const mounts = h.mounts();
    expect(mounts.length).toBe(3);
    expect(mounts[0].props.query).toBe('');
    expect(mounts[1].props.query).toBe('daft');
    expect(mounts[2].props.query).toBe('daft punk');
    // the sidecar stays out of the data path for web commands: no http, no images
    expect(h.calls().filter((call) => call.method === 'http.fetch')).toHaveLength(0);
    expect(h.calls().filter((call) => call.method === 'image.fetch')).toHaveLength(0);
    expect(h.messages.some((m) => m.type === 'ui')).toBe(false);
  });

  test('all view commands share the web bundle entry', async () => {
    const h = harness();
    for (const commandId of WEB_COMMAND_IDS) {
      await h.search('', `w-${commandId}`, commandId);
    }
    await sleep(50);
    const mounts = h.mounts();
    expect(mounts).toHaveLength(WEB_COMMAND_IDS.length);
    expect(new Set(mounts.map((mount) => mount.entry))).toEqual(new Set(['app.web.js']));
    expect(new Set(mounts.map((mount) => mount.commandId))).toEqual(new Set(WEB_COMMAND_IDS));
  });
});

const playbackFixture = {
  device: {
    id: 'd1',
    is_active: true,
    is_restricted: false,
    name: 'Living Room',
    type: 'Computer',
    volume_percent: 60,
  },
  repeat_state: 'off',
  shuffle_state: false,
  context: { uri: 'spotify:playlist:pl1' },
  progress_ms: 45000,
  is_playing: true,
  item: {
    id: 't1',
    name: 'One More Time',
    uri: 'spotify:track:t1',
    duration_ms: 320000,
    artists: [{ name: 'Daft Punk' }],
    album: {
      id: 'al1',
      name: 'Discovery',
      release_date: '2001',
      total_tracks: 14,
      images: [{ url: 'https://i.scdn.co/big.jpg', width: 640, height: 640 }],
    },
  },
};

describe('spotify player commands (tree mode)', () => {
  const commandStubs = {
    resolve: async (h: ReturnType<typeof harness>, method: string, body: { result?: unknown }) => {
      await sleep(100);
      await h.resolveLatest(method, body);
      await sleep(300);
    },
  };

  test('volume-50 issues a PUT with volume_percent=50', async () => {
    const h = harness();
    await h.search('', 'pc-1', 'volume-50');
    await commandStubs.resolve(h, 'http.fetch', okJson(playbackFixture));
    await sleep(400);
    await h.resolveLatest('http.fetch', {
      result: { status: 204, bodyText: '', headers: {}, truncated: false },
    });
    await sleep(400);
    const volumeCall = h
      .calls()
      .filter((call) => call.method === 'http.fetch')
      .find((call) => String(call.params.url).includes('/me/player/volume'));
    expect(String(volumeCall!.params.url)).toContain('volume_percent=50');
    expect(volumeCall!.params.method).toBe('PUT');
    const rendered = h.lastPush() as unknown as { emptyView?: { title?: string } };
    expect(rendered.emptyView?.title).toContain('Volume: 50%');
  });

  test('skip-15 seeks forward from current progress', async () => {
    const h = harness();
    await h.search('', 'pc-2', 'skip-15');
    await commandStubs.resolve(h, 'http.fetch', okJson(playbackFixture));
    await sleep(400);
    await h.resolveLatest('http.fetch', {
      result: { status: 204, bodyText: '', headers: {}, truncated: false },
    });
    await sleep(400);
    const seekCall = h
      .calls()
      .filter((call) => call.method === 'http.fetch')
      .find((call) => String(call.params.url).includes('/me/player/seek'));
    expect(String(seekCall!.params.url)).toContain('position_ms=60000');
  });

  test('next skips via the Windows media controls', async () => {
    const h = harness();
    await h.search('', 'pc-8', 'next');
    await commandStubs.resolve(h, 'media.control', { result: { ok: true } });
    await sleep(400);
    const skipCall = h.calls().find((call) => call.method === 'media.control');
    expect(skipCall).toBeTruthy();
    expect(skipCall!.params).toEqual({ command: 'next' });
    expect(h.calls().filter((call) => call.method === 'http.fetch')).toHaveLength(0);
    const hudCall = h.calls().find((call) => call.method === 'hud.show');
    expect(hudCall).toBeTruthy();
    expect(String(hudCall!.params.title)).toBe('Skipped One More Time');
  });

  test('toggle-play-pause tolerates a non-json 200 response', async () => {
    const h = harness();
    await h.search('', 'pc-3', 'toggle-play-pause');
    await h.resolveLatest('http.fetch', {
      result: { status: 200, bodyText: '<html>gateway blip</html>', headers: {}, truncated: false },
    });
    await sleep(300);
    await h.resolveLatest('http.fetch', okJson(playbackFixture));
    await sleep(400);
    await h.resolveLatest('http.fetch', {
      result: { status: 204, bodyText: '', headers: {}, truncated: false },
    });
    await sleep(400);
    const pauseCall = h
      .calls()
      .filter((call) => call.method === 'http.fetch')
      .find((call) => String(call.params.url).includes('/me/player/pause'));
    expect(pauseCall).toBeTruthy();
    const hudCall = h.calls().find((call) => call.method === 'hud.show');
    expect(hudCall).toBeTruthy();
    expect(String(hudCall!.params.title)).toContain('Paused');
  });
});
