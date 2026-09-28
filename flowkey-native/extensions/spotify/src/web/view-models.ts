/**
 * Pure mappers from Spotify API payloads to the view models the web screens
 * render (list rows, grid cells, queue/device/playlist rows). No react
 * imports — these are covered by bun tests.
 */
import type {
  SpotifyAlbum,
  SpotifyArtist,
  SpotifyDevice,
  SpotifyEpisode,
  SpotifyPlaylist,
  SpotifyQueue,
  SpotifyShow,
  SpotifyTrack,
} from '../api/types';
import type { SearchResults } from '../search-model';

export type ArtShape = 'circle' | 'square';

export type WebRowKind =
  'track' | 'album' | 'artist' | 'playlist' | 'show' | 'episode' | 'device' | 'liked';

export interface WebRow {
  key: string;
  id: string;
  kind: WebRowKind;
  title: string;
  subtitle: string;
  artUrl?: string;
  shape: ArtShape;
  durationMs?: number;
  uri?: string;
}

export interface WebSection {
  id: string;
  title: string;
  rows: WebRow[];
}

export interface WebGridItem {
  key: string;
  id: string;
  kind: 'album' | 'artist' | 'show';
  title: string;
  subtitle: string;
  artUrl?: string;
  shape: ArtShape;
}

export interface SectionOptions {
  tracksTitle?: string;
  episodesTitle?: string;
  sectionLimit?: number;
  likedRow?: WebRow;
}

function artistNames(artists: { name: string }[]): string {
  return artists.map((artist) => artist.name).join(', ');
}

export function trackRow(track: SpotifyTrack, artUrl?: string): WebRow {
  return {
    key: track.id,
    id: track.id,
    kind: 'track',
    title: track.name,
    subtitle: artistNames(track.artists),
    artUrl,
    shape: 'square',
    durationMs: track.duration_ms,
    uri: track.uri,
  };
}

function artistRow(artist: SpotifyArtist, artUrl?: string): WebRow {
  return {
    key: artist.id,
    id: artist.id,
    kind: 'artist',
    title: artist.name,
    subtitle: '',
    artUrl,
    shape: 'circle',
  };
}

function albumRow(album: SpotifyAlbum, artUrl?: string): WebRow {
  return {
    key: album.id,
    id: album.id,
    kind: 'album',
    title: album.name,
    subtitle: `${artistNames(album.artists)} · ${album.release_date.slice(0, 4)}`,
    artUrl,
    shape: 'square',
  };
}

function playlistRow(playlist: SpotifyPlaylist, artUrl?: string): WebRow {
  return {
    key: playlist.id,
    id: playlist.id,
    kind: 'playlist',
    title: playlist.name,
    subtitle: playlist.owner?.display_name ?? '',
    artUrl,
    shape: 'square',
  };
}

function showRow(show: SpotifyShow, artUrl?: string): WebRow {
  return {
    key: show.id,
    id: show.id,
    kind: 'show',
    title: show.name,
    subtitle: show.publisher,
    artUrl,
    shape: 'square',
  };
}

function episodeRow(episode: SpotifyEpisode, artUrl?: string): WebRow {
  return {
    key: episode.id,
    id: episode.id,
    kind: 'episode',
    title: episode.name,
    subtitle: episode.show?.name ?? '',
    artUrl,
    shape: 'square',
    durationMs: episode.duration_ms,
    uri: episode.uri,
  };
}

/** Section caps for the combined "All" view, mirroring the launcher's density. */
const ALL_SECTION_LIMITS: Record<string, number> = {
  artists: 3,
  tracks: 4,
  albums: 6,
  playlists: 6,
  shows: 3,
  episodes: 3,
};

const FILTER_SECTION_LIMIT = 50;

