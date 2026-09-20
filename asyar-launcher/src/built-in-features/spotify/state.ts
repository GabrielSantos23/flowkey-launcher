import { Signal, notifyReact } from '../../lib/reactive';
import type {
  SpotifyPlaybackState,
  SpotifyDevice,
  SpotifyTrack,
  SpotifyPlaylist,
} from './spotifyApi';
import type { SpotifyToken } from './spotifyAuth';

/**
 * Shared reactive state for the Spotify feature. Views read these Signals
 * (React re-renders via notifyReact) and refresh them through `refresh()`.
 */
class SpotifyState {
  #token = new Signal<SpotifyToken | null>(null);
  #clientId = new Signal<string | null>(null);
  #playback = new Signal<SpotifyPlaybackState | null>(null);
  #devices = new Signal<SpotifyDevice[]>([]);
  #playlists = new Signal<SpotifyPlaylist[]>([]);
  #currentTrack = new Signal<SpotifyTrack | null>(null);
  #lastError = new Signal<string | null>(null);

  get token(): SpotifyToken | null {
    return this.#token.get();
  }
  set token(v: SpotifyToken | null) {
    this.#token.set(v);
  }

  get clientId(): string | null {
    return this.#clientId.get();
  }
  set clientId(v: string | null) {
    this.#clientId.set(v);
  }

  get playback(): SpotifyPlaybackState | null {
    return this.#playback.get();
  }
  set playback(v: SpotifyPlaybackState | null) {
    this.#playback.set(v);
  }

  get devices(): SpotifyDevice[] {
    return this.#devices.get();
  }
  set devices(v: SpotifyDevice[]) {
    this.#devices.set(v);
  }

  get playlists(): SpotifyPlaylist[] {
    return this.#playlists.get();
  }
  set playlists(v: SpotifyPlaylist[]) {
    this.#playlists.set(v);
  }

  get currentTrack(): SpotifyTrack | null {
    return this.#currentTrack.get();
  }
  set currentTrack(v: SpotifyTrack | null) {
    this.#currentTrack.set(v);
  }

  get lastError(): string | null {
    return this.#lastError.get();
  }
  set lastError(v: string | null) {
    this.#lastError.set(v);
  }

  /** Write playback + derive the current track. `null` = nothing playing. */
  setPlayback(state: SpotifyPlaybackState | null): void {
    this.#playback.set(state);
    this.#currentTrack.set(state?.item ?? null);
    notifyReact();
  }

  resetAuth(): void {
    this.#token.set(null);
    notifyReact();
  }
}

export const spotifyState = new SpotifyState();
