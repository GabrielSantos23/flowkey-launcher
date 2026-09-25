import { describe, expect, test } from 'bun:test';
import {
  OAUTH_TIMEOUT_MS,
  SpotifyApiError,
  SpotifyClient,
  type NativeCallFn,
} from '../src/api/client';

interface RecordedCall {
  method: string;
  params: Record<string, unknown> | undefined;
  options: { signal?: AbortSignal; timeoutMs?: number } | undefined;
}

type ScriptedResponse = { result?: unknown; error?: { code: string; message: string } };

function scriptCall(responses: ScriptedResponse[]): { call: NativeCallFn; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const call: NativeCallFn = (async (method, params, options) => {
    calls.push({
      method: method as string,
      params: params as Record<string, unknown>,
      options,
    });
    const next = responses.shift();
    if (!next) {
      throw { code: 'noScriptedResponse', message: 'test scripted no further responses' };
    }
    if (next.error) {
      throw next.error;
    }
    return next.result;
  }) as NativeCallFn;
  return { call, calls };
}

const okJson = (body: unknown) => ({
  result: { status: 200, bodyText: JSON.stringify(body), headers: {}, truncated: false },
});

describe('SpotifyClient oauth', () => {
  test('authorize uses the spotify provider and a browser-round-trip timeout', async () => {
    const { call, calls } = scriptCall([{ result: { ok: true, expiresAt: 'e', scope: 's' } }]);
    const client = new SpotifyClient(call);
    const result = await client.authorize();
    expect(result.ok).toBe(true);
    const recorded = calls[0];
    expect(recorded.method).toBe('oauth.authorize');
    expect(recorded.params).toEqual({ provider: 'spotify' });
    expect(recorded.options?.timeoutMs).toBe(OAUTH_TIMEOUT_MS);
    expect(OAUTH_TIMEOUT_MS).toBeGreaterThanOrEqual(150_000);
  });

  test('authorize forwards the clientId preference when given', async () => {
    const { call, calls } = scriptCall([{ result: { ok: true } }]);
    const client = new SpotifyClient(call);
    await client.authorize(undefined, 'pref-client-id');
    expect(calls[0].params).toEqual({ provider: 'spotify', clientId: 'pref-client-id' });
    expect(calls[0].options?.timeoutMs).toBe(OAUTH_TIMEOUT_MS);
  });

  test('authStatus and disconnect target the spotify provider', async () => {
    const { call, calls } = scriptCall([{ result: { ok: false } }, { result: { ok: true } }]);
    const client = new SpotifyClient(call);
    await client.authStatus();
    await client.disconnect();
    expect(calls[0].method).toBe('oauth.status');
    expect(calls[1].method).toBe('oauth.disconnect');
    for (const entry of calls) {
      expect(entry.params).toEqual({ provider: 'spotify' });
    }
  });

  test('image.fetch returns the cached file uri', async () => {
    const { call, calls } = scriptCall([{ result: { ok: true, uri: 'file:///C:/cache/x.png' } }]);
    const client = new SpotifyClient(call);
    expect(await client.fetchImage('https://i.scdn.co/a.jpg')).toBe('file:///C:/cache/x.png');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('image.fetch');
    expect(calls[0].params).toEqual({ url: 'https://i.scdn.co/a.jpg' });
  });
});

