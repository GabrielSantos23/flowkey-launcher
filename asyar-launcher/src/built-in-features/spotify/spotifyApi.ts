import { logService } from '../../services/log/logService';

const API_BASE = 'https://api.spotify.com/v1';
const LRCLIB_BASE = 'https://lrclib.net/api/get';

// ── Errors ────────────────────────────────────────────────────────────────────

/** A non-2xx response from the Spotify Web API. */
export class SpotifyApiError extends Error {
  readonly status: number;
  /** The parsed provider body, for diagnosing scope/permission failures. */
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'SpotifyApiError';
    this.status = status;
    this.body = body;
  }
}

// ── Rate limiting (port of Raycast's rateLimitRetry) ──────────────────────────

let rateLimitedUntil = 0;

/** Test hook: clear the shared rate-limit window. */
export function resetRateLimit(): void {
  rateLimitedUntil = 0;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Core request ──────────────────────────────────────────────────────────────

export interface SpotifyFetchOptions {
  token: string;
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

function buildUrl(path: string, query?: SpotifyFetchOptions['query']): string {
  const url = new URL(path.startsWith('http') ? path : `${API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * One authenticated request to the Web API. Honours Spotify's 429
 * `Retry-After` header with a single retry and shares the wait window
 * across concurrent requests.
 */
export async function spotifyFetch<T>(path: string, options: SpotifyFetchOptions): Promise<T> {
  const now = Date.now();
  if (rateLimitedUntil > now) {
    await sleep(rateLimitedUntil - now);
  }

  const run = async (): Promise<Response> => {
    const url = buildUrl(path, options.query);
    const init: RequestInit = {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${options.token}`,
        'Content-Type': 'application/json',
      },
    };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }
    return fetch(url, init);
  };

  let response = await run();

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') ?? '1', 10);
    const waitMs = (Number.isNaN(retryAfter) ? 1 : retryAfter) * 1000;
    rateLimitedUntil = Date.now() + waitMs;
    logService.warn(`[Spotify] rate limited — waiting ${waitMs}ms before retrying`);
    await sleep(waitMs);
    response = await run();
  }

  if (response.status === 204 || response.headers.get('Content-Length') === '0') {
    return undefined as T;
  }

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const errBody = data as { error?: { message?: string } } | null;
    const message =
      (typeof errBody?.error === 'object' ? errBody.error?.message : undefined) ??
      (typeof errBody?.error === 'string' ? errBody.error : undefined) ??
      `Spotify request failed (${response.status})`;
    logService.warn(`[Spotify] ${response.status} on ${path}: ${text}`);
    throw new SpotifyApiError(response.status, message, data);
  }

  return data as T;
}

// ── Shared shapes ─────────────────────────────────────────────────────────────

export interface SpotifyImage {
  url: string;
  width: number | null;
  height: number | null;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  uri: string;
}

export interface SpotifyTrack {
  id: string | null;
  name: string;
  uri: string;
  duration_ms: number;
  explicit: boolean;
  artists: SpotifyArtist[];
  album: { id: string | null; name: string; uri: string; images: SpotifyImage[] };
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  public: boolean;
  collaborative: boolean;
  tracks: { total: number };
  images: SpotifyImage[] | null;
  owner: { display_name?: string };
}

export interface SpotifyDevice {
  id: string | null;
  is_active: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
}

export interface SpotifyPlaybackState {
  device: SpotifyDevice | null;
  repeat_state: 'off' | 'track' | 'context';
  shuffle_state: boolean;
  is_playing: boolean;
  progress_ms: number | null;
  item: (SpotifyTrack & { album: SpotifyTrack['album'] }) | null;
}

interface Paged<T> {
  items: T[];
  total: number;
  next: string | null;
}

// ── Player ────────────────────────────────────────────────────────────────────

export const getPlaybackState = (token: string) =>
  spotifyFetch<SpotifyPlaybackState | null>('/me/player', {
    token,
    query: { additional_types: 'track,episode' },
  });

export const play = (
  token: string,
  opts: { deviceId?: string; uris?: string[]; contextUri?: string },
) =>
  spotifyFetch<void>('/me/player/play', {
    token,
    method: 'PUT',
    query: { device_id: opts.deviceId },
    body: opts.uris
      ? { uris: opts.uris }
      : opts.contextUri
        ? { context_uri: opts.contextUri }
        : undefined,
  });

export const pause = (token: string, deviceId?: string) =>
  spotifyFetch<void>('/me/player/pause', { token, method: 'PUT', query: { device_id: deviceId } });

export const nextTrack = (token: string) =>
  spotifyFetch<void>('/me/player/next', { token, method: 'POST' });

export const previousTrack = (token: string) =>
  spotifyFetch<void>('/me/player/previous', { token, method: 'POST' });

export const seek = (token: string, positionMs: number) =>
  spotifyFetch<void>('/me/player/seek', {
    token,
    method: 'PUT',
    query: { position_ms: positionMs },
  });

export const setVolume = (token: string, volumePercent: number) =>
  spotifyFetch<void>('/me/player/volume', {
    token,
    method: 'PUT',
    query: { volume_percent: volumePercent },
  });

export const toggleShuffle = (token: string, state: boolean) =>
  spotifyFetch<void>('/me/player/shuffle', { token, method: 'PUT', query: { state } });

export const setRepeat = (token: string, state: 'off' | 'track' | 'context') =>
  spotifyFetch<void>('/me/player/repeat', { token, method: 'PUT', query: { state } });

