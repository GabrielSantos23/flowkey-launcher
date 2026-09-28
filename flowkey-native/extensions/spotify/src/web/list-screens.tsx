import { createElement, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SpotifyClient } from '../api/client';
import type { SpotifyAlbum, SpotifyArtist, SpotifyPlaylist, SpotifyTrack } from '../api/types';
import { externalUrl, formatMs, trackUrl } from '../format';
import {
  collectArtworkUrls,
  describeError,
  filterLibrary,
  isAborted,
  pruneResults,
  startRadio,
  typesForFilter,
  type SearchResults,
} from '../search-model';
import {
  loadAlbumTracks,
  loadArtistAlbums,
  loadArtistTopTracks,
  loadLibrary,
  loadLikedTracks,
  type LibraryData,
} from '../store';
import { Art, EmptyView, useArtwork } from './chrome';
import type { ScreenContext, SpotifyAction, WebRowRef } from './context';
import { Icon } from './icons';
import {
  buildGridItems,
  buildSearchSections,
  deviceRows,
  ownedPlaylistRows,
  queueRows,
  trackRow,
  type WebRow,
  type WebSection,
} from './view-models';

/** Keeps the highlighted row/cell in view while arrow-keying through lists. */
function useScrollSelectionIntoView(selectedKey: string | null): void {
  useEffect(() => {
    if (!selectedKey) return;
    document
      .querySelector('.sp-row-selected, .sp-cell-selected')
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedKey]);
}

/** Registers the active screen's controller; re-registered on every render. */
export function useController(
  ctx: ScreenContext,
  controller: Parameters<ScreenContext['registerController']>[0],
): void {
  useEffect(() => {
    ctx.registerController(controller);
    return () => ctx.registerController(null);
  });
}

/** Runs a capability action with HUD feedback and fail-safe error reporting. */
export async function runAction(
  ctx: ScreenContext,
  title: string | null,
  body: () => Promise<void>,
): Promise<void> {
  try {
    await body();
    if (title) ctx.hud(title);
  } catch (caught) {
    if (isAborted(caught)) return;
    if ((caught as { code?: string })?.code === 'authRequired') {
      ctx.onAuthRequired();
      return;
    }
    ctx.hud(describeError(caught));
  }
}

const copyAction = (
  ctx: ScreenContext,
  id: string,
  title: string,
  url: string,
  label: string,
): SpotifyAction => ({
  id,
  title,
  icon: 'link',
  run: () => runAction(ctx, label, () => ctx.client.copyText(url)),
});

