import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  spotifyFetch,
  resetRateLimit,
  SpotifyApiError,
  fetchLyrics,
  buildLyricsText,
} from './spotifyApi';

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const token = () => 'access-token';

beforeEach(() => {
  resetRateLimit();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('spotifyFetch', () => {
  it('sends the bearer token and hits the v1 base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await spotifyFetch('/me', { token: token() });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.spotify.com/v1/me');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer access-token',
    });
  });

  it('sends a JSON body for methods with data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await spotifyFetch('/me/player', {
      token: token(),
      method: 'PUT',
      body: { context_uri: 'spotify:album:1' },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify({ context_uri: 'spotify:album:1' }));
  });

  it('parses the JSON response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ item: { id: 't1' } })));
    const data = await spotifyFetch<{ item: { id: string } }>('/me/player', { token: token() });
    expect(data.item.id).toBe('t1');
  });

  it('throws SpotifyApiError with the provider message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: { status: 403, message: 'Premium required' } }, 403),
        ),
    );

    let err: SpotifyApiError | undefined;
    try {
      await spotifyFetch('/me/player/play', { token: token(), method: 'PUT' });
    } catch (e) {
      err = e as SpotifyApiError;
    }
    expect(err).toBeInstanceOf(SpotifyApiError);
    expect(err!.status).toBe(403);
    expect(err!.message).toBe('Premium required');
  });

  it('waits for Retry-After on 429 and retries once', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429, { 'Retry-After': '2' }))
      .mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const promise = spotifyFetch('/me', { token: token() });
    // First attempt happens immediately; the retry waits 2s of fake time
    await vi.advanceTimersByTimeAsync(2000);
    const data = await promise;

    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('makes a later request wait out an active rate-limit window', async () => {
    vi.useFakeTimers();
    const responses = [
      jsonResponse({}, 429, { 'Retry-After': '5' }),
      jsonResponse({ a: 1 }),
      jsonResponse({ b: 2 }),
    ];
    const fetchMock = vi.fn().mockImplementation(() => {
      const response = responses.shift() ?? jsonResponse({ fallback: true });
      return Promise.resolve(response);
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = spotifyFetch('/me', { token: token() });
    // Let the first request's 429 land so the shared window is set…
    await vi.advanceTimersByTimeAsync(0);
    // …then a second request must not even attempt a fetch until it expires.
    const second = spotifyFetch('/me/tracks', { token: token() });

    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    const [d1, d2] = await Promise.all([first, second]);
    expect(d1).toEqual({ a: 1 });
    expect(d2).toEqual({ b: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('fetchLyrics (LRCLIB)', () => {
  it('returns plain lyrics when available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          plainLyrics: 'first line\nsecond line',
          syncedLyrics: '[00:01.00] first line',
        }),
      ),
    );

    const lyrics = await fetchLyrics({ track: 'Song', artist: 'Artist', durationMs: 200000 });
    expect(lyrics).toBe('first line\nsecond line');
  });

  it('strips sync timestamps from synced lyrics when plain is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ plainLyrics: null, syncedLyrics: '[00:01.00] one\n[00:03.00] two' }),
        ),
    );

    const lyrics = await fetchLyrics({ track: 'Song', artist: 'Artist', durationMs: 200000 });
    expect(lyrics).toBe('one\ntwo');
  });

  it('returns null on 404 (no lyrics found)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 404)));
    const lyrics = await fetchLyrics({ track: 'Song', artist: 'Artist', durationMs: 1 });
    expect(lyrics).toBeNull();
  });
});

describe('buildLyricsText', () => {
  it('prefers plain lyrics', () => {
    expect(buildLyricsText('plain', '[00:01.00] synced')).toBe('plain');
  });

  it('strips timestamps from synced lyrics', () => {
    expect(buildLyricsText(null, '[00:12.50] line one\n[01:02.00] line two')).toBe(
      'line one\nline two',
    );
  });

  it('returns null when neither exists', () => {
    expect(buildLyricsText(null, null)).toBeNull();
  });
});
