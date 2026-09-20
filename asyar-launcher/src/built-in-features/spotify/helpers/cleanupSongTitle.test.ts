import { describe, it, expect } from 'vitest';
import { cleanupSongTitle } from './cleanupSongTitle';

describe('cleanupSongTitle', () => {
  it('strips a spaced hyphen suffix', () => {
    expect(cleanupSongTitle('Song Name - Remastered 2011')).toBe('Song Name');
  });

  it('strips a parenthetical suffix', () => {
    expect(cleanupSongTitle('Song Name (Radio Edit)')).toBe('Song Name');
  });

  it('strips a bracket suffix', () => {
    expect(cleanupSongTitle('Song Name [Live]')).toBe('Song Name');
  });

  it('strips a feat. suffix', () => {
    expect(cleanupSongTitle('Song Name feat. Someone')).toBe('Song Name');
  });

  it('strips an ft. suffix', () => {
    expect(cleanupSongTitle('Song Name ft. Someone')).toBe('Song Name');
  });

  it('strips a featuring suffix', () => {
    expect(cleanupSongTitle('Song Name featuring Someone')).toBe('Song Name');
  });

  it('keeps a title that starts with a parenthesis', () => {
    expect(cleanupSongTitle('(Reprise) Main Theme')).toBe('(Reprise) Main Theme');
  });

  it('keeps a title that starts with feat.', () => {
    expect(cleanupSongTitle('feat. Guest Artist')).toBe('feat. Guest Artist');
  });

  it('uses the earliest cutoff among all markers', () => {
    expect(cleanupSongTitle('Song (Edit) - Remaster')).toBe('Song');
  });

  it('leaves a clean title untouched', () => {
    expect(cleanupSongTitle('Just A Song')).toBe('Just A Song');
  });

  it('is case-insensitive about feat.', () => {
    expect(cleanupSongTitle('Song FEAT. Someone')).toBe('Song');
  });

  it('trims trailing whitespace at the cutoff', () => {
    expect(cleanupSongTitle('Song   - Remaster')).toBe('Song');
  });
});