/** Action list (palette + primary) for one row, mirroring the tree actions. */
export function actionsForRow(
  ctx: ScreenContext,
  row: WebRow,
  meId: string | null,
): SpotifyAction[] {
  const play = (body: () => Promise<void>, label: string): SpotifyAction => ({
    id: 'play',
    title: 'Play',
    icon: 'play',
    run: () => runAction(ctx, label, body),
  });
  switch (row.kind) {
    case 'track': {
      const track = { id: row.id, name: row.title, uri: row.uri ?? `spotify:track:${row.id}` };
      return [
        play(() => ctx.client.play({ uris: [track.uri] }), `Playing ${row.title}`),
        {
          id: 'like',
          title: 'Like / Unlike',
          icon: 'heart',
          run: () =>
            runAction(ctx, `Updated ${row.title}`, async () => {
              const liked = await ctx.client.containsSavedTracks([row.id]);
              if (liked[0]) {
                await ctx.client.removeFromSavedTracks([row.id]);
              } else {
                await ctx.client.addToSavedTracks([row.id]);
              }
            }),
        },
        {
          id: 'queue',
          title: 'Add to Queue',
          icon: 'list-music',
          run: () =>
            runAction(ctx, `Added ${row.title} to queue`, () => ctx.client.addToQueue(track.uri)),
        },
        {
          id: 'radio',
          title: 'Start Radio',
          icon: 'radio',
          run: () =>
            runAction(ctx, `Radio started from ${row.title}`, async () => {
              await startRadio(ctx.client, { tracks: [row.id] });
            }),
        },
        copyAction(ctx, 'copy', 'Copy Track Link', trackUrl(track), 'Copied track link'),
      ];
    }
    case 'artist':
      return [
        play(
          () => ctx.client.play({ context_uri: `spotify:artist:${row.id}` }),
          `Playing ${row.title}`,
        ),
        {
          id: 'radio',
          title: 'Start Radio',
          icon: 'radio',
          run: () =>
            runAction(ctx, `Radio started from ${row.title}`, async () => {
              await startRadio(ctx.client, { artists: [row.id] });
            }),
        },
        {
          id: 'songs',
          title: 'Show Popular Songs',
          icon: 'list-music',
          run: () => ctx.navigate({ kind: 'artist-top', artist: { id: row.id, name: row.title } }),
        },
        {
          id: 'albums',
          title: 'Show Albums',
          icon: 'disc',
          run: () =>
            ctx.navigate({ kind: 'artist-albums', artist: { id: row.id, name: row.title } }),
        },
        copyAction(
          ctx,
          'copy',
          'Copy Artist Link',
          externalUrl('artist', row.id),
          'Copied artist link',
        ),
      ];
    case 'album':
      return [
        play(
          () => ctx.client.play({ context_uri: `spotify:album:${row.id}` }),
          `Playing ${row.title}`,
        ),
        {
          id: 'library',
          title: 'Add / Remove from Library',
          icon: 'plus',
          run: () =>
            runAction(ctx, `Updated ${row.title}`, async () => {
              const saved = await ctx.client.containsSavedAlbums([row.id]);
              if (saved[0]) {
                await ctx.client.removeFromSavedAlbums([row.id]);
              } else {
                await ctx.client.addToSavedAlbums([row.id]);
              }
            }),
        },
        copyAction(
          ctx,
          'copy',
          'Copy Album Link',
          externalUrl('album', row.id),
          'Copied album link',
        ),
        {
          id: 'songs',
          title: 'Go to Songs',
          icon: 'list-music',
          run: () =>
            ctx.navigate({
              kind: 'album-tracks',
              album: {
                id: row.id,
                name: row.title,
                images: [],
                artists: [],
                release_date: '',
                total_tracks: 0,
              },
            }),
        },
      ];
    case 'playlist':
      return [
        play(
          () => ctx.client.play({ context_uri: `spotify:playlist:${row.id}` }),
          `Playing ${row.title}`,
        ),
        {
          id: 'tracks',
          title: 'Go to Tracks',
          icon: 'list-music',
          run: () =>
            ctx.navigate({
              kind: 'playlist-tracks',
              playlist: {
                id: row.id,
                name: row.title,
                images: [],
                owner: { id: '', display_name: '' },
                tracks: { total: 0 },
              },
            }),
        },
        copyAction(
          ctx,
          'copy',
          'Copy Playlist Link',
          externalUrl('playlist', row.id),
          'Copied playlist link',
        ),
      ];
    case 'show':
      return [
        play(
          () => ctx.client.play({ context_uri: `spotify:show:${row.id}` }),
          `Playing ${row.title}`,
        ),
        copyAction(ctx, 'copy', 'Copy Show Link', externalUrl('show', row.id), 'Copied show link'),
      ];
    case 'episode':
      return [
        play(
          () => ctx.client.play({ uris: [row.uri ?? `spotify:episode:${row.id}`] }),
          `Playing ${row.title}`,
        ),
        {
          id: 'queue',
          title: 'Add to Queue',
          icon: 'list-music',
          run: () =>
            runAction(ctx, `Added ${row.title} to queue`, () =>
              ctx.client.addToQueue(row.uri ?? `spotify:episode:${row.id}`),
            ),
        },
      ];
    case 'liked':
      return [
        play(
          () => ctx.client.play({ context_uri: `spotify:user:${row.id || meId}:collection` }),
          `Playing ${row.title}`,
        ),
        {
          id: 'songs',
          title: 'Go to Songs',
          icon: 'list-music',
          run: () => ctx.navigate({ kind: 'liked-songs' }),
        },
      ];
    case 'device':
      return [
        {
          id: 'transfer',
          title: 'Transfer Playback Here',
          icon: 'speaker',
          run: () =>
            runAction(ctx, `Playing on ${row.title}`, () =>
              ctx.client.transferPlayback(row.id, true),
            ),
        },
      ];
    default:
      return [];
  }
}

