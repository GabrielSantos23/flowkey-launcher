import { describe, expect, test } from 'bun:test';
import type {
  Paged,
  SpotifyAlbum,
  SpotifyArtist,
  SpotifyDevice,
  SpotifyPlaylist,
  SpotifyQueue,
  SpotifyTrack,
} from '../../src/api/types';
import { filterLibrary, type SearchResults } from '../../src/search-model';
import {
  buildGridItems,
  buildSearchSections,
  deviceRows,
  ownedPlaylistRows,
  queueRows,
  trackRow,
} from '../../src/web/view-models';

const artist = (id: string, name = `Artist ${id}`): SpotifyArtist => ({ id, name });

const image = (url: string) => ({ url, width: 640, height: 640 });

const album = (id: string, overrides: Partial<SpotifyAlbum> = {}): SpotifyAlbum => ({
  id,
  name: `Album ${id}`,
  images: [image(`album-art-${id}`)],
  artists: [artist('a1', 'Kendrick Lamar')],
  release_date: '2024-11-22',
  total_tracks: 12,
  ...overrides,
});

const track = (id: string, overrides: Partial<SpotifyTrack> = {}): SpotifyTrack => ({
  id,
  name: `Track ${id}`,
  uri: `spotify:track:${id}`,
  duration_ms: 200_000,
  artists: [artist('a1', 'Kendrick Lamar')],
  ...overrides,
});

const page = <T>(items: T[]): Paged<T> => ({ items, next: null, total: items.length });

describe('trackRow', () => {
  test('carries artists as the subtitle and duration separately', () => {
    const row = trackRow(track('t1'), 'art');
    expect(row).toMatchObject({
      id: 't1',
      kind: 'track',
      title: 'Track t1',
      subtitle: 'Kendrick Lamar',
      artUrl: 'art',
      shape: 'square',
      durationMs: 200_000,
      uri: 'spotify:track:t1',
    });
  });
});

describe('buildSearchSections', () => {
  const results: SearchResults = {
    artists: page([artist('a1'), artist('a2'), artist('a3'), artist('a4')]),
    tracks: page([track('t1'), track('t2'), track('t3'), track('t4'), track('t5')]),
    albums: page([
      album('al1'),
      album('al2'),
      album('al3'),
      album('al4'),
      album('al5'),
      album('al6'),
      album('al7'),
    ]),
  };

  test('all caps each section to the launcher-sized defaults', () => {
    const sections = buildSearchSections(results, 'all');
    const sizes = Object.fromEntries(
      sections.map((section) => [section.title, section.rows.length]),
    );
    expect(sizes).toEqual({ Artists: 3, Songs: 4, Albums: 6 });
  });

  test('a specific filter keeps up to 50 rows per section', () => {
    const sections = buildSearchSections(results, 'artists');
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Artists');
    expect(sections[0].rows).toHaveLength(4);
    expect(sections[0].rows[0].shape).toBe('circle');
  });

  test('omits sections with no rows', () => {
    expect(buildSearchSections({}, 'all')).toEqual([]);
  });

  test('pins the liked-songs row in front of the tracks section when given', () => {
    const likedRow = trackRow(track('liked'), 'liked-art');
    const sections = buildSearchSections(results, 'all', {
      likedRow,
      tracksTitle: 'Liked Songs',
    });
    const tracks = sections.find((section) => section.title === 'Liked Songs');
    expect(tracks?.rows[0]?.id).toBe('liked');
  });

  test('album rows carry artist · year subtitles and the largest art', () => {
    const sections = buildSearchSections({ albums: page([album('al9')]) }, 'albums');
    const row = sections[0].rows[0];
    expect(row.subtitle).toBe('Kendrick Lamar · 2024');
    expect(row.artUrl).toBe('album-art-al9');
    expect(row.shape).toBe('square');
  });
});

