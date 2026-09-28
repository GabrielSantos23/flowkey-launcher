/**
 * Pure playback-state mapping for the web Now Playing / Current Track screens:
 * view-model construction, progress projection and transport helpers.
 */
import type { SpotifyPlaybackState, SpotifyTrack } from '../api/types';

export interface NowPlayingModel {
  trackId: string;
  title: string;
  artistsLine: string;
  albumName: string;
  artUrl: string;
  durationMs: number;
  /** Progress sampled at the moment the state was fetched. */
  progressMs: number;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: SpotifyPlaybackState['repeat_state'];
  deviceName: string;
  volumePercent: number | null;
  liked: boolean | null;
}

function isTrackItem(item: SpotifyPlaybackState['item']): item is SpotifyTrack {
  return item !== null && 'artists' in item;
}

export function describePlaybackState(
  state: SpotifyPlaybackState,
  liked: boolean | null,
  sampledAtMs: number,
): NowPlayingModel | null {
  if (!isTrackItem(state.item)) {
    return null;
  }
  const track = state.item;
  return {
    trackId: track.id,
    title: track.name,
    artistsLine: track.artists.map((artist) => artist.name).join(', '),
    albumName: track.album?.name ?? 'Unknown album',
    artUrl: track.album?.images[0]?.url ?? '',
    durationMs: track.duration_ms,
    progressMs: state.progress_ms ?? track.duration_ms,
    isPlaying: state.is_playing,
    shuffle: state.shuffle_state,
    repeat: state.repeat_state,
    deviceName: state.device?.name ?? 'Unknown device',
    volumePercent: state.device?.volume_percent ?? null,
    liked,
  };
}

/** Extrapolates the sampled progress to `nowMs` while playing (clock-skew safe). */
export function projectedProgressMs(
  progressMs: number,
  isPlaying: boolean,
  sampledAtMs: number,
  nowMs: number,
): number {
  if (!isPlaying || nowMs <= sampledAtMs) {
    return progressMs;
  }
  return progressMs + (nowMs - sampledAtMs);
}

export function progressRatio(progressMs: number, durationMs: number): number {
  if (durationMs <= 0) {
    return 0;
  }
  const ratio = progressMs / durationMs;
  return Math.min(1, Math.max(0, ratio));
}

export function nextRepeatState(repeat: SpotifyPlaybackState['repeat_state']) {
  const order: SpotifyPlaybackState['repeat_state'][] = ['off', 'track', 'context'];
  return order[(order.indexOf(repeat) + 1) % order.length];
}

export function clampedVolume(current: number, delta: number): number {
  return Math.min(100, Math.max(0, Math.round(current + delta)));
}
