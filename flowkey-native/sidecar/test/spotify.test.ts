import { beforeEach, describe, expect, test } from 'bun:test';
import type { ListTree, SidecarMessage } from '@flowkey/native-sdk';
import spotify from '@flowkey/extension-spotify';
import { Dispatcher, loadExtensions } from '../src/loader';
import { clearRecentSearches } from '@flowkey/extension-spotify/src/recent';
import { resetCaches } from '@flowkey/extension-spotify/src/store';

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
  const resolvedIds = new Set<string>();
  const resolveLatest = async (
    method: string,
    body: { result?: unknown; error?: { code: string; message: string } },
  ) => {
    const call = calls().find(
      (candidate) => candidate.method === method && !resolvedIds.has(candidate.requestId),
    );
    if (!call) {
      throw new Error(`no pending nativeCall for ${method}`);
    }
    resolvedIds.add(call.requestId);
    dispatcher.handleNativeResult({
      type: 'nativeResult',
      requestId: call.requestId,
      ok: !body.error,
      result: body.result,
      error: body.error ?? { code: '', message: '' },
    });
  };
  const resolveAll = async (
    method: string,
    body: { result?: unknown; error?: { code: string; message: string } },
  ) => {
    const seen = new Set<string>();
    for (const call of calls().filter((candidate) => candidate.method === method)) {
      if (seen.has(call.requestId)) continue;
      seen.add(call.requestId);
      dispatcher.handleNativeResult({
        type: 'nativeResult',
        requestId: call.requestId,
        ok: !body.error,
        result: body.result,
        error: body.error ?? { code: '', message: '' },
      });
    }
  };
  const open = () =>
    dispatcher.handle(
      {
        type: 'action',
        requestId: 'a-open',
        extensionId: 'spotify',
        actionId: '__open__',
        item: { id: 'search', title: 'Spotify Search' },
      } as never,
      emit,
    );
  const search = (query: string, requestId: string, commandId = 'search') =>
    dispatcher.handle(
      { type: 'search', requestId, extensionId: 'spotify', query, commandId } as never,
      emit,
    );
  const act = (actionId: string, requestId: string, itemId: string, title: string) =>
    dispatcher.handle(
      {
        type: 'action',
        requestId,
        extensionId: 'spotify',
        actionId,
        item: { id: itemId, title },
      } as never,
      emit,
    );
  const pushTrees = () =>
    (messages.filter((m) => m.type === 'uiPush') as unknown as Array<{ tree: ListTree }>).map(
      (message) => message.tree,
    );
  const lastPush = () => pushTrees().at(-1);
  const titles = (tree?: ListTree) => {
    if (!tree) return [];
    const titles = tree.sections.flatMap((section) => section.items.map((item) => item.title));
    return tree.emptyView?.title ? [...titles, tree.emptyView.title] : titles;
  };
  const subtitles = (tree?: ListTree) => {
    if (!tree) return [];
    return tree.sections.flatMap((section) => section.items.map((item) => item.subtitle ?? ''));
  };
  return {
    dispatcher,
    messages,
    calls,
    resolveLatest,
    open,
    search,
    act,
    pushTrees,
    lastPush,
    titles,
    subtitles,
    emit,
  };
}

const searchFixture = {
  artists: {
    items: [
      {
        id: 'a1',
        name: 'Daft Punk',
        images: [{ url: 'https://i.scdn.co/artist.jpg', width: 100, height: 100 }],
      },
    ],
  },
  tracks: {
    items: [
      {
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
          images: [
            { url: 'https://i.scdn.co/big.jpg', width: 640, height: 640 },
            { url: 'https://i.scdn.co/small.jpg', width: 64, height: 64 },
          ],
          artists: [{ name: 'Daft Punk' }],
        },
      },
    ],
  },
};