export const getQueue = (token: string) =>
  spotifyFetch<{ currently_playing: SpotifyTrack | null; queue: SpotifyTrack[] }>('/me/queue', {
    token,
  });

export const getDevices = (token: string) =>
  spotifyFetch<{ devices: SpotifyDevice[] }>('/me/player/devices', { token });

export const transferPlayback = (token: string, deviceId: string, play = false) =>
  spotifyFetch<void>('/me/player', {
    token,
    method: 'PUT',
    body: { device_ids: [deviceId], play },
  });

// ── Library & playlists ───────────────────────────────────────────────────────

export const getMe = (token: string) =>
  spotifyFetch<{ id: string; display_name: string; email?: string }>('/me', { token });

export const getMyPlaylists = async (token: string): Promise<SpotifyPlaylist[]> => {
  const playlists: SpotifyPlaylist[] = [];
  let path: string | null = '/me/playlists';
  let query: SpotifyFetchOptions['query'] = { limit: 50 };
  let page: Paged<SpotifyPlaylist>;
  while (path) {
    page = await spotifyFetch<Paged<SpotifyPlaylist>>(path, { token, query });
    playlists.push(...page.items);
    path = page.next;
    query = undefined;
  }
  return playlists;
};

export const getPlaylistTracks = async (
  token: string,
  playlistId: string,
): Promise<SpotifyTrack[]> => {
  const tracks: SpotifyTrack[] = [];
  let path: string | null = `/playlists/${playlistId}/tracks`;
  let query: SpotifyFetchOptions['query'] = { limit: 100 };
  let page: Paged<{ track: SpotifyTrack | null }>;
  while (path) {
    page = await spotifyFetch<Paged<{ track: SpotifyTrack | null }>>(path, { token, query });
    for (const entry of page.items) {
      if (entry.track) tracks.push(entry.track);
    }
    path = page.next;
    query = undefined;
  }
  return tracks;
};

export const createPlaylist = (
  token: string,
  userId: string,
  opts: { name: string; description?: string; isPublic?: boolean },
) =>
  spotifyFetch<SpotifyPlaylist>(`/users/${userId}/playlists`, {
    token,
    method: 'POST',
    body: { name: opts.name, description: opts.description ?? '', public: opts.isPublic ?? false },
  });

export const addToPlaylist = (token: string, playlistId: string, uris: string[]) =>
  spotifyFetch<{ snapshot_id: string }>(`/playlists/${playlistId}/tracks`, {
    token,
    method: 'POST',
    body: { uris },
  });

export const removeFromPlaylist = (token: string, playlistId: string, uris: string[]) =>
  spotifyFetch<{ snapshot_id: string }>(`/playlists/${playlistId}/tracks`, {
    token,
    method: 'DELETE',
    body: { tracks: uris.map((uri) => ({ uri })) },
  });

// ── Saved tracks ──────────────────────────────────────────────────────────────

export const checkSavedTracks = (token: string, ids: string[]) =>
  spotifyFetch<boolean[]>('/me/tracks/contains', { token, query: { ids: ids.join(',') } });

// ── Search & recommendations ─────────────────────────────────────────────────

export interface SearchResults {
  tracks?: { items: SpotifyTrack[] };
  artists?: { items: SpotifyArtist[] };
  albums?: { items: { id: string; name: string; uri: string; images: SpotifyImage[] }[] };
  playlists?: { items: SpotifyPlaylist[] };
}

export const search = (token: string, query: string, types: string[]) =>
  spotifyFetch<SearchResults>('/search', {
    token,
    query: { q: query, type: types.join(','), limit: 20 },
  });

export const getTopTracks = (token: string, limit = 10) =>
  spotifyFetch<Paged<SpotifyTrack>>('/me/top/tracks', { token, query: { limit } });

export const getRecommendations = (token: string, seedTrackId: string, limit = 20) =>
  spotifyFetch<{ tracks: SpotifyTrack[] }>('/recommendations', {
    token,
    query: { seed_tracks: seedTrackId, limit },
  });

// ── Lyrics (LRCLIB — free public API, no auth) ────────────────────────────────

export interface LyricsQuery {
  track: string;
  artist: string;
  album?: string;
  durationMs?: number;
}

export function buildLyricsText(
  plainLyrics: string | null | undefined,
  syncedLyrics: string | null | undefined,
): string | null {
  if (plainLyrics) return plainLyrics;
  if (!syncedLyrics) return null;
  return syncedLyrics
    .split('\n')

    .map((line) => line.replace(/^\[\d{2}:\d{2}(?:\.\d{2,3})?\]\s*/, ''))
    .join('\n');
}

export async function fetchLyrics(query: LyricsQuery): Promise<string | null> {
  const params: Record<string, string> = {
    track_name: query.track,
    artist_name: query.artist,
  };
  if (query.album) params.album_name = query.album;
  if (query.durationMs) params.duration = String(Math.round(query.durationMs / 1000));

  const response = await fetch(`${LRCLIB_BASE}?${new URLSearchParams(params).toString()}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    logService.warn(`[Spotify] lyrics lookup failed: ${response.status}`);
    return null;
  }
  const data = (await response.json()) as {
    plainLyrics?: string | null;
    syncedLyrics?: string | null;
  };
  return buildLyricsText(data.plainLyrics, data.syncedLyrics);
}