describe('SpotifyClient api', () => {
  test('requests go through authed http.fetch to the pinned api host', async () => {
    const { call, calls } = scriptCall([okJson({ id: 'user-1', display_name: 'me' })]);
    const client = new SpotifyClient(call);
    const me = await client.me();
    expect(me.id).toBe('user-1');
    const params = calls[0].params!;
    expect(calls[0].method).toBe('http.fetch');
    expect(params.url).toBe('https://api.spotify.com/v1/me');
    expect(params.method).toBe('GET');
    expect(params.auth).toBe('spotify');
  });

  test('play sends a PUT with a json body', async () => {
    const { call, calls } = scriptCall([{ result: { status: 204, bodyText: '' } }]);
    const client = new SpotifyClient(call);
    await client.play({ context_uri: 'spotify:album:1' });
    const params = calls[0].params!;
    expect(params.method).toBe('PUT');
    expect(params.url).toBe('https://api.spotify.com/v1/me/player/play');
    expect(params.body).toBe(JSON.stringify({ context_uri: 'spotify:album:1' }));
    expect(params.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  test('search encodes query and type list', async () => {
    const { call, calls } = scriptCall([okJson({ tracks: { items: [] } })]);
    const client = new SpotifyClient(call);
    await client.search('daft punk', ['track', 'artist'], 20);
    const params = calls[0].params!;
    expect(params.url).toBe('https://api.spotify.com/v1/search?q=daft%20punk&type=track%2Cartist&limit=10');
  });

  test('artist albums are capped per page but paginate through all pages', async () => {
    const page = (offset: number, count: number, next: string | null) =>
      okJson({
        items: Array.from({ length: count }, (_, i) => ({
          id: `al${offset + i}`,
          name: `Album ${offset + i}`,
          images: [],
          artists: [],
          release_date: '2026',
          total_tracks: 1,
        })),
        next,
        total: 35,
      });
    const { call, calls } = scriptCall([page(0, 10, 'n1'), page(10, 10, 'n2'), page(20, 10, 'n3'), page(30, 5, null)]);
    const client = new SpotifyClient(call);
    const albums = await client.artistAlbums('ar1');
    expect(albums.items).toHaveLength(35);
    expect(calls).toHaveLength(4);
    expect(String(calls[0].params!.url)).toContain('limit=10&offset=0');
    expect(String(calls[1].params!.url)).toContain('offset=10');
    expect(String(calls[2].params!.url)).toContain('offset=20');
    expect(String(calls[3].params!.url)).toContain('offset=30');
  });

  test('artist albums stop paginating on an empty page', async () => {
    const { call, calls } = scriptCall([okJson({ items: [], next: 'n', total: 0 })]);
    const client = new SpotifyClient(call);
    await client.artistAlbums('ar1');
    expect(calls).toHaveLength(1);
  });

  test('search caps the limit for dev-mode apps', async () => {
    const { call, calls } = scriptCall([okJson({ tracks: { items: [] } })]);
    const client = new SpotifyClient(call);
    await client.search('kanye', ['track'], 50);
    expect(String(calls[0].params!.url)).toContain('limit=10');
  });

  test('play falls back to an inactive device via transfer', async () => {
    const { call, calls } = scriptCall([
      { error: { code: 'apiError', message: 'Device not found' } },
      okJson({ device: { id: 'd0', is_active: false, is_restricted: false, name: 'pc', type: 'Computer', volume_percent: 50 } }),
      okJson({ devices: [{ id: 'd1', is_active: false, is_restricted: false, name: 'Speakers', type: 'Speaker', volume_percent: 50 }] }),
      { result: { status: 204, bodyText: '' } },
      { result: { status: 204, bodyText: '' } },
    ]);
    const client = new SpotifyClient(call);
    await client.play({ uris: ['spotify:track:t1'] });
    const methods = calls.map((entry) => ({
      method: entry.params!.method,
      url: String(entry.params!.url),
    }));
    expect(methods[0].url).toBe('https://api.spotify.com/v1/me/player/play');
    expect(methods[1].url).toBe('https://api.spotify.com/v1/me/player?additional_types=episode');
    expect(methods[2].url).toBe('https://api.spotify.com/v1/me/player/devices');
    expect(methods[3].url).toBe('https://api.spotify.com/v1/me/player');
    expect(methods[4].url).toBe('https://api.spotify.com/v1/me/player/play?device_id=d1');
  });

  test('play rethrows when no device can be found', async () => {
    const { call } = scriptCall([
      { error: { code: 'apiError', message: 'Device not found' } },
      okJson({ device: null }),
      okJson({ devices: [] }),
    ]);
    const client = new SpotifyClient(call);
    try {
      await client.play({ uris: ['spotify:track:t1'] });
      throw new Error('expected rejection');
    } catch (error) {
      expect((error as SpotifyApiError).message).toContain('Device not found');
    }
  });

  test('playlistTracks paginates through all pages', async () => {
    const page = (offset: number, count: number, next: string | null) =>
      okJson({
        items: Array.from({ length: count }, (_, i) => ({
          track: { id: `t${offset + i}`, name: `track ${offset + i}`, uri: `spotify:track:t${offset + i}` },
        })),
        next,
        total: 120,
      });
    const { call, calls } = scriptCall([page(0, 50, 'next-1'), page(50, 50, 'next-2'), page(100, 20, null)]);
    const client = new SpotifyClient(call);
    const tracks = await client.playlistTracks('pl-1', 500);
    expect(tracks).toHaveLength(120);
    expect(calls).toHaveLength(3);
    expect(calls[0].params!.url).toContain('offset=0');
    expect(calls[1].params!.url).toContain('offset=50');
    expect(calls[2].params!.url).toContain('offset=100');
  });

  test('surfaces authRequired as the error code', async () => {
    const { call } = scriptCall([{ error: { code: 'authRequired', message: 're-auth' } }]);
    const client = new SpotifyClient(call);
    try {
      await client.me();
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(SpotifyApiError);
      expect((error as SpotifyApiError).code).toBe('authRequired');
    }
  });

  test('maps non-2xx api errors with status and reason', async () => {
    const { call } = scriptCall([
      {
        result: {
          status: 403,
          bodyText: JSON.stringify({ error: { message: 'Premium required', reason: 'PREMIUM_REQUIRED' } }),
        },
      },
    ]);
    const client = new SpotifyClient(call);
    try {
      await client.me();
      throw new Error('expected rejection');
    } catch (error) {
      const apiError = error as SpotifyApiError;
      expect(apiError).toBeInstanceOf(SpotifyApiError);
      expect(apiError.status).toBe(403);
      expect(apiError.code).toBe('PREMIUM_REQUIRED');
      expect(apiError.message).toContain('Premium required');
    }
  });

  test('empty 204 responses resolve to null', async () => {
    const { call } = scriptCall([{ result: { status: 204, bodyText: '' } }]);
    const client = new SpotifyClient(call);
    expect(await client.currentlyPlaying()).toBeNull();
  });

  test('native aborts keep their code', async () => {
    const { call } = scriptCall([{ error: { code: 'aborted', message: 'root destroyed' } }]);
    const client = new SpotifyClient(call);
    try {
      await client.search('x', ['track']);
      throw new Error('expected rejection');
    } catch (error) {
      expect((error as SpotifyApiError).code).toBe('aborted');
    }
  });
});