describe('spotify registration', () => {
  test('the sidecar registry loads the spotify extension', () => {
    const ids = loadExtensions().map((module) => module.manifest.id);
    expect(ids).toContain('spotify');
    expect(ids.filter((id) => id === 'spotify')).toHaveLength(1);
  });
});

describe('spotify search command', () => {
  test('opens with a connect prompt when unauthorized', async () => {
    clearRecentSearches();
    const h = harness();
    await h.open();
    await h.resolveLatest('oauth.status', { result: { ok: false } });
    await sleep(200);
    expect(h.titles(h.lastPush())).toContain('Connect Spotify');
  });

  test('connect action authorizes with the browser timeout and reaches the empty state', async () => {
    clearRecentSearches();
    const h = harness({ clientId: 'pref-client-id' });
    await h.open();
    await h.resolveLatest('oauth.status', { result: { ok: false } });
    await sleep(200);
    const connectAction = h.lastPush()!.sections[0].items[0].actions?.[0]?.id;
    expect(connectAction).toBeTruthy();
    const pending = h.act(connectAction!, 'a-connect', 'connect-spotify', 'Connect Spotify');
    await sleep(30);
    await h.resolveLatest('oauth.authorize', { result: { ok: true, expiresAt: 'e', scope: 's' } });
    await pending;
    await sleep(200);
    const authorize = h.calls().find((call) => call.method === 'oauth.authorize');
    expect(authorize!.params).toEqual({ provider: 'spotify', clientId: 'pref-client-id' });
    expect(h.titles(h.lastPush())).toContain('What do you want to listen to?');
  });

  test('authorized search fetches with auth and renders sections', async () => {
    clearRecentSearches();
    const h = harness();
    await h.open();
    await h.resolveLatest('oauth.status', { result: { ok: true, expiresAt: 'e', scope: 's' } });
    await sleep(200);
    await h.search('daft', 's-1');
    await sleep(250);
    await h.resolveLatest('http.fetch', {
      result: {
        status: 200,
        bodyText: JSON.stringify(searchFixture),
        headers: {},
        truncated: false,
      },
    });
    await sleep(250);
    await h.resolveLatest('image.fetch', { result: { ok: true, uri: 'file:///cache/artist.png' } });
    await sleep(120);
    await h.resolveLatest('image.fetch', { result: { ok: true, uri: 'file:///cache/small.png' } });
    await sleep(250);
    const fetchCall = h.calls().find((call) => call.method === 'http.fetch');
    expect(fetchCall!.params.auth).toBe('spotify');
    expect(String(fetchCall!.params.url)).toContain('https://api.spotify.com/v1/search?q=daft');
    expect(String(fetchCall!.params.url)).toContain(
      'type=track%2Cartist%2Calbum%2Cplaylist%2Cshow%2Cepisode',
    );
    const rendered = h.titles(h.lastPush());
    expect(rendered).toContain('Daft Punk');
    expect(rendered).toContain('One More Time');
    expect(h.subtitles(h.lastPush()).join(' | ')).toContain('5:20');
  });

  test('null entries in search results are pruned and the rest renders', async () => {
    clearRecentSearches();
    const h = harness();
    await h.open();
    await h.resolveLatest('oauth.status', { result: { ok: true, expiresAt: 'e', scope: 's' } });
    await sleep(200);
    await h.search('kanye', 's-1');
    await sleep(250);
    await h.resolveLatest('http.fetch', {
      result: {
        status: 200,
        bodyText: JSON.stringify({
          artists: {
            items: [
              null,
              {
                id: 'a1',
                name: 'Kanye West',
                images: [{ url: 'https://i.scdn.co/a.jpg', width: 1, height: 1 }],
              },
            ],
          },
          playlists: {
            items: [
              null,
              {
                id: 'p1',
                name: 'mix',
                images: null,
                owner: { id: 'u', display_name: 'me' },
                tracks: { total: 3 },
              },
            ],
          },
        }),
      },
    });
    await sleep(80);
    await h.resolveLatest('image.fetch', { result: { ok: true, uri: 'file:///cache/artist.png' } });
    await sleep(250);
    const rendered = h.titles(h.lastPush());
    expect(rendered).toContain('Kanye West');
    expect(rendered).toContain('mix');
    expect(h.calls().filter((call) => call.method === 'image.fetch')).toHaveLength(1);
  });

  test('authRequired mid-search flips back to the connect prompt', async () => {
    clearRecentSearches();
    const h = harness();
    await h.open();
    await h.resolveLatest('oauth.status', { result: { ok: true, expiresAt: 'e', scope: 's' } });
    await sleep(200);
    await h.search('daft', 's-1');
    await sleep(250);
    await h.resolveLatest('http.fetch', {
      error: { code: 'authRequired', message: 're-authorization is required' },
    });
    await sleep(200);
    expect(h.titles(h.lastPush())).toContain('Connect Spotify');
  });
});

