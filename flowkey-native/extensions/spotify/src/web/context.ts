import type { SpotifyAlbum, SpotifyArtist, SpotifyPlaylist } from '../api/types';
import type { SpotifyClient } from '../api/client';
import type { MediaState } from '../lyrics';
import type { IconName } from './icons';
import type { ScrollIntent } from './scroll';

/** One entry of the in-page action palette (Ctrl+K) / footer actions. */
export interface SpotifyAction {
  id: string;
  title: string;
  icon: IconName;
  run: () => void | Promise<void>;
}

/** Navigation target of an in-page screen. */
export type Screen =
  | { kind: 'search' }
  | { kind: 'library' }
  | { kind: 'now-playing' }
  | { kind: 'queue' }
  | { kind: 'devices' }
  | { kind: 'current-track' }
  | { kind: 'lyrics' }
  | { kind: 'playlist-add' }
  | { kind: 'playlist-remove' }
  | { kind: 'album-tracks'; album: SpotifyAlbum }
  | { kind: 'artist-top'; artist: SpotifyArtist }
  | { kind: 'artist-albums'; artist: SpotifyArtist }
  | { kind: 'liked-songs' }
  | { kind: 'playlist-tracks'; playlist: SpotifyPlaylist };

/** Everything a screen needs from the app shell. */
export interface ScreenContext {
  client: SpotifyClient;
  /** User's own Spotify app client id preference, when set. */
  clientId: string;
  navigate: (screen: Screen) => void;
  popScreen: () => void;
  replaceAll: (screen: Screen) => void;
  /** HUD feedback for completed actions (copied, liked, …). */
  hud: (title: string) => void;
  /** Marks the session as unauthorized (authRequired API errors). */
  onAuthRequired: () => void;
  /** Registers the active screen's controller (rows, selection, actions). */
  registerController: (controller: ViewController | null) => void;
  selectedKey: string | null;
  select: (key: string | null) => void;
  /** Windows SMTC snapshot (`media.current`) for local, auth-free playback info. */
  mediaCurrent: () => Promise<MediaState | null>;
  /** Windows SMTC transport (`media.control`): playPause/next/previous. */
  mediaControl: (command: 'playPause' | 'next' | 'previous') => Promise<void>;
}

/**
 * The active screen's contract with the app chrome: the footer's primary
 * action, the Ctrl+K palette contents and the navigable rows.
 */
export interface ViewController {
  /** Footer context label (left side), e.g. "Now Playing". */
  title: string;
  /** Footer primary action label (right side), e.g. "Play". */
  primaryTitle: string;
  primary: () => void;
  /** Palette actions for the current selection (or the screen itself). */
  actions: SpotifyAction[];
  /** Navigable rows for arrow-key selection (list screens only). */
  rows?: WebRowRef[];
  selectedKey?: string | null;
  select?: (key: string | null) => void;
  /**
   * Keyboard scrolling for screens with no rows (lyrics, long detail text).
   * Arrow keys scroll it once row selection has nothing to move; the page and
   * home/end keys always reach it. Returns true when the screen consumed the
   * intent, which tells the chrome the key is handled.
   */
  scroll?: (intent: ScrollIntent) => boolean;
}

/** Minimal row shape the controller needs for keyboard navigation. */
export interface WebRowRef {
  key: string;
}