export function primaryActionFor(
  ctx: ScreenContext,
  row: WebRow,
  meId: string | null,
): SpotifyAction {
  const actions = actionsForRow(ctx, row, meId);
  return actions[0] ?? { id: 'none', title: 'No action', icon: 'minus', run: () => {} };
}

interface ListProps {
  ctx: ScreenContext;
  sections: WebSection[];
  meId: string | null;
  emptyTitle: string;
  emptyDescription?: string;
}

function rowDuration(row: WebRow): string | null {
  return row.durationMs !== undefined ? formatMs(row.durationMs) : null;
}

/** Sectioned row list with selection, hover and click-to-run-primary. */
export function RowList(props: ListProps): ReactNode {
  const { ctx } = props;
  const rows = useMemo(() => props.sections.flatMap((section) => section.rows), [props.sections]);
  useEffect(() => {
    if (rows.length > 0 && (!ctx.selectedKey || !rows.some((row) => row.key === ctx.selectedKey))) {
      ctx.select(rows[0].key);
    }
  }, [rows, ctx]);
  useScrollSelectionIntoView(ctx.selectedKey);

  // register the selected row's primary action + actions so the shell chrome
  // (footer hints, ctrl+k palette, enter key) mirrors the tree-view behavior
  const selected = rows.find((row) => row.key === ctx.selectedKey) ?? rows[0] ?? null;
  const primary = selected ? primaryActionFor(ctx, selected, props.meId) : null;
  useController(ctx, {
    title: 'rows',
    primaryTitle: primary?.title ?? '',
    primary: () => primary?.run(),
    actions: selected ? actionsForRow(ctx, selected, props.meId) : [],
    rows,
    selectedKey: ctx.selectedKey,
    select: ctx.select,
  });

  return createElement(
    'div',
    null,
    props.sections.map((section) =>
      createElement(
        'div',
        { key: section.id },
        createElement('div', { className: 'sp-section-title' }, section.title),
        section.rows.map((row) => {
          const duration = rowDuration(row);
          const selected = row.key === ctx.selectedKey;
          return createElement(
            'div',
            {
              key: row.key,
              className: selected ? 'sp-row sp-row-selected' : 'sp-row',
              onMouseEnter: () => ctx.select(row.key),
              onClick: () => ctx.select(row.key),
              onDoubleClick: () => primaryActionFor(ctx, row, props.meId).run(),
            },
            createElement(Art, { src: row.artUrl, circle: row.shape === 'circle' }),
            createElement(
              'div',
              { className: 'sp-row-main' },
              createElement('span', { className: 'sp-row-title' }, row.title),
              row.subtitle
                ? createElement('span', { className: 'sp-row-subtitle' }, row.subtitle)
                : null,
            ),
            duration ? createElement('span', { className: 'sp-row-duration' }, duration) : null,
          );
        }),
      ),
    ),
  );
}

export function registerRowController(
  ctx: ScreenContext,
  title: string,
  rows: WebRow[],
  meId: string | null,
): void {
  useController(ctx, {
    title,
    primaryTitle: rows.length > 0 && ctx.selectedKey ? 'Play' : 'Play',
    primary: () => {
      const selected = rows.find((row) => row.key === ctx.selectedKey) ?? rows[0];
      if (selected) {
        primaryActionFor(ctx, selected, meId).run();
      }
    },
    actions:
      rows.length > 0
        ? actionsForRow(ctx, rows.find((row) => row.key === ctx.selectedKey) ?? rows[0], meId)
        : [],
    rows: rows as WebRowRef[],
    selectedKey: ctx.selectedKey,
    select: ctx.select,
  });
}

function matchesQuery(row: WebRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return row.title.toLowerCase().includes(needle) || row.subtitle.toLowerCase().includes(needle);
}