describe('spotify sub-views', () => {
  const albumStub = {
    items: [
      {
        id: 't1',
        name: 'Dark Fantasy',
        uri: 'spotify:track:t1',
        duration_ms: 240000,
        artists: [{ name: 'Kanye West' }],
      },
      {
        id: 't2',
        name: 'Runaway',
        uri: 'spotify:track:t2',
        duration_ms: 547000,
        artists: [{ name: 'Kanye West' }, { name: 'Pusha T' }],
      },
    ],
    next: null,
    total: 2,
  };

  test('album-songs command loads and lists album tracks', async () => {
    clearRecentSearches();
    const h = harness();
    await h.open();
    await h.resolveLatest('oauth.status', { result: { ok: true, expiresAt: 'e', scope: 's' } });
    await sleep(200);
    await h.search('', 'sv-1', 'album-songs:al1');
    await sleep(80);
    await h.resolveLatest('http.fetch', {
      result: { status: 200, bodyText: JSON.stringify(albumStub) },
    });
    await sleep(250);
    const rendered = h.titles(h.lastPush());
    expect(rendered).toContain('Dark Fantasy');
    expect(rendered).toContain('Runaway');
    expect(h.subtitles(h.lastPush()).join(' | ')).toContain('4:00');
  });

  test('artist-songs caps popular tracks at ten and filters by query', async () => {
    clearRecentSearches();
    const h = harness();
    await h.open();
    await h.resolveLatest('oauth.status', { result: { ok: true, expiresAt: 'e', scope: 's' } });
    await sleep(200);
    await h.search('run', 'sv-2', 'artist-songs:ar1');
    await sleep(80);
    await h.resolveLatest('http.fetch', {
      result: {
        status: 200,
        bodyText: JSON.stringify({
          id: 'me-1',
          display_name: 'me',
          product: 'premium',
          country: 'US',
        }),
      },
    });
    await sleep(80);
    await h.resolveLatest('http.fetch', {
      result: {
        status: 200,
        bodyText: JSON.stringify({
          tracks: Array.from({ length: 14 }, (_, i) => ({
            id: `t${i}`,
            name: i === 2 ? 'Runaway' : `Track ${i}`,
            uri: `spotify:track:t${i}`,
            duration_ms: 200000,
            artists: [{ name: 'Kanye West' }],
          })),
        }),
      },
    });
    await sleep(250);
    const rendered = h.titles(h.lastPush());
    expect(rendered).toHaveLength(1);
    expect(rendered).toContain('Runaway');
  });
});