describe('buildGridItems', () => {
  test('artists render as circles, albums and shows as squares', () => {
    const items = [
      ...buildGridItems({ artists: page([artist('a1')]) }, 'artists'),
      ...buildGridItems({ albums: page([album('al1')]) }, 'albums'),
      ...buildGridItems(
        {
          shows: page([
            {
              id: 's1',
              name: 'Show 1',
              images: [image('show-art')],
              publisher: 'Pub',
              total_episodes: 5,
            },
          ]),
        },
        'shows',
      ),
    ];
    expect(items.map((item) => [item.kind, item.shape])).toEqual([
      ['artist', 'circle'],
      ['album', 'square'],
      ['show', 'square'],
    ]);
  });

  test('builds nothing for non-grid filters', () => {
    expect(buildGridItems({}, 'all')).toEqual([]);
    expect(buildGridItems({ tracks: page([track('t1')]) }, 'tracks')).toEqual([]);
  });

  test('the artists filter builds only artist cells with names as titles', () => {
    const items = buildGridItems({ artists: page([artist('a1', 'Bon Iver')]) }, 'artists');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'a1',
      title: 'Bon Iver',
      shape: 'circle',
      kind: 'artist',
    });
  });

  test('album cells subtitle artist · year', () => {
    const items = buildGridItems({ albums: page([album('al1')]) }, 'albums');
    expect(items[0].subtitle).toBe('Kendrick Lamar · 2024');
  });
});

describe('filterLibrary', () => {
  const results: SearchResults = {
    tracks: page([track('t1', { name: 'Wolves' })]),
    playlists: page([
      {
        id: 'p1',
        name: 'Chill Mix',
        images: [],
        owner: { id: 'me', display_name: 'Gabriel' },
        tracks: { total: 2 },
      },
    ]),
  };

  test('matches names and owners case-insensitively', () => {
    expect(filterLibrary(results, 'wolves').tracks?.items).toHaveLength(1);
    expect(filterLibrary(results, 'gabriel').playlists?.items).toHaveLength(1);
    expect(filterLibrary(results, 'chill').playlists?.items).toHaveLength(1);
  });

  test('returns the same results for an empty query', () => {
    expect(filterLibrary(results, '')).toBe(results);
  });
});

describe('queueRows', () => {
  const episode = (id: string) => ({
    id,
    name: `Episode ${id}`,
    uri: `spotify:episode:${id}`,
    duration_ms: 600_000,
    images: [],
    show: { id: 's1', name: 'Show', images: [] },
    description: '',
  });

  test('splits the current track from upcoming tracks, skipping episodes', () => {
    const queue: SpotifyQueue = {
      currently_playing: track('t1'),
      queue: [track('t2'), episode('e1'), track('t4')],
    };
    const rows = queueRows(queue);
    expect(rows.current?.id).toBe('t1');
    expect(rows.upcoming.map((row) => row.id)).toEqual(['t2', 't4']);
  });

  test('reports no current row when nothing plays', () => {
    const queue: SpotifyQueue = { currently_playing: null, queue: [track('t2')] };
    expect(queueRows(queue).current).toBeNull();
    expect(queueRows(queue).upcoming).toHaveLength(1);
  });
});

describe('deviceRows', () => {
  test('formats type, active flag and volume', () => {
    const devices: SpotifyDevice[] = [
      {
        id: 'd1',
        is_active: true,
        is_restricted: false,
        name: 'This PC',
        type: 'Computer',
        volume_percent: 70,
      },
      {
        id: 'd2',
        is_active: false,
        is_restricted: false,
        name: 'Speakers',
        type: 'Speaker',
        volume_percent: null as unknown as number,
      },
    ];
    const rows = deviceRows(devices);
    expect(rows[0].subtitle).toBe('Computer · active · volume 70%');
    expect(rows[1].subtitle).toBe('Speaker · volume ?%');
  });
});

describe('ownedPlaylistRows', () => {
  const playlists: SpotifyPlaylist[] = [
    {
      id: 'p1',
      name: 'Mine',
      images: [image('p1-art')],
      owner: { id: 'me', display_name: 'G' },
      tracks: { total: 7 },
    },
    {
      id: 'p2',
      name: 'Followed',
      images: [],
      owner: { id: 'other', display_name: 'X' },
      tracks: { total: 1 },
    },
  ];

  test('keeps only playlists owned by the user', () => {
    const rows = ownedPlaylistRows(playlists, 'me');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'p1',
      title: 'Mine',
      subtitle: '7 tracks',
      kind: 'playlist',
    });
  });

  test('handles a missing playlist page', () => {
    expect(ownedPlaylistRows(undefined, 'me')).toEqual([]);
  });
});
