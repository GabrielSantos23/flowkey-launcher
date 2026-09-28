import { describe, expect, test } from 'bun:test';
import {
  CATEGORY_FILTERS,
  FREQUENTLY_USED,
  GRID_COLUMNS,
  catalogSize,
  filterOptions,
  moveIndex,
  searchSections,
  selectionAfterSearch,
  selectionTitle,
} from '../src/emoji-model';

describe('catalog', () => {
  test('carries every packaged gemoji record', () => {
    expect(catalogSize()).toBe(1870);
  });

  test('the frequently used set is exactly the curated sixteen', () => {
    expect(FREQUENTLY_USED).toHaveLength(16);
    expect(FREQUENTLY_USED[0]).toEqual({
      emoji: '🤪',
      name: 'zany face',
      category: 'Smileys & Emotion',
    });
    // every curated glyph resolves in the dataset (a lost variation selector
    // would silently shorten the list)
    expect(FREQUENTLY_USED.every((entry) => entry.name !== '')).toBe(true);
  });
});

describe('selectionTitle', () => {
  test('names the emoji for the shell footer, hyphenated words included', () => {
    expect(
      selectionTitle({ emoji: '🙃', name: 'upside-down face', category: 'Smileys & Emotion' }),
    ).toBe('Upside-Down Face');
    expect(
      selectionTitle({
        emoji: '🙄',
        name: 'face with rolling eyes',
        category: 'Smileys & Emotion',
      }),
    ).toBe('Face With Rolling Eyes');
  });
});

describe('filterOptions', () => {
  test('leads with All Categories so the shell button reads that by default', () => {
    expect(filterOptions()[0]).toEqual({ value: 'all', label: 'All Categories' });
  });

  test('offers every category with its size', () => {
    const options = filterOptions();
    const smileys = options.find((option) => option.value === 'Smileys & Emotion');
    expect(smileys?.label).toBe('Smileys & Emotion (166)');
    expect(options).toHaveLength(1 + CATEGORY_FILTERS.length);
  });
});

describe('searchSections', () => {
  test('an empty query with no category filter shows frequent then every category', () => {
    const sections = searchSections('', 'all');
    expect(sections[0]).toMatchObject({ id: 'frequent', title: 'Frequently Used', count: 16 });
    expect(sections).toHaveLength(1 + CATEGORY_FILTERS.length);
    expect(sections[1].title).toBe('Smileys & Emotion');
  });

  test('a category filter shows only that category, without the frequent set', () => {
    const sections = searchSections('', 'Flags');
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ title: 'Flags', count: 269 });
  });

  test('a query searches names, aliases and tags, grouped by category', () => {
    const sections = searchSections('thumbs', 'all');
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.every((section) => section.id !== 'frequent')).toBe(true);
    const every = sections.flatMap((section) => section.items);
    expect(every.some((item) => item.emoji === '👍')).toBe(true);
    expect(every.some((item) => item.emoji === '🤪')).toBe(false);
    expect(sections.reduce((sum, section) => sum + section.count, 0)).toBe(every.length);
  });

  test('a category filter narrows the search to that category', () => {
    const sections = searchSections('flag', 'Flags');
    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe('Flags');
    expect(sections[0].items.every((item) => item.category === 'Flags')).toBe(true);
  });

  test('a query with no matches yields no sections', () => {
    expect(searchSections('zzzzznope', 'all')).toEqual([]);
  });

  test('searching ignores case and surrounding whitespace', () => {
    expect(searchSections('  THUMBS ', 'all')).toEqual(searchSections('thumbs', 'all'));
  });
});

describe('selectionAfterSearch', () => {
  const sections = searchSections('', 'all');
  const total = sections.reduce((sum, section) => sum + section.items.length, 0);

  test('keeps the selection when the emoji is still there', () => {
    expect(selectionAfterSearch(sections, '🎉')).toBe(
      sections.flatMap((section) => section.items).findIndex((item) => item.emoji === '🎉'),
    );
  });

  test('falls back to the first emoji when the selection is gone', () => {
    expect(selectionAfterSearch(searchSections('thumbs', 'all'), '🎉')).toBe(0);
    expect(selectionAfterSearch(sections, 'nope')).toBe(0);
  });

  test('is minus one when there is nothing to select', () => {
    expect(selectionAfterSearch([], '🎉')).toBe(-1);
  });

  test('the first emoji of the first section is the frequent one', () => {
    expect(total).toBeGreaterThan(16);
    expect(sections[0].items[0].emoji).toBe('🤪');
  });
});

describe('moveIndex', () => {
  test('moves within a row and across rows by the column count', () => {
    expect(moveIndex(0, 40, GRID_COLUMNS, 1, 0)).toBe(1);
    expect(moveIndex(0, 40, GRID_COLUMNS, 0, 1)).toBe(GRID_COLUMNS);
    expect(moveIndex(GRID_COLUMNS, 40, GRID_COLUMNS, 0, -1)).toBe(0);
  });

  test('refuses to leave the grid', () => {
    expect(moveIndex(0, 40, GRID_COLUMNS, -1, 0)).toBe(-1);
    expect(moveIndex(GRID_COLUMNS - 1, 40, GRID_COLUMNS, 1, 0)).toBe(-1);
    expect(moveIndex(0, 40, GRID_COLUMNS, 0, -1)).toBe(-1);
  });

  test('refuses to land on a row that does not exist', () => {
    // 10 items in 8 columns: the second row holds two, the third none
    expect(moveIndex(9, 10, GRID_COLUMNS, 0, 1)).toBe(-1);
    expect(moveIndex(1, 10, GRID_COLUMNS, 1, 1)).toBe(-1);
    expect(moveIndex(1, 10, GRID_COLUMNS, 0, 1)).toBe(9);
  });

  test('handles an empty grid', () => {
    expect(moveIndex(0, 0, GRID_COLUMNS, 0, 1)).toBe(-1);
  });
});