export function SearchScreen(props: {
  ctx: ScreenContext;
  query: string;
  filter: string;
}): ReactNode {
  const { ctx, query, filter } = props;
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (query.trim().length === 0) {
      setResults(null);
      setLoading(false);
      setError('');
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      ctx.client
        .search(query.trim(), typesForFilter(filter), 50, controller.signal)
        .then((response) => {
          setResults(pruneResults(response as SearchResults));
          setLoading(false);
        })
        .catch((caught) => {
          if (isAborted(caught)) return;
          if ((caught as { code?: string })?.code === 'authRequired') {
            ctx.onAuthRequired();
            return;
          }
          setError(describeError(caught));
          setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.client, query, filter]);

  const artwork = useArtwork(ctx.client, collectArtworkUrls(results));

  const gridFilter = ['artists', 'albums', 'shows'].includes(filter);
  if (gridFilter) {
    const items = buildGridItems(results, filter).map((item) => ({
      ...item,
      artUrl: item.artUrl ? artwork[item.artUrl] : undefined,
    }));
    return createElement(GridScreen, {
      ctx,
      title: filter === 'artists' ? 'Artists' : filter === 'albums' ? 'Albums' : 'Podcasts & Shows',
      items,
      meId: null,
      emptyTitle: loading ? 'Searching…' : 'No results',
      emptyDescription: loading ? undefined : `Nothing found for "${query.trim()}"`,
      error,
    });
  }

  const sections = buildSearchSections(results, filter).map((section) => ({
    ...section,
    rows: section.rows.map((row) => ({
      ...row,
      artUrl: row.artUrl ? artwork[row.artUrl] : undefined,
    })),
  }));
  if (error) {
    return createElement(
      'div',
      null,
      createElement('div', { className: 'sp-notice sp-notice-error' }, error),
    );
  }
  if (loading && sections.length === 0) {
    return createElement(EmptyView, { title: 'Searching…', icon: 'search' });
  }
  if (query.trim().length === 0 && sections.length === 0) {
    return createElement(EmptyView, { title: 'What do you want to listen to?', icon: 'music' });
  }
  if (sections.length === 0) {
    return createElement(EmptyView, {
      title: 'No results',
      description: `Nothing found for "${query.trim()}"`,
      icon: 'search',
    });
  }
  return createElement(RowList, { ctx, sections, meId: null, emptyTitle: 'No results' });
}

export function LibraryScreen(props: {
  ctx: ScreenContext;
  query: string;
  filter: string;
}): ReactNode {
  const { ctx, query, filter } = props;
  const [data, setData] = useState<LibraryData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    loadLibrary(ctx.client)
      .then((library) => {
        if (alive) setData(library);
      })
      .catch((caught) => {
        if (!alive) return;
        if ((caught as { code?: string })?.code === 'authRequired') {
          ctx.onAuthRequired();
          return;
        }
        setError(describeError(caught));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.client]);

  const artwork = useArtwork(ctx.client, collectArtworkUrls(data?.results ?? null));
  if (error) {
    return createElement(
      'div',
      null,
      createElement('div', { className: 'sp-notice sp-notice-error' }, error),
    );
  }
  if (!data) {
    return createElement(EmptyView, { title: 'Loading your library…', icon: 'disc' });
  }
  const results = filterLibrary(data.results, query);
  const likedRow: WebRow = {
    key: 'liked-songs',
    id: data.me.id,
    kind: 'liked',
    title: 'Liked Songs',
    subtitle: `${data.likedTotal} songs`,
    shape: 'square',
  };
  const gridFilter = ['artists', 'albums', 'shows'].includes(filter);
  if (gridFilter) {
    const items = buildGridItems(results, filter).map((item) => ({
      ...item,
      artUrl: item.artUrl ? artwork[item.artUrl] : undefined,
    }));
    return createElement(GridScreen, {
      ctx,
      title: filter === 'artists' ? 'Artists' : filter === 'albums' ? 'Albums' : 'Podcasts & Shows',
      items,
      meId: data.me.id,
      emptyTitle: 'Nothing here',
      emptyDescription:
        query.trim().length > 0
          ? `Nothing in your library matches "${query.trim()}"`
          : 'Your library is empty',
      error: '',
    });
  }
  const sections = buildSearchSections(results, filter, {
    tracksTitle: 'Liked Songs',
    episodesTitle: 'Saved Episodes',
    sectionLimit: 6,
    likedRow,
  }).map((section) => ({
    ...section,
    rows: section.rows.map((row) => ({
      ...row,
      artUrl: row.artUrl ? artwork[row.artUrl] : undefined,
    })),
  }));
  if (sections.length === 0) {
    return createElement(EmptyView, {
      title: 'Nothing here',
      description:
        query.trim().length > 0
          ? `Nothing in your library matches "${query.trim()}"`
          : 'Your library is empty',
      icon: 'disc',
    });
  }
  return createElement(RowList, { ctx, sections, meId: data.me.id, emptyTitle: 'Nothing here' });
}

/** Shared grid renderer for artists/albums/shows filters and drill-downs. */
export function GridScreen(props: {
  ctx: ScreenContext;
  title: string;
  items: {
    key: string;
    id: string;
    kind: 'album' | 'artist' | 'show';
    title: string;
    subtitle: string;
    artUrl?: string;
    shape: 'circle' | 'square';
  }[];
  meId: string | null;
  emptyTitle: string;
  emptyDescription?: string;
  error: string;
}): ReactNode {
  const { ctx, items } = props;
  useEffect(() => {
    if (
      items.length > 0 &&
      (!ctx.selectedKey || !items.some((item) => item.key === ctx.selectedKey))
    ) {
      ctx.select(items[0].key);
    }
  }, [items, ctx]);
  useScrollSelectionIntoView(ctx.selectedKey);
  useController(ctx, {
    title: props.title,
    primaryTitle: 'Play',
    primary: () => {
      const selected = items.find((item) => item.key === ctx.selectedKey) ?? items[0];
      if (selected) {
        primaryActionFor(
          ctx,
          {
            key: selected.key,
            id: selected.id,
            kind: selected.kind,
            title: selected.title,
            subtitle: selected.subtitle,
            shape: selected.shape,
          },
          props.meId,
        ).run();
      }
    },
    actions:
      items.length > 0
        ? actionsForRow(
            ctx,
            (() => {
              const selected = items.find((item) => item.key === ctx.selectedKey) ?? items[0];
              return {
                key: selected.key,
                id: selected.id,
                kind: selected.kind,
                title: selected.title,
                subtitle: selected.subtitle,
                shape: selected.shape,
              };
            })(),
            props.meId,
          )
        : [],
    rows: items,
    selectedKey: ctx.selectedKey,
    select: ctx.select,
  });
  if (props.error) {
    return createElement(
      'div',
      null,
      createElement('div', { className: 'sp-notice sp-notice-error' }, props.error),
    );
  }
  if (items.length === 0) {
    return createElement(EmptyView, {
      title: props.emptyTitle,
      description: props.emptyDescription,
      icon: props.title === 'Artists' ? 'user' : 'disc',
    });
  }
  return createElement(
    'div',
    { className: 'sp-grid' },
    items.map((item) =>
      createElement(
        'div',
        {
          key: item.key,
          className: item.key === ctx.selectedKey ? 'sp-cell sp-cell-selected' : 'sp-cell',
          onMouseEnter: () => ctx.select(item.key),
          onClick: () => ctx.select(item.key),
          onDoubleClick: () =>
            primaryActionFor(
              ctx,
              {
                key: item.key,
                id: item.id,
                kind: item.kind,
                title: item.title,
                subtitle: item.subtitle,
                shape: item.shape,
              },
              props.meId,
            ).run(),
        },
        createElement(Art, { src: item.artUrl, circle: item.shape === 'circle' }),
        createElement('span', { className: 'sp-cell-title' }, item.title),
        item.subtitle
          ? createElement('span', { className: 'sp-cell-subtitle' }, item.subtitle)
          : null,
      ),
    ),
  );
}

/** Track-list screens fed by the store loaders (album, artist top, liked, playlist). */
export function TrackListScreen(props: {
  ctx: ScreenContext;
  title: string;
  subtitle?: string;
  tracks: SpotifyTrack[] | null;
  artUrl?: string;
  error: string;
  loadingTitle: string;
  query: string;
}): ReactNode {
  const { ctx } = props;
  const rows =
    props.tracks === null
      ? []
      : props.tracks
          .map((track) => trackRow(track, props.artUrl))
          .filter((row) => matchesQuery(row, props.query));
  // registered unconditionally so hook order stays stable across load/error
  registerRowController(ctx, props.title, rows, null);
  if (props.error) {
    return createElement(
      'div',
      null,
      createElement('div', { className: 'sp-notice sp-notice-error' }, props.error),
    );
  }
  if (props.tracks === null) {
    return createElement(EmptyView, { title: props.loadingTitle, icon: 'list-music' });
  }
  if (rows.length === 0) {
    return createElement(EmptyView, { title: 'No matching songs', icon: 'music' });
  }
  const sections: WebSection[] = [{ id: 'tracks', title: props.subtitle ?? 'Songs', rows }];
  return createElement(RowList, { ctx, sections, meId: null, emptyTitle: 'No matching songs' });
}

export function AlbumTracksScreen(props: {
  ctx: ScreenContext;
  album: SpotifyAlbum;
  query: string;
}): ReactNode {
  const [tracks, setTracks] = useState<SpotifyTrack[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    loadAlbumTracks(props.ctx.client, props.album.id)
      .then((loaded) => {
        if (alive) setTracks(loaded);
      })
      .catch((caught) => {
        if (alive) setError(describeError(caught));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.ctx.client, props.album.id]);
  return createElement(TrackListScreen, {
    ctx: props.ctx,
    title: props.album.name,
    subtitle: 'Album',
    tracks,
    error,
    loadingTitle: 'Loading songs…',
    query: props.query,
  });
}

export function ArtistTopScreen(props: {
  ctx: ScreenContext;
  artist: SpotifyArtist;
  query: string;
}): ReactNode {
  const [tracks, setTracks] = useState<SpotifyTrack[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    loadArtistTopTracks(props.ctx.client, props.artist.id)
      .then((loaded) => {
        if (alive) setTracks(loaded);
      })
      .catch((caught) => {
        if (alive) setError(describeError(caught));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.ctx.client, props.artist.id]);
  return createElement(TrackListScreen, {
    ctx: props.ctx,
    title: props.artist.name,
    subtitle: 'Popular Songs',
    tracks,
    error,
    loadingTitle: 'Loading popular songs…',
    query: props.query,
  });
}

export function LikedSongsScreen(props: { ctx: ScreenContext; query: string }): ReactNode {
  const [tracks, setTracks] = useState<SpotifyTrack[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    loadLikedTracks(props.ctx.client)
      .then((loaded) => {
        if (alive) setTracks(loaded);
      })
      .catch((caught) => {
        if (alive) setError(describeError(caught));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.ctx.client]);
  return createElement(TrackListScreen, {
    ctx: props.ctx,
    title: 'Liked Songs',
    subtitle: 'Liked Songs',
    tracks,
    error,
    loadingTitle: 'Loading liked songs…',
    query: props.query,
  });
}

export function ArtistAlbumsScreen(props: {
  ctx: ScreenContext;
  artist: SpotifyArtist;
  query: string;
}): ReactNode {
  const [albums, setAlbums] = useState<SpotifyAlbum[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    loadArtistAlbums(props.ctx.client, props.artist.id)
      .then((loaded) => {
        if (alive) setAlbums(loaded);
      })
      .catch((caught) => {
        if (alive) setError(describeError(caught));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.ctx.client, props.artist.id]);
  const artwork = useArtwork(
    props.ctx.client,
    albums?.map((album) => album.images?.[0]?.url) ?? [],
  );
  if (error) {
    return createElement(
      'div',
      null,
      createElement('div', { className: 'sp-notice sp-notice-error' }, error),
    );
  }
  if (!albums) {
    return createElement(EmptyView, { title: 'Loading albums…', icon: 'disc' });
  }
  const items = buildGridItems(
    { albums: { items: albums, next: null, total: albums.length } },
    'albums',
  ).map((item) => ({ ...item, artUrl: item.artUrl ? artwork[item.artUrl] : undefined }));
  return createElement(GridScreen, {
    ctx: props.ctx,
    title: props.artist.name,
    items,
    meId: null,
    emptyTitle: 'No matching albums',
    error: '',
  });
}

export function PlaylistTracksScreen(props: {
  ctx: ScreenContext;
  playlist: SpotifyPlaylist;
  query: string;
}): ReactNode {
  const [tracks, setTracks] = useState<SpotifyTrack[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    props.ctx.client
      .playlistTracks(props.playlist.id)
      .then((loaded) => {
        if (alive) setTracks(loaded);
      })
      .catch((caught) => {
        if (alive && !isAborted(caught)) setError(describeError(caught));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.ctx.client, props.playlist.id]);
  return createElement(TrackListScreen, {
    ctx: props.ctx,
    title: props.playlist.name,
    subtitle: 'Playlist',
    tracks,
    error,
    loadingTitle: 'Loading playlist…',
    query: props.query,
  });
}

export function QueueScreen(props: { ctx: ScreenContext; query: string }): ReactNode {
  const { ctx } = props;
  const [queue, setQueue] = useState<Awaited<ReturnType<SpotifyClient['queue']>> | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    ctx.client
      .queue()
      .then((result) => {
        if (alive) setQueue(result);
      })
      .catch((caught) => {
        if (alive && !isAborted(caught)) setError(describeError(caught));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.client, version]);

  useEffect(() => {
    if (error) return;
    ctx.registerController({
      title: 'Queue',
      primaryTitle: 'Play',
      primary: () => {
        const rows = queue ? [...queueRows(queue).upcoming] : [];
        const selected = rows.find((row) => row.key === ctx.selectedKey) ?? rows[0];
        if (selected) {
          void runAction(ctx, `Playing ${selected.title}`, () =>
            ctx.client.play({ uris: [selected.uri!] }),
          );
        }
      },
      actions: [
        {
          id: 'refresh',
          title: 'Refresh Queue',
          icon: 'repeat',
          run: () => setVersion((v) => v + 1),
        },
      ],
      rows: queue ? queueRows(queue).upcoming : [],
      selectedKey: ctx.selectedKey,
      select: ctx.select,
    });
  });

  if (error) {
    return createElement(
      'div',
      null,
      createElement('div', { className: 'sp-notice sp-notice-error' }, error),
    );
  }
  if (!queue) {
    return createElement(EmptyView, { title: 'Loading queue…', icon: 'list-music' });
  }
  const { current, upcoming } = queueRows(queue);
  const visible = upcoming.filter((row) => matchesQuery(row, props.query));
  const sections: WebSection[] = [];
  if (current) {
    sections.push({ id: 'current', title: 'Now Playing', rows: [current] });
  }
  sections.push({ id: 'next', title: 'Next Up', rows: visible });
  if (!current && visible.length === 0) {
    return createElement(EmptyView, { title: 'Queue is empty', icon: 'list-music' });
  }
  return createElement(RowList, { ctx, sections, meId: null, emptyTitle: 'Queue is empty' });
}

export function DevicesScreen(props: { ctx: ScreenContext; query: string }): ReactNode {
  const { ctx } = props;
  const [devices, setDevices] = useState<
    Awaited<ReturnType<SpotifyClient['devices']>>['devices'] | null
  >(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    ctx.client
      .devices()
      .then((result) => {
        if (alive) setDevices(result.devices.filter(Boolean));
      })
      .catch((caught) => {
        if (alive && !isAborted(caught)) setError(describeError(caught));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.client, version]);

  const rows = devices ? deviceRows(devices) : [];
  useEffect(() => {
    if (rows.length === 0) return;
    if (!ctx.selectedKey || !rows.some((row) => row.key === ctx.selectedKey)) {
      ctx.select(rows[0].key);
    }
  }, [rows, ctx]);
  useController(ctx, {
    title: 'Devices',
    primaryTitle: 'Transfer',
    primary: () => {
      const selected = rows.find((row) => row.key === ctx.selectedKey) ?? rows[0];
      if (selected) {
        void runAction(ctx, `Playing on ${selected.title}`, () =>
          ctx.client.transferPlayback(selected.id, true),
        );
      }
    },
    actions: [
      ...(rows.length > 0
        ? actionsForRow(ctx, rows.find((row) => row.key === ctx.selectedKey) ?? rows[0], null)
        : []),
      {
        id: 'refresh',
        title: 'Refresh Devices',
        icon: 'repeat',
        run: () => setVersion((v) => v + 1),
      },
    ],
    rows,
    selectedKey: ctx.selectedKey,
    select: ctx.select,
  });

  if (error) {
    return createElement(
      'div',
      null,
      createElement('div', { className: 'sp-notice sp-notice-error' }, error),
    );
  }
  if (!devices) {
    return createElement(EmptyView, { title: 'Loading devices…', icon: 'speaker' });
  }
  if (rows.length === 0) {
    return createElement(EmptyView, { title: 'No Spotify devices found', icon: 'speaker' });
  }
  const visible = rows.filter((row) => matchesQuery(row, props.query));
  return createElement(RowList, {
    ctx,
    sections: [{ id: 'devices', title: 'Devices', rows: visible }],
    meId: null,
    emptyTitle: 'No Spotify devices found',
  });
}

/** Add/remove the playing track from one of the user's own playlists. */
export function PlaylistPickerScreen(props: {
  ctx: ScreenContext;
  mode: 'add' | 'remove';
  query: string;
}): ReactNode {
  const { ctx } = props;
  const [track, setTrack] = useState<SpotifyTrack | null>(null);
  const [blocked, setBlocked] = useState('');
  const [library, setLibrary] = useState<LibraryData | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    ctx.client
      .playbackState()
      .then((playback) => {
        if (!alive) return;
        if (!playback || !playback.device) {
          setBlocked('No active Spotify device');
          return;
        }
        const item = playback.item;
        if (!item || !('artists' in item)) {
          setBlocked('Nothing playing');
          return;
        }
        setTrack(item);
      })
      .catch((caught) => {
        if (!alive) return;
        if ((caught as { code?: string })?.code === 'authRequired') {
          ctx.onAuthRequired();
          return;
        }
        setBlocked(describeError(caught));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.client]);

  useEffect(() => {
    let alive = true;
    loadLibrary(ctx.client)
      .then((data) => {
        if (alive) setLibrary(data);
      })
      .catch((caught) => {
        if (alive && !isAborted(caught)) setError(describeError(caught));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.client]);

  if (blocked) {
    return createElement(EmptyView, { title: blocked, icon: 'music' });
  }
  if (error) {
    return createElement(
      'div',
      null,
      createElement('div', { className: 'sp-notice sp-notice-error' }, error),
    );
  }
  if (!track || !library) {
    return createElement(EmptyView, { title: 'Loading playlists…', icon: 'disc' });
  }
  const rows = ownedPlaylistRows(library.results.playlists?.items, library.me.id).filter((row) =>
    matchesQuery(row, props.query),
  );
  const runRow = (row: WebRow): void => {
    void runAction(
      ctx,
      props.mode === 'add' ? `Added to ${row.title}` : `Removed from ${row.title}`,
      async () => {
        if (props.mode === 'add') {
          await ctx.client.addToPlaylist(row.id, [track.uri]);
        } else {
          await ctx.client.removeFromPlaylist(row.id, track.uri);
        }
        setVersion((v) => v + 1);
      },
    );
  };
  useController(ctx, {
    title: props.mode === 'add' ? 'Add to Playlist' : 'Remove from Playlist',
    primaryTitle: props.mode === 'add' ? 'Add Track' : 'Remove Track',
    primary: () => {
      const selected = rows.find((row) => row.key === ctx.selectedKey) ?? rows[0];
      if (selected) runRow(selected);
    },
    actions:
      rows.length > 0
        ? [
            {
              id: props.mode === 'add' ? 'add' : 'remove',
              title: props.mode === 'add' ? 'Add Track' : 'Remove Track',
              icon: props.mode === 'add' ? 'plus' : 'minus',
              run: () => {
                const selected = rows.find((row) => row.key === ctx.selectedKey) ?? rows[0];
                if (selected) runRow(selected);
              },
            },
          ]
        : [],
    rows,
    selectedKey: ctx.selectedKey,
    select: ctx.select,
  });

  if (rows.length === 0) {
    return createElement(EmptyView, { title: 'No editable playlists found', icon: 'list-music' });
  }
  return createElement(
    'div',
    null,
    createElement(
      'div',
      { className: 'sp-section-title' },
      `${props.mode === 'add' ? 'Add' : 'Remove'} ${track.name} ${props.mode === 'add' ? 'to…' : 'from…'}`,
    ),
    rows.map((row) =>
      createElement(
        'div',
        {
          key: row.key,
          className: row.key === ctx.selectedKey ? 'sp-row sp-row-selected' : 'sp-row',
          onMouseEnter: () => ctx.select(row.key),
          onClick: () => runRow(row),
        },
        createElement(Art, { src: row.artUrl }),
        createElement(
          'div',
          { className: 'sp-row-main' },
          createElement('span', { className: 'sp-row-title' }, row.title),
        ),
        createElement('span', { className: 'sp-row-duration' }, row.subtitle),
      ),
    ),
  );
}
