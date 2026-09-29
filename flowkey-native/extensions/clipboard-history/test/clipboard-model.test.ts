import { describe, expect, test } from 'bun:test';
import type { ClipboardEntry } from '../src/web/context';
import {
  dayLabel,
  detailFields,
  entrySections,
  formatBytes,
  formatCopiedTime,
  isLightColor,
  previewText,
  selectionAfterRemoval,
  selectionForEntries,
  typeLabel,
} from '../src/web/clipboard-model';

function entry(overrides: Partial<ClipboardEntry>): ClipboardEntry {
  return {
    id: 'id',
    text: '',
    timestamp: 0,
    kind: 'text',
    iconUri: null,
    previewImageUri: null,
    source: null,
    sourceIconUri: null,
    width: 0,
    height: 0,
    sizeBytes: 0,
    ...overrides,
  };
}

// a fixed "now": 2026-09-28 12:00 local time
const NOW = new Date(2026, 8, 28, 12, 0, 0).getTime();

describe('previewText', () => {
  test('image entries name the dimensions', () => {
    expect(previewText(entry({ kind: 'image', width: 1280, height: 720 }))).toBe(
      'Image (1280×720)',
    );
  });

  test('file entries count the paths', () => {
    expect(previewText(entry({ kind: 'file', text: 'C:\\a\nC:\\b' }))).toBe('2 files');
    expect(previewText(entry({ kind: 'file', text: 'C:\\a' }))).toBe('1 file');
  });

  test('text collapses whitespace, caps and falls back for empties', () => {
    expect(previewText(entry({ text: '  hello\n  world  ' }))).toBe('hello world');
    expect(previewText(entry({ text: 'x'.repeat(200) }))).toBe('x'.repeat(120) + '…');
    expect(previewText(entry({ text: '' }))).toBe('(empty)');
  });
});

describe('typeLabel', () => {
  test('labels every kind', () => {
    expect(typeLabel('text')).toBe('Text');
    expect(typeLabel('link')).toBe('Link');
    expect(typeLabel('email')).toBe('Email Address');
    expect(typeLabel('file')).toBe('File');
    expect(typeLabel('image')).toBe('Image');
    expect(typeLabel('color')).toBe('Color');
  });
});

describe('entrySections', () => {
  test('groups consecutive entries by calendar day', () => {
    const today = NOW - 60_000;
    const yesterday = NOW - 24 * 60 * 60 * 1000 - 60_000;
    const older = NOW - 5 * 24 * 60 * 60 * 1000;
    const sections = entrySections(
      [
        entry({ id: 'a', timestamp: today }),
        entry({ id: 'b', timestamp: today - 60_000 }),
        entry({ id: 'c', timestamp: yesterday }),
        entry({ id: 'd', timestamp: older }),
      ],
      NOW,
    );
    // day names come from the system locale — compare against the same call
    const weekday = new Date(older).toLocaleDateString(undefined, { weekday: 'long' });
    expect(sections.map((section) => section.title)).toEqual(['Today', 'Yesterday', weekday]);
    expect(sections[0].entries.map((e) => e.id)).toEqual(['a', 'b']);
    expect(sections[2].entries.map((e) => e.id)).toEqual(['d']);
  });

  test('labels keep the year when the entry is from another year', () => {
    const label = dayLabel(new Date(2024, 8, 28, 10).getTime(), NOW);
    expect(label).toContain('2024');
  });
});

describe('formatBytes', () => {
  test('scales to human units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1.7 * 1024 * 1024)).toBe('1.7 MB');
  });
});

describe('isLightColor', () => {
  test('classifies short and long hex', () => {
    expect(isLightColor('#FFFFFF')).toBe(true);
    expect(isLightColor('#F54927')).toBe(false);
    expect(isLightColor('#0FF')).toBe(true);
    expect(isLightColor('#GGGGGG')).toBe(false);
    expect(isLightColor('not a color')).toBe(false);
  });
});

describe('formatCopiedTime', () => {
  test('prefixes today and yesterday with the day name', () => {
    const at = NOW - 60_000;
    expect(formatCopiedTime(at, NOW).startsWith('Today at')).toBe(true);
    const yesterday = NOW - 24 * 60 * 60 * 1000;
    expect(formatCopiedTime(yesterday, NOW).startsWith('Yesterday at')).toBe(true);
  });
});

describe('detailFields', () => {
  test('images carry source, type, dimensions and size', () => {
    const fields = detailFields(
      entry({ kind: 'image', source: 'ShareX', width: 100, height: 50, sizeBytes: 2048 }),
    );
    expect(fields.map((field) => field.label)).toEqual(['Source', 'Type', 'Dimensions', 'Size']);
    expect(fields[2].value).toBe('100×50');
    expect(fields[3].value).toBe('2 KB');
  });

  test('unknown sources say so', () => {
    const fields = detailFields(entry({ kind: 'text', text: 'abc', sizeBytes: 3 }));
    expect(fields[0].value).toBe('Unknown');
    expect(fields[2]).toEqual({ label: 'Characters', value: '3' });
  });
});

describe('selection helpers', () => {
  const list = [entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })];

  test('removal keeps the neighbour', () => {
    expect(selectionAfterRemoval(list, 'b')).toBe('c');
    // removing the tail selects the new last row
    expect(selectionAfterRemoval(list, 'c')).toBe('b');
    expect(selectionAfterRemoval(list, null)).toBe('a');
    expect(selectionAfterRemoval([], 'a')).toBeNull();
  });

  test('selection falls back to the top when it disappeared', () => {
    expect(selectionForEntries(list, 'b')).toBe('b');
    expect(selectionForEntries(list, 'gone')).toBe('a');
    expect(selectionForEntries([], 'a')).toBeNull();
  });
});
