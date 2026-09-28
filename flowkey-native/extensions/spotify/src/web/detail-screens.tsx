import { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SpotifyClient } from '../api/client';
import type { SpotifyPlaybackState } from '../api/types';
import { formatMs } from '../format';
import {
  activeLineIndex,
  parseLrc,
  projectedPositionMs,
  sameMedia,
  type MediaState,
} from '../lyrics';
import {
  clampedVolume,
  describePlaybackState,
  nextRepeatState,
  projectedProgressMs,
  type NowPlayingModel,
} from './playback-model';
import { describeError, isAborted } from '../search-model';
import { EmptyView, useArtwork } from './chrome';
import type { ScreenContext, SpotifyAction } from './context';
import { Icon } from './icons';
import { runAction, useController } from './list-screens';
import { applyScroll, AUTO_FOLLOW_RESUME_MS, shouldAutoFollow, type ScrollIntent } from './scroll';

const POLL_INTERVAL_MS = 5_000;
const TICK_MS = 500;
const MEDIA_POLL_MS = 1_000;
const LYRIC_TICK_MS = 250;
const SEEK_STEP_MS = 15_000;
const VOLUME_STEP = 10;

/**
 * Detail layout from the reference images: large art under the title on the
 * left, key/value metadata column on the right.
 */
function DetailLayout(props: {
  title: string;
  subtitle: string;
  artSrc?: string;
  fields: { label: string; value: ReactNode }[];
  children?: ReactNode;
}): ReactNode {
  return createElement(
    'div',
    { className: 'sp-detail' },
    createElement(
      'div',
      { className: 'sp-detail-main' },
      createElement('div', { className: 'sp-detail-title' }, props.title),
      createElement('div', { className: 'sp-detail-subtitle' }, props.subtitle),
      props.children,
      props.artSrc
        ? createElement('img', {
            className: 'sp-detail-art',
            src: props.artSrc,
            alt: '',
            draggable: false,
          })
        : createElement(
            'div',
            { className: 'sp-detail-art-fallback' },
            createElement(Icon, { name: 'music', size: 28 }),
          ),
    ),
    createElement(
      'div',
      { className: 'sp-detail-meta' },
      props.fields.map((field) =>
        createElement(
          'div',
          { key: field.label },
          createElement('div', { className: 'sp-meta-label' }, field.label),
          createElement('div', { className: 'sp-meta-value' }, field.value),
        ),
      ),
    ),
  );
}

/** Next/previous through the Web API, falling back to the SMTC transport. */
function skip(ctx: ScreenContext, command: 'next' | 'previous'): void {
  void (async () => {
    try {
      if (command === 'next') {
        await ctx.client.next();
      } else {
        await ctx.client.previous();
      }
      ctx.hud(command === 'next' ? 'Skipped to next track' : 'Went back to previous track');
    } catch (caught) {
      if (isAborted(caught)) return;
      try {
        await ctx.mediaControl(command);
        ctx.hud(command === 'next' ? 'Skipped to next track' : 'Went back to previous track');
      } catch (mediaError) {
        ctx.hud(describeError(mediaError));
      }
    }
  })();
}

/**
 * Now Playing: polls the Web API player state every 5s and the local SMTC
 * session as a cheap supplement; falls back to SMTC-only info when the Web
 * API has no active device.
 */