describe('spotify library', () => {
  beforeEach(() => {
    resetCaches();
  });
  const libraryStubs = [
    okJson({
      items: [
        {
          id: 'pl1',
          name: 'road trip mix',
          images: [],
          owner: { id: 'u1', display_name: 'me' },
          tracks: { total: 12 },
        },
      ],
      next: null,
      total: 1,
    }),
    okJson({
      items: [
        {
          album: {
            id: 'al1',
            name: 'MBDTF',
            images: [],
            artists: [{ name: 'Kanye West' }],
            release_date: '2010-11-22',
            total_tracks: 13,
          },
        },
      ],
      next: null,
      total: 1,
    }),
    okJson({ artists: { items: [{ id: 'ar1', name: 'Kanye West', images: [] }], next: null } }),
    okJson({
      items: [
        {
          track: {
            id: 't1',
            name: 'Runaway',
            uri: 'spotify:track:t1',
            duration_ms: 547000,
            artists: [{ name: 'Kanye West' }],
          },
        },
      ],
      next: null,
      total: 7,
    }),
    okJson({
      items: [
        {
          show: {
            id: 'sh1',
            name: 'Hip Hop Podcast',
            images: [],
            publisher: 'p',
            total_episodes: 5,
          },
        },
      ],
      next: null,
      total: 1,
    }),
    okJson({
      items: [
        {
          episode: {
            id: 'e1',
            name: 'Episode 1',
            uri: 'spotify:episode:e1',
            duration_ms: 1000,
            images: [],
            show: { id: 'sh1', name: 'Hip Hop Podcast', images: [] },
            description: 'd',
          },
        },
      ],
      next: null,
      total: 1,
    }),
    okJson({ id: 'me-1', display_name: 'me', product: 'premium', country: 'US' }),
  ];

  test('your-library renders all six sections plus the liked songs entry', async () => {
    clearRecentSearches();
    const h = harness();
    await h.open();
    await h.resolveLatest('oauth.status', { result: { ok: true, expiresAt: 'e', scope: 's' } });
    await sleep(200);
    await h.search('', 'lib-1', 'your-library');
    await sleep(100);
    await h.resolveLatest('oauth.status', { result: { ok: true, expiresAt: 'e', scope: 's' } });
    await sleep(100);
    for (const stub of libraryStubs) {
      await h.resolveLatest('http.fetch', stub);
    }
    await sleep(300);
    const rendered = h.titles(h.lastPush());
    expect(rendered).toContain('road trip mix');
    expect(rendered).toContain('Liked Songs');
    expect(rendered).toContain('MBDTF');
    expect(rendered).toContain('Kanye West');
    expect(rendered).toContain('Runaway');
    expect(rendered).toContain('Hip Hop Podcast');
    expect(rendered).toContain('Episode 1');
    expect(rendered.filter((title) => title === 'Liked Songs')).toHaveLength(1);
  });

  test('your-library filters client side by query', async () => {
    clearRecentSearches();
    const h = harness();
    await h.open();
    await h.resolveLatest('oauth.status', { result: { ok: true, expiresAt: 'e', scope: 's' } });
    await sleep(200);
    await h.search('runa', 'lib-2', 'your-library');
    await sleep(100);
    await h.resolveLatest('oauth.status', { result: { ok: true, expiresAt: 'e', scope: 's' } });
    await sleep(100);
    for (const stub of libraryStubs) {
      await h.resolveLatest('http.fetch', stub);
    }
    await sleep(300);
    const rendered = h.titles(h.lastPush());
    expect(rendered).toContain('Runaway');
    expect(rendered).not.toContain('road trip mix');
    expect(rendered).not.toContain('MBDTF');
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

describe('spotify now-playing', () => {
  test('shows a connect prompt when unauthorized', async () => {
    const h = harness();
    await h.search('', 'np-1', 'now-playing');
    await sleep(100);
    await h.resolveLatest('oauth.status', { result: { ok: false } });
    await sleep(400);
    expect(h.titles(h.lastPush())).toContain('Connect Spotify');
  });

  test('renders a detail tree with metadata fields and artwork', async () => {
    resetCaches();
    const h = harness();
    await h.search('', 'np-2', 'now-playing');
    await sleep(100);
    await h.resolveLatest('oauth.status', { result: { ok: true, expiresAt: 'e', scope: 's' } });
    await sleep(400);
    await h.resolveLatest('http.fetch', okJson(playbackFixture));
    await sleep(400);
    await h.resolveLatest('http.fetch', okJson({ result: true } as never));
    await sleep(400);
    await h.resolveLatest('image.fetch', { result: { ok: true, uri: 'file:///cache/np.png' } });
    await sleep(400);
    const fetchCall = h.calls().find((call) => call.method === 'http.fetch');
    expect(String(fetchCall!.params.url)).toContain('https://api.spotify.com/v1/me/player');
    expect(fetchCall!.params.auth).toBe('spotify');
    const detail = h.lastPush() as unknown as {
      title: string;
      subtitle: string;
      imageUri: string;
      fields: Array<{ label: string; value: string }>;
      actions?: Array<{ id: string; title: string; primary?: boolean }>;
    };
    expect(detail.title).toBe('One More Time');
    expect(detail.subtitle).toBe('by Daft Punk');
    expect(detail.imageUri).toBe('file:///cache/np.png');
    const values = detail.fields.map((field) => field.value);
    expect(values).toContain('Living Room');
    expect(values).toContain('0:45 / 5:20');
    expect(values).toContain('Discovery');
    const firstAction = detail.actions?.[0];
    expect(firstAction?.title).toBe('Pause');
    expect(firstAction?.primary).toBe(true);
  });

  test('shows an empty state when there is no active device', async () => {
    resetCaches();
    const h = harness();
    await h.search('', 'np-3', 'now-playing');
    await sleep(100);
    await h.resolveLatest('oauth.status', { result: { ok: true, expiresAt: 'e', scope: 's' } });
    await sleep(400);
    await h.resolveLatest('http.fetch', okJson({ ...playbackFixture, device: null }));
    await sleep(400);
    expect(h.titles(h.lastPush())).toContain('No active Spotify device');
  });

  test('pause action issues a PUT to /me/player/pause and refreshes state', async () => {
    resetCaches();
    const h = harness();
    await h.search('', 'np-4', 'now-playing');
    await sleep(100);
    await h.resolveLatest('oauth.status', { result: { ok: true, expiresAt: 'e', scope: 's' } });
    await sleep(400);
    await h.resolveLatest('http.fetch', okJson(playbackFixture));
    await sleep(400);
    await h.resolveLatest('http.fetch', okJson({ result: true } as never));
    await sleep(400);
    const detail = h.lastPush() as unknown as {
      title: string;
      actions: Array<{ id: string; title: string }>;
    };
    expect(detail.title).toBe('One More Time');
    const pauseAction = detail.actions?.[0]?.id;
    expect(detail.actions?.[0]?.title).toBe('Pause');
    expect(pauseAction).toBeTruthy();
    const pending = h.act(pauseAction!, 'a-pause', 'now-playing', detail.title);
    await sleep(60);
    await h.resolveLatest('http.fetch', {
      result: { status: 204, bodyText: '', headers: {}, truncated: false },
    });
    await pending;
    await sleep(400);
    await h.resolveLatest('http.fetch', okJson(playbackFixture));
    await sleep(400);
    const pauseCall = h
      .calls()
      .filter((call) => call.method === 'http.fetch')
      .find((call) => String(call.params.url).includes('/me/player/pause'));
    expect(pauseCall!.params.method).toBe('PUT');
    const refreshed = h.lastPush() as unknown as { description?: string };
    expect(refreshed.description).toContain('Paused');
  });
});

describe('spotify player commands', () => {
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

  test('next tolerates a non-json 200 response', async () => {
    const h = harness();
    await h.search('', 'pc-8', 'next');
    await commandStubs.resolve(h, 'http.fetch', okJson(playbackFixture));
    await sleep(400);
    await h.resolveLatest('http.fetch', {
      result: { status: 200, bodyText: '<html>gateway blip</html>', headers: {}, truncated: false },
    });
    await sleep(400);
    const hudCall = h.calls().find((call) => call.method === 'hud.show');
    expect(hudCall).toBeTruthy();
    expect(String(hudCall!.params.title)).toContain('Skipped');
  });

  test('toggle-play-pause pauses when playing', async () => {
    const h = harness();
    await h.search('', 'pc-3', 'toggle-play-pause');
    await commandStubs.resolve(h, 'http.fetch', okJson(playbackFixture));
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

  test('find-lyrics retries once when lrclib answers 503', async () => {
    const h = harness();
    await h.search('', 'pc-5', 'find-lyrics');
    await commandStubs.resolve(h, 'http.fetch', okJson(playbackFixture));
    await sleep(400);
    await h.resolveLatest('http.fetch', {
      result: { status: 503, bodyText: 'Service Unavailable', headers: {}, truncated: false },
    });
    await sleep(300);
    await h.resolveLatest('http.fetch', {
      result: {
        status: 200,
        bodyText: JSON.stringify([
          {
            trackName: 'One More Time',
            artistName: 'Daft Punk',
            plainLyrics: 'One more time we are gonna celebrate',
          },
        ]),
        headers: {},
        truncated: false,
      },
    });
    await sleep(400);
    const lrclibCalls = h
      .calls()
      .filter((call) => call.method === 'http.fetch')
      .filter((call) => String(call.params.url).includes('lrclib.net'));
    expect(lrclibCalls).toHaveLength(2);
    const detail = h.lastPush() as unknown as { title?: string; description?: string };
    expect(detail.title).toContain('One More Time');
  });

  test('find-lyrics queries lrclib without auth and renders the lyrics', async () => {
    const h = harness();
    await h.search('', 'pc-4', 'find-lyrics');
    await commandStubs.resolve(h, 'http.fetch', okJson(playbackFixture));
    await sleep(400);
    await h.resolveLatest('http.fetch', {
      result: {
        status: 200,
        bodyText: JSON.stringify([
          {
            trackName: 'One More Time',
            artistName: 'Daft Punk',
            plainLyrics: 'One more time we are gonna celebrate\nOh yeah',
          },
        ]),
        headers: {},
        truncated: false,
      },
    });
    await sleep(400);
    const lyricsCall = h
      .calls()
      .filter((call) => call.method === 'http.fetch')
      .find((call) => String(call.params.url).includes('lrclib.net'));
    expect(lyricsCall).toBeTruthy();
    expect(lyricsCall!.params.auth).toBeUndefined();
    const detail = h.lastPush() as unknown as { title?: string; description?: string };
    expect(detail.title).toContain('One More Time');
    expect(detail.description).toContain('celebrate');
  });

  test('devices lists devices and transfer issues PUT /me/player', async () => {
    const h = harness();
    await h.search('', 'pc-5', 'devices');
    await sleep(100);
    await h.resolveLatest('http.fetch', okJson({ devices: [playbackFixture.device] }));
    await sleep(400);
    const rendered = h.titles(h.lastPush());
    expect(rendered).toContain('Living Room');
    const item = h.lastPush()!.sections[0].items[0];
    const transferAction = item.actions?.[0]?.id;
    expect(transferAction).toBeTruthy();
    const pending = h.act(transferAction!, 'a-transfer', item.id, item.title);
    await sleep(60);
    await h.resolveLatest('http.fetch', {
      result: { status: 204, bodyText: '', headers: {}, truncated: false },
    });
    await pending;
    await sleep(400);
    const transferCall = h
      .calls()
      .filter((call) => call.method === 'http.fetch')
      .find(
        (call) => String(call.params.url).endsWith('/me/player') && call.params.method === 'PUT',
      );
    expect(transferCall).toBeTruthy();
    expect(String(transferCall!.params.body)).toContain('d1');
  });
});