export function buildSearchSections(
  results: SearchResults | null,
  filter: string,
  options: SectionOptions = {},
): WebSection[] {
  const limit = (key: string): number =>
    filter === 'all'
      ? (options.sectionLimit ?? ALL_SECTION_LIMITS[key] ?? 50)
      : FILTER_SECTION_LIMIT;
  const sections: WebSection[] = [];
  const add = (id: string, title: string, rows: WebRow[]): void => {
    if (rows.length > 0) sections.push({ id, title, rows });
  };

  if (filter === 'all' || filter === 'artists') {
    add(
      'artists',
      'Artists',
      (results?.artists?.items ?? [])
        .slice(0, limit('artists'))
        .map((artist) => artistRow(artist, artist.images?.[0]?.url)),
    );
  }
  if (filter === 'all' || filter === 'tracks') {
    const rows = (results?.tracks?.items ?? [])
      .slice(0, limit('tracks'))
      .map((track) => trackRow(track, track.album?.images?.at(-1)?.url));
    if (options.likedRow && (filter === 'all' || filter === 'tracks')) {
      rows.unshift(options.likedRow);
    }
    add('tracks', options.tracksTitle ?? 'Songs', rows);
  }
  if (filter === 'all' || filter === 'albums') {
    add(
      'albums',
      'Albums',
      (results?.albums?.items ?? [])
        .slice(0, limit('albums'))
        .map((album) => albumRow(album, album.images?.[0]?.url)),
    );
  }
  if (filter === 'all' || filter === 'playlists') {
    add(
      'playlists',
      'Playlists',
      (results?.playlists?.items ?? [])
        .slice(0, limit('playlists'))
        .map((playlist) => playlistRow(playlist, playlist.images?.at(-1)?.url)),
    );
  }
  if (filter === 'all' || filter === 'shows') {
    add(
      'shows',
      'Podcasts & Shows',
      (results?.shows?.items ?? [])
        .slice(0, limit('shows'))
        .map((show) => showRow(show, show.images?.[0]?.url)),
    );
  }
  if (filter === 'all' || filter === 'episodes') {
    add(
      'episodes',
      options.episodesTitle ?? 'Episodes',
      (results?.episodes?.items ?? [])
        .slice(0, limit('episodes'))
        .map((episode) =>
          episodeRow(episode, episode.show?.images?.at(-1)?.url ?? episode.images?.at(-1)?.url),
        ),
    );
  }
  return sections;
}

export function buildGridItems(results: SearchResults | null, filter: string): WebGridItem[] {
  if (filter === 'artists') {
    return (results?.artists?.items ?? []).map((artist) => ({
      key: artist.id,
      id: artist.id,
      kind: 'artist',
      title: artist.name,
      subtitle: '',
      artUrl: artist.images?.[0]?.url,
      shape: 'circle',
    }));
  }
  if (filter === 'albums') {
    return (results?.albums?.items ?? []).map((album) => ({
      key: album.id,
      id: album.id,
      kind: 'album',
      title: album.name,
      subtitle: `${artistNames(album.artists)} · ${album.release_date.slice(0, 4)}`,
      artUrl: album.images?.[0]?.url,
      shape: 'square',
    }));
  }
  if (filter === 'shows') {
    return (results?.shows?.items ?? []).map((show) => ({
      key: show.id,
      id: show.id,
      kind: 'show',
      title: show.name,
      subtitle: show.publisher,
      artUrl: show.images?.[0]?.url,
      shape: 'square',
    }));
  }
  return [];
}

function isTrackItem(item: SpotifyTrack | SpotifyEpisode | null | undefined): item is SpotifyTrack {
  return item !== null && item !== undefined && 'artists' in item;
}

export function queueRows(queue: SpotifyQueue): { current: WebRow | null; upcoming: WebRow[] } {
  const current = isTrackItem(queue.currently_playing) ? trackRow(queue.currently_playing) : null;
  const upcoming = queue.queue.filter(isTrackItem).map((track) => trackRow(track));
  return { current, upcoming };
}

export function deviceRows(devices: SpotifyDevice[]): WebRow[] {
  return devices.map((device) => ({
    key: device.id,
    id: device.id,
    kind: 'device',
    title: device.name,
    subtitle: `${device.type}${device.is_active ? ' · active' : ''} · volume ${device.volume_percent ?? '?'}%`,
    shape: 'square',
  }));
}

export function ownedPlaylistRows(
  playlists: SpotifyPlaylist[] | undefined,
  ownerId: string,
): WebRow[] {
  return (playlists ?? [])
    .filter((playlist) => playlist && playlist.owner?.id === ownerId)
    .map((playlist) => ({
      ...playlistRow(playlist, playlist.images?.at(-1)?.url),
      subtitle: `${playlist.tracks?.total ?? 0} tracks`,
    }));
}
