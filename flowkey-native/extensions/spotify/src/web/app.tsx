import { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { WebCommandProps } from '@flowkey-cli/native-sdk/web';
import { SpotifyClient } from '../api/client';
import type { MediaState } from '../lyrics';
import { describeError, SEARCH_FILTERS } from '../search-model';
import { EmptyView } from './chrome';
import type { Screen, ScreenContext, ViewController } from './context';
import { Icon, SpotifyBadge } from './icons';
import { capabilitiesToNativeCall } from './native-call';
import { scrollIntentForKey, scrollIntentForPageAction, type ScrollIntent } from './scroll';
import {
  AlbumTracksScreen,
  ArtistAlbumsScreen,
  ArtistTopScreen,
  DevicesScreen,
  LibraryScreen,
  LikedSongsScreen,
  PlaylistPickerScreen,
  PlaylistTracksScreen,
  QueueScreen,
  SearchScreen,
} from './list-screens';
import { CurrentTrackScreen, LyricsScreen, NowPlayingScreen } from './detail-screens';

/** Moves the row selection by one, wrapping; false when the screen has no rows. */
function moveRowSelection(controller: ViewController | null, delta: number): boolean {
  const rows = controller?.rows ?? [];
  if (rows.length === 0 || !controller?.select) return false;
  const index = rows.findIndex((row) => row.key === controller.selectedKey);
  const next = rows[(index + delta + rows.length) % rows.length];
  controller.select(next.key);
  return true;
}

/**
 * One scroll intent, one destination: line steps move the row selection while
 * the screen has rows (list screens) and scroll it otherwise (lyrics); page
 * and home/end keys only ever scroll.
 */
function applyScrollIntent(controller: ViewController | null, intent: ScrollIntent): boolean {
  if (intent === 'lineUp' || intent === 'lineDown') {
    if (moveRowSelection(controller, intent === 'lineDown' ? 1 : -1)) return true;
  }
  return controller?.scroll?.(intent) ?? false;
}

/** Maps the launched command id to the app's root screen. */
export function rootScreenFor(commandId: string | undefined): Screen {
  switch (commandId) {
    case 'your-library':
      return { kind: 'library' };
    case 'now-playing':
      return { kind: 'now-playing' };
    case 'queue':
      return { kind: 'queue' };
    case 'devices':
      return { kind: 'devices' };
    case 'current-track':
      return { kind: 'current-track' };
    case 'find-lyrics':
      return { kind: 'lyrics' };
    case 'add-playing-to-playlist':
      return { kind: 'playlist-add' };
    case 'remove-playing-from-playlist':
      return { kind: 'playlist-remove' };
    default:
      return { kind: 'search' };
  }
}

type AuthState = 'checking' | 'unauthorized' | 'authorized';

function postToHost(message: Record<string, unknown>): void {
  const flowkey = (
    window as unknown as { flowkey?: { post(message: Record<string, unknown>): void } }
  ).flowkey;
  flowkey?.post(message);
}

/** The single web surface shared by all Spotify view commands. */
export function SpotifyWebApp(props: WebCommandProps): ReactNode {
  const commandId = props.environment?.commandId;
  const clientId =
    typeof props.preferences?.clientId === 'string' && props.preferences.clientId.length > 0
      ? props.preferences.clientId
      : '';

  // stable client over the web capability bridge
  const client = useMemo(
    () => new SpotifyClient(capabilitiesToNativeCall(props.capabilities)),
    [props.capabilities],
  );

  const [auth, setAuth] = useState<AuthState>('checking');
  const [authError, setAuthError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [stack, setStack] = useState<Screen[]>(() => [rootScreenFor(commandId)]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const controllerRef = useRef<ViewController | null>(null);

  // a different command (re)opened from the launcher resets the stack
  const rootKind = rootScreenFor(commandId).kind;
  useEffect(() => {
    setStack((current) => (current[0]?.kind === rootKind ? current : [rootScreenFor(commandId)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootKind]);

  // auth probe on mount
  useEffect(() => {
    const controller = new AbortController();
    client
      .authStatus(controller.signal)
      .then((status) => setAuth(status.ok ? 'authorized' : 'unauthorized'))
      .catch((caught) => {
        if ((caught as { code?: string })?.code === 'aborted') return;
        setAuth('unauthorized');
        setAuthError(describeError(caught));
      });
    return () => controller.abort();
  }, [client]);

  const ctx: ScreenContext = {
    client,
    clientId,
    navigate: (screen) => {
      setStack((current) => [...current, screen]);
      setSelectedKey(null);
    },
    popScreen: () => {
      setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
      setSelectedKey(null);
    },
    replaceAll: (screen) => {
      setStack([screen]);
      setSelectedKey(null);
    },
    hud: (title) => {
      void props.capabilities.hud.show({ title }).catch(() => {});
    },
    onAuthRequired: () => {
      setAuth('unauthorized');
      setAuthError('');
    },
    registerController: (controller) => {
      controllerRef.current = controller;
    },
    selectedKey,
    select: setSelectedKey,
    mediaCurrent: async (): Promise<MediaState | null> => {
      try {
        return (await props.capabilities.media.current()) as MediaState | null;
      } catch {
        return null;
      }
    },
    mediaControl: (command) => props.capabilities.media.control(command),
  };

  // mirrors the palette actions for the shell-forwarded key handler below
  // (the effect's closure would otherwise read stale values)
  useEffect(() => {
    // the same message object arrives via both channels — run each once
    const seen = new WeakSet<object>();
    const handler = (event: Event): void => {
      const data = (event as MessageEvent).data as
        { type?: string; action?: string } | null | undefined;
      if (data?.type !== 'pageAction' && data?.type !== 'paletteAction') return;
      if (seen.has(data)) return;
      seen.add(data);
      const controller = controllerRef.current;
      // the shell's native action panel committed one of the actions this
      // page reported in viewState
      if (data.type === 'paletteAction') {
        const action = (controller?.actions ?? []).find((entry) => entry.id === data.action);
        if (action) void action.run();
        return;
      }
      if (data.action === 'moveDown' || data.action === 'moveUp') {
        applyScrollIntent(controller, data.action === 'moveDown' ? 'lineDown' : 'lineUp');
        return;
      }
      const scrollIntent = scrollIntentForPageAction(data.action ?? '');
      if (scrollIntent !== null) {
        applyScrollIntent(controller, scrollIntent);
        return;
      }
      if (data.action === 'primary') {
        controller?.primary();
        return;
      }
      if (data.action === 'goBack') {
        setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
        setSelectedKey(null);
      }
    };
    // direct webview listener: props/results prove this channel delivers
    const webview = (
      window as unknown as {
        chrome?: {
          webview?: {
            addEventListener(type: string, fn: (event: Event) => void): void;
            removeEventListener(type: string, fn: (event: Event) => void): void;
          };
        };
      }
    ).chrome?.webview;
    webview?.addEventListener('message', handler);
    window.addEventListener('flowkey-message', handler);
    return () => {
      webview?.removeEventListener('message', handler);
      window.removeEventListener('flowkey-message', handler);
    };
  }, []);

  const screen = stack[stack.length - 1];
  const authorized = auth === 'authorized';
  // the launcher's own search box is the single search field; the shell
  // search-bar dropdown (declared via viewState) provides the type filter
  const filter = props.filterValue ?? 'all';
  const filterApplies = screen.kind === 'search' || screen.kind === 'library';
  const canGoBack = authorized && stack.length > 1;

  // report chrome state so the shell can render the footer hints and the
  // search-bar dropdown natively (deduped — only posted when it changes).
  // The shell's native Ctrl+K panel renders `actions`; committing one comes
  // back as a paletteAction message above.
  const lastStateRef = useRef('');
  useEffect(() => {
    const controller = controllerRef.current;
    const primaryTitle = controller?.primaryTitle ?? '';
    const hasActions = (controller?.actions.length ?? 0) > 0;
    const filters = authorized && filterApplies ? SEARCH_FILTERS : undefined;
    const actions = (controller?.actions ?? []).map(({ id, title, icon }) => ({ id, title, icon }));
    const stateKey = JSON.stringify({
      primaryTitle,
      canGoBack,
      hasActions,
      actions,
      filters,
    });
    if (lastStateRef.current === stateKey) return;
    lastStateRef.current = stateKey;
    postToHost({
      type: 'viewState',
      primaryTitle,
      canGoBack,
      hasActions,
      ...(actions.length > 0 ? { actions } : {}),
      ...(filters ? { filters } : {}),
    });
  });

  // window-level keyboard routing while the page itself has focus
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const inTextField = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      const controller = controllerRef.current;

      if (event.ctrlKey || event.metaKey) {
        if ((event.key === 'k' || event.key === 'K') && controller) {
          // the webview swallows keystrokes, so the shell cannot see this
          // press: ask the shell to open its native action panel
          postToHost({ type: 'openPalette' });
          event.preventDefault();
        }
        return;
      }

      // arrows move list rows and scroll row-less screens; page/home/end
      // always scroll. Chromium would only scroll the container the page's own
      // focused element sits in, so the router owns these keys.
      const intent = scrollIntentForKey(event.key);
      if (intent !== null) {
        if (!inTextField && applyScrollIntent(controller, intent)) {
          event.preventDefault();
        }
        return;
      }
      if (event.key === 'Enter') {
        if (!controller) return;
        event.preventDefault();
        controller.primary();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
        setSelectedKey(null);
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  let content: ReactNode;
  switch (screen.kind) {
    case 'search':
      content = createElement(SearchScreen, { ctx, query: props.query ?? '', filter });
      break;
    case 'library':
      content = createElement(LibraryScreen, { ctx, query: props.query ?? '', filter });
      break;
    case 'now-playing':
      content = createElement(NowPlayingScreen, { ctx });
      break;
    case 'queue':
      content = createElement(QueueScreen, { ctx, query: props.query ?? '' });
      break;
    case 'devices':
      content = createElement(DevicesScreen, { ctx, query: props.query ?? '' });
      break;
    case 'current-track':
      content = createElement(CurrentTrackScreen, { ctx });
      break;
    case 'lyrics':
      content = createElement(LyricsScreen, { ctx });
      break;
    case 'playlist-add':
      content = createElement(PlaylistPickerScreen, { ctx, mode: 'add', query: props.query ?? '' });
      break;
    case 'playlist-remove':
      content = createElement(PlaylistPickerScreen, {
        ctx,
        mode: 'remove',
        query: props.query ?? '',
      });
      break;
    case 'album-tracks':
      content = createElement(AlbumTracksScreen, {
        ctx,
        album: screen.album,
        query: props.query ?? '',
      });
      break;
    case 'artist-top':
      content = createElement(ArtistTopScreen, {
        ctx,
        artist: screen.artist,
        query: props.query ?? '',
      });
      break;
    case 'artist-albums':
      content = createElement(ArtistAlbumsScreen, {
        ctx,
        artist: screen.artist,
        query: props.query ?? '',
      });
      break;
    case 'liked-songs':
      content = createElement(LikedSongsScreen, { ctx, query: props.query ?? '' });
      break;
    case 'playlist-tracks':
      content = createElement(PlaylistTracksScreen, {
        ctx,
        playlist: screen.playlist,
        query: props.query ?? '',
      });
      break;
    default:
      content = createElement(EmptyView, { title: 'Unknown screen' });
  }

  if (auth === 'checking') {
    content = createElement(EmptyView, { title: 'Checking Spotify connection…', icon: 'search' });
  } else if (auth === 'unauthorized') {
    content = createElement(ConnectScreen, {
      client,
      clientId,
      authError,
      connecting,
      onConnecting: setConnecting,
      onConnected: () => setAuth('authorized'),
    });
  }

  return createElement(
    'div',
    { className: 'sp-app' },
    createElement(
      'div',
      { className: 'sp-content', key: `${stack.length}:${screen.kind}` },
      content,
    ),
  );
}

function ConnectScreen(props: {
  client: SpotifyClient;
  clientId: string;
  authError: string;
  connecting: boolean;
  onConnecting: (connecting: boolean) => void;
  onConnected: () => void;
}): ReactNode {
  const { client, clientId, authError } = props;
  const [notice, setNotice] = useState('');
  const message =
    authError ||
    notice ||
    (clientId
      ? 'Authorize FlowKey to search and control your Spotify.'
      : 'Paste your Spotify client id in FlowKey Settings (Spotify section) first, then connect.');
  return createElement(
    'div',
    { className: 'sp-connect' },
    createElement(SpotifyBadge, null),
    createElement('div', { className: 'sp-connect-title' }, 'Connect Spotify'),
    createElement('div', { className: 'sp-connect-description' }, message),
    createElement(
      'button',
      {
        className: 'sp-connect-button',
        disabled: props.connecting,
        onClick: () => {
          if (!clientId) {
            setNotice('Add your Spotify client id in FlowKey Settings, then connect again.');
            return;
          }
          props.onConnecting(true);
          setNotice('Waiting for Spotify authorization…');
          client
            .authorize(undefined, clientId)
            .then((result) => {
              props.onConnecting(false);
              if (result.ok) {
                props.onConnected();
              } else {
                setNotice('Authorization did not complete.');
              }
            })
            .catch((caught) => {
              props.onConnecting(false);
              setNotice(describeError(caught));
            });
        },
      },
      createElement(Icon, { name: 'play', size: 13 }),
      props.connecting ? 'Connecting…' : 'Connect Spotify',
    ),
  );
}