export function NowPlayingScreen(props: { ctx: ScreenContext }): ReactNode {
  const { ctx } = props;
  const [state, setState] = useState<SpotifyPlaybackState | null>(null);
  const [sampledAt, setSampledAt] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [liked, setLiked] = useState<boolean | null>(null);
  const [media, setMedia] = useState<MediaState | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  const stateRef = useRef<SpotifyPlaybackState | null>(null);
  stateRef.current = state;

  // Web API player state poll (drives the full view)
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async (): Promise<void> => {
      try {
        const next = await ctx.client.playbackState();
        if (!alive) return;
        if (next && next.device) {
          setState(next);
          setSampledAt(Date.now());
          setVolume(next.device.volume_percent ?? null);
          setLoadError('');
        }
      } catch (caught) {
        if (!alive || isAborted(caught)) return;
        if ((caught as { code?: string })?.code === 'authRequired') {
          ctx.onAuthRequired();
          return;
        }
        if (alive) setLoadError(describeError(caught));
      } finally {
        if (alive) timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };
    void poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.client]);

  // Cheap local SMTC poll — the fallback view's data source
  useEffect(() => {
    let alive = true;
    const poll = (): void => {
      ctx
        .mediaCurrent()
        .then((snapshot) => {
          if (!alive) return;
          setMedia((previous) => (sameMedia(previous, snapshot) ? previous : snapshot));
        })
        .catch(() => {
          /* polling resumes on the next tick */
        });
    };
    poll();
    const timer = setInterval(poll, MEDIA_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.client]);

  const model = useMemo(
    () => (state ? describePlaybackState(state, liked, sampledAt) : null),
    [state, liked, sampledAt],
  );

  const trackId = model?.trackId ?? null;
  useEffect(() => {
    if (!trackId) return;
    let alive = true;
    ctx.client
      .containsSavedTracks([trackId])
      .then((result) => {
        if (alive) setLiked(result[0] ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

  // progress ticker (local interpolation between polls)
  useEffect(() => {
    const timer = setInterval(() => forceTick((value) => value + 1), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const artwork = useArtwork(ctx.client, model?.artUrl ? [model.artUrl] : []);

  const refresh = (): void => {
    setSampledAt(0);
  };

  const likeAction: SpotifyAction = {
    id: 'like',
    title: model?.liked ? 'Unlike' : 'Like',
    icon: model?.liked ? 'heart-off' : 'heart',
    run: () => {
      if (!model) return;
      void runAction(ctx, 'Updated Liked Songs', async () => {
        if (model.liked) {
          await ctx.client.removeFromSavedTracks([model.trackId]);
          setLiked(false);
        } else {
          await ctx.client.addToSavedTracks([model.trackId]);
          setLiked(true);
        }
        refresh();
      });
    },
  };

  useController(
    {
      ...ctx,
      selectedKey: null,
      select: ctx.select,
    },
    {
      title: 'Now Playing',
      primaryTitle: model
        ? model.isPlaying
          ? 'Pause'
          : 'Play'
        : media?.playing
          ? 'Pause'
          : 'Play',
      primary: () => {
        if (model) {
          void runAction(ctx, model.isPlaying ? 'Paused' : 'Playing', () =>
            model.isPlaying ? ctx.client.pause() : ctx.client.play({}),
          );
        } else {
          void ctx.mediaControl('playPause');
        }
      },
      actions: model
        ? [
            {
              id: 'next',
              title: 'Next',
              icon: 'skip-forward',
              run: () => skip(ctx, 'next'),
            },
            {
              id: 'previous',
              title: 'Previous',
              icon: 'skip-back',
              run: () => skip(ctx, 'previous'),
            },
            likeAction,
            {
              id: 'shuffle',
              title: model.shuffle ? 'Shuffle Off' : 'Shuffle On',
              icon: 'shuffle',
              run: () => {
                const target = !model.shuffle;
                void runAction(ctx, target ? 'Shuffle on' : 'Shuffle off', () =>
                  ctx.client.setShuffle(target),
                );
                refresh();
              },
            },
            {
              id: 'repeat',
              title: `Repeat: ${model.repeat}`,
              icon: model.repeat === 'off' ? 'repeat' : 'repeat-1',
              run: () => {
                const next = nextRepeatState(model.repeat);
                void runAction(ctx, `Repeat: ${next}`, () => ctx.client.setRepeat(next));
                refresh();
              },
            },
            {
              id: 'forward',
              title: 'Skip 15 Seconds',
              icon: 'skip-forward',
              run: () => {
                const target = Math.min(progressMs + SEEK_STEP_MS, model.durationMs);
                void runAction(ctx, null, () => ctx.client.seek(target));
                refresh();
              },
            },
            {
              id: 'back',
              title: 'Back 15 Seconds',
              icon: 'skip-back',
              run: () => {
                const target = Math.max(progressMs - SEEK_STEP_MS, 0);
                void runAction(ctx, null, () => ctx.client.seek(target));
                refresh();
              },
            },
            {
              id: 'volume-up',
              title: 'Volume Up',
              icon: 'volume',
              run: () => {
                const target = clampedVolume(volume ?? 50, VOLUME_STEP);
                void runAction(ctx, `Volume: ${target}%`, () => ctx.client.setVolume(target));
                refresh();
              },
            },
            {
              id: 'volume-down',
              title: 'Volume Down',
              icon: 'volume-x',
              run: () => {
                const target = clampedVolume(volume ?? 50, -VOLUME_STEP);
                void runAction(ctx, `Volume: ${target}%`, () => ctx.client.setVolume(target));
                refresh();
              },
            },
            {
              id: 'copy-link',
              title: 'Copy Track Link',
              icon: 'link',
              run: () =>
                runAction(ctx, 'Copied track link', () =>
                  ctx.client.copyText(`https://open.spotify.com/track/${model.trackId}`),
                ),
            },
            {
              id: 'copy-artist-title',
              title: 'Copy Artist and Title',
              icon: 'link',
              run: () =>
                runAction(ctx, 'Copied artist and title', () =>
                  ctx.client.copyText(`${model.artistsLine} - ${model.title}`),
                ),
            },
          ]
        : [],
    },
  );

  if (loadError && !model) {
    return createElement(EmptyView, {
      title: 'Could not load playback',
      description: loadError,
      icon: 'music',
    });
  }
  if (!model) {
    return createElement(SmtcFallbackView, { ctx, media });
  }

  const progressMs = projectedProgressMs(model.progressMs, model.isPlaying, sampledAt, Date.now());
  const artFileUri = model.artUrl ? artwork[model.artUrl] : undefined;

  return createElement(DetailLayout, {
    title: model.title,
    subtitle: `by ${model.artistsLine}`,
    artSrc: artFileUri,
    fields: [
      { label: 'Track', value: model.title },
      { label: 'Duration', value: formatMs(model.durationMs) },
      { label: 'Progress', value: `${formatMs(progressMs)} / ${formatMs(model.durationMs)}` },
      { label: 'Artists', value: model.artistsLine },
      { label: 'Album', value: model.albumName },
      {
        label: 'Liked',
        value: createElement(
          'span',
          null,
          createElement(Icon, { name: model.liked ? 'heart' : 'heart-off', size: 13 }),
          ' ',
          model.liked === null ? '…' : model.liked ? 'Yes' : 'No',
        ),
      },
      { label: 'Device', value: `${model.deviceName} · volume ${model.volumePercent ?? '?'}%` },
    ],
  });
}

/** Fallback view driven purely by the local SMTC snapshot (no auth needed). */
function SmtcFallbackView(props: { ctx: ScreenContext; media: MediaState | null }): ReactNode {
  const { ctx, media } = props;
  useEffect(() => {
    ctx.registerController({
      title: 'Now Playing',
      primaryTitle: media?.playing ? 'Pause' : 'Play',
      primary: () => {
        void ctx.mediaControl('playPause');
      },
      actions: [
        {
          id: 'next',
          title: 'Next Track',
          icon: 'skip-forward',
          run: () => void ctx.mediaControl('next'),
        },
        {
          id: 'previous',
          title: 'Previous Track',
          icon: 'skip-back',
          run: () => void ctx.mediaControl('previous'),
        },
      ],
    });
  });
  if (!media?.title) {
    return createElement(EmptyView, {
      title: 'No active Spotify device',
      description: 'Open Spotify on any device and start playback, then try again.',
      icon: 'music',
    });
  }
  return createElement(DetailLayout, {
    title: media.title,
    subtitle: media.artist ?? '',
    fields: [
      { label: 'Track', value: media.title },
      { label: 'Artist', value: media.artist ?? 'Unknown' },
      {
        label: 'Position',
        value: `${formatMs(projectedPositionMs(media))}${media.durationMs ? ` / ${formatMs(media.durationMs)}` : ''}`,
      },
      { label: 'Source', value: 'Windows media session' },
    ],
  });
}

/** Current Track: one-shot read-only playback metadata (no polling). */
export function CurrentTrackScreen(props: { ctx: ScreenContext }): ReactNode {
  const { ctx } = props;
  const [state, setState] = useState<SpotifyPlaybackState | null>(null);
  const [blocked, setBlocked] = useState('');
  const [sampledAt, setSampledAt] = useState(0);

  useEffect(() => {
    let alive = true;
    ctx.client
      .playbackState()
      .then((playback) => {
        if (!alive) return;
        setState(playback);
        setSampledAt(Date.now());
        if (!playback || !playback.device) {
          setBlocked('No active Spotify device');
        }
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

  const model = useMemo(
    () => (state ? describePlaybackState(state, null, sampledAt) : null),
    [state, sampledAt],
  );
  const artwork = useArtwork(ctx.client, model?.artUrl ? [model.artUrl] : []);

  useController(ctx, {
    title: 'Current Track',
    primaryTitle: 'Play',
    primary: () => {
      void runAction(ctx, 'Playing', () => ctx.client.play({}));
    },
    actions: [
      {
        id: 'copy-link',
        title: 'Copy Track Link',
        icon: 'link',
        run: () => {
          if (!model) return;
          return runAction(ctx, 'Copied track link', () =>
            ctx.client.copyText(`https://open.spotify.com/track/${model.trackId}`),
          );
        },
      },
      {
        id: 'copy-artist-title',
        title: 'Copy Artist and Title',
        icon: 'link',
        run: () => {
          if (!model) return;
          return runAction(ctx, 'Copied artist and title', () =>
            ctx.client.copyText(`${model.artistsLine} - ${model.title}`),
          );
        },
      },
    ],
  });

  if (blocked) {
    return createElement(EmptyView, { title: blocked, icon: 'music' });
  }
  if (!model) {
    return createElement(EmptyView, { title: 'Loading playback…', icon: 'music' });
  }
  return createElement(DetailLayout, {
    title: model.title,
    subtitle: `by ${model.artistsLine}`,
    artSrc: model.artUrl ? artwork[model.artUrl] : undefined,
    fields: [
      { label: 'Track', value: model.title },
      { label: 'Duration', value: formatMs(model.durationMs) },
      {
        label: 'Progress',
        value: `${formatMs(model.progressMs)} / ${formatMs(model.durationMs)}`,
      },
      { label: 'Album', value: model.albumName },
      { label: 'Device', value: model.deviceName },
    ],
  });
}

/** Find Lyrics: SMTC-driven (auth-free) lyrics lookup with synced highlighting. */
export function LyricsScreen(props: { ctx: ScreenContext }): ReactNode {
  const { ctx } = props;
  const [media, setMedia] = useState<MediaState | null>(null);
  const [lyrics, setLyrics] = useState<{
    synced: boolean;
    lines: { timeMs: number; text: string }[];
    plain: string;
    title: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [following, setFollowing] = useState(true);
  const mediaRef = useRef<MediaState | null>(null);
  const fetchedFor = useRef('');
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const followResumeAtRef = useRef(0);

  // SMTC poll — lyrics track the OS-level media session
  useEffect(() => {
    let alive = true;
    const poll = (): void => {
      ctx
        .mediaCurrent()
        .then((snapshot) => {
          if (!alive) return;
          if (!sameMedia(mediaRef.current, snapshot)) {
            mediaRef.current = snapshot;
            setMedia(snapshot);
          }
        })
        .catch(() => {
          /* polling resumes on the next tick */
        });
    };
    poll();
    const timer = setInterval(poll, MEDIA_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.client]);

  // lyric fetch per track change
  const title = media?.title?.trim() ?? '';
  const artist = media?.artist?.trim() ?? '';
  useEffect(() => {
    if (!title) return;
    const stamp = `${title}|${artist}`;
    if (fetchedFor.current === stamp) return;
    fetchedFor.current = stamp;
    let alive = true;
    setLyrics(null);
    setError('');
    // a new track re-centers on its own first line
    followResumeAtRef.current = 0;
    setFollowing(true);
    ctx.client
      .findLyrics(title, artist)
      .then((hit) => {
        if (!alive) return;
        if (!hit) {
          setError('No lyrics found for this track.');
          return;
        }
        const lines = hit.syncedLyrics ? parseLrc(hit.syncedLyrics) : [];
        setLyrics({
          synced: lines.length > 1,
          lines: lines.length > 1 ? lines : [{ timeMs: 0, text: hit.plainLyrics }],
          plain: hit.plainLyrics,
          title: hit.trackName,
        });
      })
      .catch((caught) => {
        if (alive && !isAborted(caught)) setError(describeError(caught));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, artist]);

  // active-line ticker
  useEffect(() => {
    const timer = setInterval(() => {
      const current = mediaRef.current;
      if (!current || !lyrics?.synced) return;
      const index = activeLineIndex(lyrics.lines, projectedPositionMs(current));
      setActiveIndex((previous) => (previous === index ? previous : index));
      // the same tick lifts a manual-scroll hold once its deadline passes
      setFollowing((previous) =>
        previous || shouldAutoFollow(followResumeAtRef.current, Date.now()) ? true : false,
      );
    }, LYRIC_TICK_MS);
    return () => clearInterval(timer);
  }, [lyrics]);

  // keep the sung line centered as playback advances — a manual scroll holds
  // this off so reading ahead is not undone by the next line change
  useEffect(() => {
    if (activeIndex < 0 || !following) return;
    document
      .querySelector('.sp-lyrics-line-active')
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex, following]);

  const scrollLyrics = (intent: ScrollIntent): boolean => {
    const scroller = scrollerRef.current;
    if (!scroller) return false;
    applyScroll(scroller, intent);
    followResumeAtRef.current = Date.now() + AUTO_FOLLOW_RESUME_MS;
    setFollowing(false);
    return true;
  };

  useController(ctx, {
    title: 'Lyrics',
    primaryTitle: 'Play / Pause',
    primary: () => {
      void ctx.mediaControl('playPause');
    },
    scroll: scrollLyrics,
    actions: [
      {
        id: 'play-pause',
        title: 'Play / Pause',
        icon: 'play',
        run: () => void ctx.mediaControl('playPause'),
      },
      {
        id: 'next',
        title: 'Next Track',
        icon: 'skip-forward',
        run: () => void ctx.mediaControl('next'),
      },
      {
        id: 'previous',
        title: 'Previous Track',
        icon: 'skip-back',
        run: () => void ctx.mediaControl('previous'),
      },
    ],
  });

  if (!media?.title) {
    return createElement(EmptyView, {
      title: 'Nothing is playing right now',
      description: 'Start playback on any media app and reopen Find Lyrics.',
      icon: 'music',
    });
  }
  if (error) {
    return createElement(EmptyView, { title: error, icon: 'music' });
  }
  if (!lyrics) {
    return createElement(EmptyView, {
      title: `Searching lyrics for ${media.title}…`,
      icon: 'search',
    });
  }
  return createElement(
    'div',
    { className: 'sp-lyrics', ref: scrollerRef, tabIndex: -1 },
    createElement(
      'div',
      { className: 'sp-lyrics-header' },
      createElement('div', { className: 'sp-lyrics-title' }, lyrics.title),
      createElement(
        'div',
        { className: 'sp-lyrics-subtitle' },
        [media.artist, media.album].filter(Boolean).join(' · '),
      ),
      createElement(
        'div',
        {
          className: following ? 'sp-lyrics-hint' : 'sp-lyrics-hint sp-lyrics-hint-paused',
        },
        following
          ? 'Following playback — ↑↓ scroll, PgUp/PgDn page'
          : 'Auto-scroll paused — resumes with playback',
      ),
    ),
    lyrics.synced
      ? lyrics.lines.map((line, index) =>
          createElement(
            'div',
            {
              key: `${index}:${line.timeMs}`,
              className:
                index === activeIndex
                  ? 'sp-lyrics-line sp-lyrics-line-active'
                  : activeIndex >= 0 && index < activeIndex
                    ? 'sp-lyrics-line sp-lyrics-line-past'
                    : 'sp-lyrics-line',
            },
            line.text,
          ),
        )
      : createElement('div', { className: 'sp-lyrics-line' }, lyrics.plain),
  );
}
