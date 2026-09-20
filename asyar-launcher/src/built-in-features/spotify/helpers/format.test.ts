import { describe, it, expect } from 'vitest';
import { formatDuration, artistNames, trackUrl } from './format';

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(210_000)).toBe('3:30');
  });
  it('pads seconds', () => {
    expect(formatDuration(61_000)).toBe('1:01');
  });
  it('prepends hours when present', () => {
    expect(formatDuration(3_660_000)).toBe('1:01:00');
  });
  it('clamps negatives to zero', () => {
    expect(formatDuration(-5)).toBe('0:00');
  });
});

describe('artistNames', () => {
  it('joins artist names with commas', () => {
    expect(artistNames([{ name: 'A' }, { name: 'B' }])).toBe('A, B');
  });
  it('returns an empty string for no artists', () => {
    expect(artistNames([])).toBe('');
  });
});

describe('trackUrl', () => {
  it('converts a track URI to an open.spotify.com URL', () => {
    expect(trackUrl('spotify:track:4uLU6hMCjMI75M1A2tKUQC')).toBe(
      'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    );
  });
});
