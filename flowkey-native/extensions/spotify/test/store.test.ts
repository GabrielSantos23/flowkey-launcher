import { describe, expect, test } from 'bun:test';
import { SpotifyApiError, SpotifyClient, type NativeCallFn } from '../src/api/client';
import { loadArtistTopTracks, resetCaches } from '../src/store';

interface RecordedCall {
  method: string;
  params: Record<string, unknown>;
}

function scriptCall(responses: { result?: unknown; error?: { code: string; message: string; status?: number } }[]): {
  call: NativeCallFn;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const call: NativeCallFn = (async (method, params) => {
    calls.push({ method: method as string, params: params as Record<string, unknown> });
    const next = responses.shift();
    if (!next) {
      throw { code: 'noScriptedResponse', message: 'no scripted response' };
    }
    if (next.error) {
      throw new SpotifyApiError(next.error.code, next.error.message, next.error.status);
    }
    return next.result;
  }) as NativeCallFn;
  return { call, calls };
}

const okJson = (body: unknown) => ({
  result: { status: 200, bodyText: JSON.stringify(body), headers: {}, truncated: false },
});

describe('loadArtistTopTracks', () => {
  test('falls back to artist-scoped search when top-tracks is forbidden', async () => {
    resetCaches();
    const { call, calls } = scriptCall([
      okJson({ id: 'me-1', display_name: 'me', product: 'premium', country: 'US' }),
      { error: { code: 'forbidden', message: 'forbidden', status: 403 } },
      okJson({ id: 'ar1', name: 'Kanye West' }),
      okJson({
        tracks: {
          items: [
            { id: 't1', name: "Can't Tell Me Nothing", uri: 'spotify:track:t1', duration_ms: 231000, artists: [{ name: 'Kanye West' }] },
          ],
        },
      }),
    ]);
    const tracks = await loadArtistTopTracks(new SpotifyClient(call), 'ar1');
    expect(tracks).toHaveLength(1);
    expect(tracks[0].name).toBe("Can't Tell Me Nothing");
    expect(String(calls[1].params.url)).toContain('/artists/ar1/top-tracks');
    expect(String(calls[2].params.url)).toContain('/artists/ar1');
    expect(String(calls[3].params.url)).toContain(encodeURIComponent('Kanye West'));
  });

  test('other errors propagate without fallback', async () => {
    resetCaches();
    const { call } = scriptCall([
      okJson({ id: 'me-1', display_name: 'me', product: 'premium', country: 'US' }),
      { error: { code: 'timeout', message: 'request timed out' } },
    ]);
    try {
      await loadArtistTopTracks(new SpotifyClient(call), 'ar2');
      throw new Error('expected rejection');
    } catch (error) {
      expect((error as SpotifyApiError).code).toBe('timeout');
    }
  });
});
