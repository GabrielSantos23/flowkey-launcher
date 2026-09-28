import { describe, expect, test } from 'bun:test';
import {
  activeLineIndex,
  parseLrc,
  projectedPositionMs,
  sameMedia,
  type MediaState,
} from '../src/lyrics';

const media = (overrides: Partial<MediaState> = {}): MediaState => ({
  playing: true,
  title: 'Track',
  artist: 'Artist',
  album: null,
  positionMs: 10_000,
  durationMs: 200_000,
  updatedAtMs: 1_000,
  ...overrides,
});

describe('parseLrc', () => {
  test('parses timestamps into ms and drops empty and non-timestamp lines', () => {
    const source = [
      '[ar: Artist]',
      '[00:01.00]First line',
      '[01:02.500]Second line',
      '[00:03.00]',
      'no timestamp here',
    ].join('\n');

    expect(parseLrc(source)).toEqual([
      { timeMs: 1000, text: 'First line' },
      { timeMs: 62500, text: 'Second line' },
    ]);
  });

  test('parses whole-second timestamps', () => {
    expect(parseLrc('[02:05]Whole seconds')).toEqual([{ timeMs: 125000, text: 'Whole seconds' }]);
  });

  test('returns an empty list for plain lyrics', () => {
    expect(parseLrc('just some words\nmore words')).toEqual([]);
  });
});

describe('projectedPositionMs', () => {
  test('advances with wall-clock time while playing', () => {
    expect(
      projectedPositionMs(media({ positionMs: 10_000, updatedAtMs: 5_000 })),
    ).toBeGreaterThanOrEqual(10_000);
  });

  test('returns the sampled position when paused', () => {
    expect(projectedPositionMs(media({ playing: false, positionMs: 12_345 }))).toBe(12_345);
  });
});

describe('activeLineIndex', () => {
  const lines = [
    { timeMs: 0, text: 'a' },
    { timeMs: 5_000, text: 'b' },
    { timeMs: 9_000, text: 'c' },
  ];

  test('marks the last line whose time has passed', () => {
    expect(activeLineIndex(lines, 0)).toBe(0);
    expect(activeLineIndex(lines, 5_500)).toBe(1);
    expect(activeLineIndex(lines, 90_000)).toBe(2);
  });

  test('reports no active line before the first timestamp', () => {
    expect(activeLineIndex([{ timeMs: 4_000, text: 'x' }], 1_000)).toBe(-1);
  });
});

describe('sameMedia', () => {
  test('same title, state and nearby position are equal', () => {
    const a = media({ positionMs: 10_000, updatedAtMs: 1_000 });
    const b = media({ positionMs: 10_400, updatedAtMs: 1_100 });
    expect(sameMedia(a, b)).toBe(true);
  });

  test('a changed title is a new media state', () => {
    expect(sameMedia(media(), media({ title: 'Other' }))).toBe(false);
  });

  test('null comparisons are never equal', () => {
    expect(sameMedia(null, media())).toBe(false);
    expect(sameMedia(media(), null)).toBe(false);
  });

  test('a large position jump is a new media state (seek or track change)', () => {
    const a = media({ positionMs: 1_000, updatedAtMs: 0 });
    const b = media({ positionMs: 60_000, updatedAtMs: 0 });
    expect(sameMedia(a, b)).toBe(false);
  });
});
