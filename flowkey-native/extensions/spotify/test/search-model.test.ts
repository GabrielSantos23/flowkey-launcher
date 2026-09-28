import { describe, expect, test } from 'bun:test';
import { SpotifyApiError } from '../src/api/client';
import type { Paged, SpotifyArtist, SpotifyTrack } from '../src/api/types';
import {
  ALL_TYPES,
  collectArtworkUrls,
  describeError,
  filterLibrary,
  isAborted,
  pruneResults,
  typesForFilter,
  type SearchResults,
} from '../src/search-model';

const artist = (id: string, images?: SpotifyArtist['images']): SpotifyArtist => ({
  id,
  name: `Artist ${id}`,
  ...(images ? { images } : {}),
});

const track = (id: string, albumImages?: string[]): SpotifyTrack => ({
  id,
  name: `Track ${id}`,
  uri: `spotify:track:${id}`,
  duration_ms: 200_000,
  artists: [artist('a1')],
  ...(albumImages
    ? {
        album: {
          id: `al-${id}`,
          name: `Album ${id}`,
          images: albumImages.map((url) => ({ url, width: 640, height: 640 })),
          artists: [artist('a1')],
          release_date: '2026-01-01',
          total_tracks: 1,
        },
      }
    : {}),
});

const page = <T>(items: T[]): Paged<T> => ({ items, next: null, total: items.length });

describe('typesForFilter', () => {
  test('maps each filter to its search types', () => {
    expect(typesForFilter('artists')).toEqual(['artist']);
    expect(typesForFilter('tracks')).toEqual(['track']);
    expect(typesForFilter('albums')).toEqual(['album']);
    expect(typesForFilter('playlists')).toEqual(['playlist']);
    expect(typesForFilter('shows')).toEqual(['show']);
    expect(typesForFilter('episodes')).toEqual(['episode']);
  });

  test('all searches every type', () => {
    expect(typesForFilter('all')).toEqual(ALL_TYPES);
    expect(ALL_TYPES).toContain('track');
  });
});

describe('pruneResults', () => {
  test('drops null items from every page', () => {
    const results = {
      tracks: page([track('t1'), null as unknown as SpotifyTrack, track('t2')]),
      artists: page([null as unknown as SpotifyArtist]),
    } as unknown as SearchResults;
    const pruned = pruneResults(results);
    expect(pruned.tracks?.items.map((item) => item.id)).toEqual(['t1', 't2']);
    expect(pruned.artists?.items).toHaveLength(0);
    expect(pruned.albums).toBeUndefined();
  });
});

describe('collectArtworkUrls', () => {
  test('prefers the largest image for artists and albums and the smallest for tracks', () => {
    const results: SearchResults = {
      artists: page([
        { id: 'a1', name: 'A', images: [{ url: 'artist-large', width: 640, height: 640 }] },
      ]),
      albums: page([
        {
          id: 'al1',
          name: 'L',
          images: [{ url: 'album-large', width: 640, height: 640 }],
          artists: [],
          release_date: '2026',
          total_tracks: 1,
        },
      ]),
      tracks: page([track('t1', ['track-large', 'track-small'])]),
    };
    expect(collectArtworkUrls(results)).toEqual(['artist-large', 'album-large', 'track-small']);
  });

  test('returns an empty list without results', () => {
    expect(collectArtworkUrls(null)).toEqual([]);
  });
});

describe('filterLibrary', () => {
  test('matches against names, artists, owners and publishers', () => {
    const results: SearchResults = {
      tracks: page([track('t1')]),
      playlists: page([
        {
          id: 'p1',
          name: 'Roadtrip 2026',
          images: [],
          owner: { id: 'me', display_name: 'Gabriel' },
          tracks: { total: 3 },
        },
      ]),
    };
    const byArtist = filterLibrary(results, 'ARTIST A1');
    expect(byArtist.tracks?.items).toHaveLength(1);
    expect(filterLibrary(results, 'roadtrip').playlists?.items).toHaveLength(1);
    expect(filterLibrary(results, 'gabriel').playlists?.items).toHaveLength(1);
    expect(filterLibrary(results, 'nothing-matches').tracks?.items).toHaveLength(0);
  });

  test('returns the input untouched for an empty query', () => {
    const results: SearchResults = { tracks: page([track('t1')]) };
    expect(filterLibrary(results, '  ')).toBe(results);
  });
});

describe('describeError', () => {
  test('formats api errors with their status suffix', () => {
    expect(describeError(new SpotifyApiError('PREMIUM_REQUIRED', 'Premium required', 403))).toBe(
      'Premium required (403)',
    );
  });

  test('does not double the suffix when the message already carries it', () => {
    expect(describeError(new SpotifyApiError('apiError', 'boom (403)', 403))).toBe('boom (403)');
  });

  test('falls back to a generic message for non-api errors', () => {
    expect(describeError({ message: 'plain' })).toBe('plain');
    expect(describeError(undefined)).toBe('Something went wrong');
  });
});

describe('isAborted', () => {
  test('detects the abort code', () => {
    expect(isAborted({ code: 'aborted' })).toBe(true);
    expect(isAborted(new Error('nope'))).toBe(false);
  });
});
