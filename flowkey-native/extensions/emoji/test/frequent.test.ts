import { describe, expect, test } from 'bun:test';
import {
  FREQUENT_LIMIT,
  FREQUENT_SEED,
  isFrequent,
  parseFrequent,
  toggleFrequent,
} from '../src/frequent';
import { searchSections } from '../src/emoji-model';

describe('the frequently used seed', () => {
  test('is the curated sixteen, most loved first', () => {
    expect(FREQUENT_LIMIT).toBe(16);
    expect(FREQUENT_SEED).toHaveLength(16);
    expect(FREQUENT_SEED[0]).toBe('\u{1F92A}');
  });
});

describe('isFrequent', () => {
  test('reads membership by glyph', () => {
    expect(isFrequent(FREQUENT_SEED, '\u{1F92A}')).toBe(true);
    expect(isFrequent(FREQUENT_SEED, '\u{1F44D}')).toBe(false);
  });
});

describe('toggleFrequent', () => {
  test('adds a new emoji to the front, most recent first', () => {
    expect(toggleFrequent(['\u{1F44D}'], '\u{1F92A}')).toEqual(['\u{1F92A}', '\u{1F44D}']);
  });

  test('removes an emoji the user no longer wants', () => {
    expect(toggleFrequent(['\u{1F92A}', '\u{1F44D}'], '\u{1F92A}')).toEqual(['\u{1F44D}']);
  });

  test('never keeps the same emoji twice', () => {
    // pinning something new grows the list by exactly one, all distinct
    const pinned = toggleFrequent(FREQUENT_SEED.slice(0, 3), '\u{1F44D}');
    expect(pinned).toHaveLength(4);
    expect(new Set(pinned).size).toBe(4);
  });

  test('drops the oldest entry once the section is full', () => {
    const full = FREQUENT_SEED;
    const next = toggleFrequent(full, '\u{1F44D}');
    expect(next).toHaveLength(FREQUENT_LIMIT);
    expect(next[0]).toBe('\u{1F44D}');
    expect(next).not.toContain(full[full.length - 1]);
  });

  test('leaves the seed untouched when toggled', () => {
    const seed = [...FREQUENT_SEED];
    toggleFrequent(seed, '\u{1F44D}');
    expect(seed).toEqual([...FREQUENT_SEED]);
  });

  test('can empty the list completely', () => {
    expect(toggleFrequent(['\u{1F92A}'], '\u{1F92A}')).toEqual([]);
  });
});

describe('parseFrequent', () => {
  test('reads a saved list', () => {
    expect(parseFrequent(['\u{1F44D}', '\u{1F92A}'])).toEqual(['\u{1F44D}', '\u{1F92A}']);
  });

  test('treats an empty list as a deliberate "nothing pinned"', () => {
    expect(parseFrequent([])).toEqual([]);
  });

  test('falls back to the seed when nothing is saved', () => {
    expect(parseFrequent(null)).toBeNull();
    expect(parseFrequent(undefined)).toBeNull();
  });

  test('falls back to the seed when the saved value is not a list', () => {
    expect(parseFrequent('ðŸ¤ª')).toBeNull();
    expect(parseFrequent({ emoji: '\u{1F92A}' })).toBeNull();
    expect(parseFrequent(7)).toBeNull();
  });

  test('drops entries the catalog does not know', () => {
    expect(parseFrequent(['\u{1F44D}', 'not-an-emoji', 42, null])).toEqual(['\u{1F44D}']);
  });

  test('drops duplicates', () => {
    expect(parseFrequent(['\u{1F44D}', '\u{1F44D}', '\u{1F92A}'])).toEqual([
      '\u{1F44D}',
      '\u{1F92A}',
    ]);
  });

  test('caps a saved list that grew past the limit', () => {
    const many = Array.from({ length: 30 }, (_, index) => FREQUENT_SEED[index % 16]);
    expect(parseFrequent(many)).toHaveLength(FREQUENT_LIMIT);
  });

  test('falls back to the seed when nothing in a saved list is usable', () => {
    expect(parseFrequent(['nonsense', 3])).toBeNull();
  });
});

describe('searchSections with a user list', () => {
  test('renders the list the user keeps, in their order', () => {
    const sections = searchSections('', 'all', ['\u{1F44D}', '\u{1F92A}']);
    expect(sections[0]).toMatchObject({ id: 'frequent', title: 'Frequently Used', count: 2 });
    expect(sections[0].items.map((entry) => entry.emoji)).toEqual(['\u{1F44D}', '\u{1F92A}']);
  });

  test('drops saved emoji the catalog no longer knows', () => {
    const sections = searchSections('', 'all', ['nonsense', '\u{1F44D}']);
    expect(sections[0].items.map((entry) => entry.emoji)).toEqual(['\u{1F44D}']);
  });

  test('hides the section when the user empties it', () => {
    const sections = searchSections('', 'all', []);
    expect(sections.some((section) => section.id === 'frequent')).toBe(false);
    expect(sections[0].id).toBe('Smileys & Emotion');
  });

  test('the default is the curated seed', () => {
    expect(searchSections('', 'all')[0].items.map((entry) => entry.emoji)).toEqual([
      ...FREQUENT_SEED,
    ]);
  });

  test('a search never shows the frequently used section', () => {
    expect(
      searchSections('thumbs', 'all', ['\u{1F44D}']).some((section) => section.id === 'frequent'),
    ).toBe(false);
  });

  test('a category filter never shows the frequently used section', () => {
    expect(
      searchSections('', 'Flags', ['\u{1F44D}']).some((section) => section.id === 'frequent'),
    ).toBe(false);
  });
});
