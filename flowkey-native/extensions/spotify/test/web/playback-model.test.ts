import { describe, expect, test } from 'bun:test';
import type { SpotifyDevice, SpotifyPlaybackState, SpotifyTrack } from '../../src/api/types';
import {
  clampedVolume,
  describePlaybackState,
  nextRepeatState,
  progressRatio,
  projectedProgressMs,
} from '../../src/web/playback-model';

const device = (overrides: Partial<SpotifyDevice> = {}): SpotifyDevice => ({
  id: 'd1',
  is_active: true,
  is_restricted: false,
  name: 'This PC',
  type: 'Computer',
  volume_percent: 55,
  ...overrides,
});

const playingTrack: SpotifyTrack = {
  id: 't1',
  name: 'Private Landing',
  uri: 'spotify:track:t1',
  duration_ms: 238_000,
  artists: [
    { id: 'a1', name: 'Don Toliver' },
    { id: 'a2', name: 'Justin Bieber' },
  ],
  album: {
    id: 'al1',
    name: 'Love Sick',
    images: [{ url: 'https://i.scdn.co/art', width: 640, height: 640 }],
    artists: [],
    release_date: '2023',
    total_tracks: 16,
  },
};

const state = (overrides: Partial<SpotifyPlaybackState> = {}): SpotifyPlaybackState => ({
  device: device(),
  repeat_state: 'off',
  shuffle_state: false,
  context: null,
  progress_ms: 30_000,
  is_playing: true,
  item: playingTrack,
  ...overrides,
});

describe('describePlaybackState', () => {
  test('maps the web api playback payload to the view model', () => {
    const model = describePlaybackState(state(), true, 1_000);
    expect(model).toMatchObject({
      trackId: 't1',
      title: 'Private Landing',
      artistsLine: 'Don Toliver, Justin Bieber',
      albumName: 'Love Sick',
      artUrl: 'https://i.scdn.co/art',
      durationMs: 238_000,
      progressMs: 30_000,
      isPlaying: true,
      shuffle: false,
      repeat: 'off',
      deviceName: 'This PC',
      volumePercent: 55,
      liked: true,
    });
  });

  test('returns null when no track item exists', () => {
    expect(describePlaybackState(state({ item: null }), null, 0)).toBeNull();
  });

  test('null progress is treated as the full track when finished', () => {
    const model = describePlaybackState(state({ progress_ms: null, is_playing: false }), null, 0);
    expect(model?.progressMs).toBe(238_000);
  });
});

describe('projectedProgressMs', () => {
  test('advances from the sampled position while playing', () => {
    expect(projectedProgressMs(30_000, true, 1_000, 4_000)).toBe(33_000);
  });

  test('stays at the sampled position when paused or when the clock runs backwards', () => {
    expect(projectedProgressMs(30_000, false, 1_000, 4_000)).toBe(30_000);
    expect(projectedProgressMs(30_000, true, 5_000, 4_000)).toBe(30_000);
  });
});

describe('progressRatio', () => {
  test('clamps into 0..1 and handles a zero duration', () => {
    expect(progressRatio(60_000, 240_000)).toBe(0.25);
    expect(progressRatio(-5, 240_000)).toBe(0);
    expect(progressRatio(500_000, 240_000)).toBe(1);
    expect(progressRatio(10_000, 0)).toBe(0);
  });
});

describe('nextRepeatState', () => {
  test('cycles off → track → context → off', () => {
    expect(nextRepeatState('off')).toBe('track');
    expect(nextRepeatState('track')).toBe('context');
    expect(nextRepeatState('context')).toBe('off');
  });
});

describe('clampedVolume', () => {
  test('applies deltas within bounds and clamps overshoot', () => {
    expect(clampedVolume(50, 10)).toBe(60);
    expect(clampedVolume(50, -10)).toBe(40);
    expect(clampedVolume(95, 10)).toBe(100);
    expect(clampedVolume(5, -10)).toBe(0);
  });
});
