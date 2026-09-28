import catalog from '../data/emoji.json';

export const GRID_COLUMNS = 8;

export const FREQUENT_SECTION_ID = 'frequent';

export const FREQUENT_SECTION_TITLE = 'Frequently Used';

/** gemoji ships its categories in this order; the filter dropdown follows it. */
export const CATEGORY_FILTERS: readonly string[] = [
  'Smileys & Emotion',
  'People & Body',
  'Animals & Nature',
  'Food & Drink',
  'Travel & Places',
  'Activities',
  'Objects',
  'Symbols',
  'Flags',
];

export interface EmojiEntry {
  readonly emoji: string;
  readonly name: string;
  readonly category: string;
}

export interface EmojiSection {
  readonly id: string;
  readonly title: string;
  readonly count: number;
  readonly items: readonly EmojiEntry[];
}

interface GemojiRecord {
  readonly emoji: string;
  readonly description: string;
  readonly category: string;
  readonly aliases?: readonly string[];
  readonly tags?: readonly string[];
}

/** The curated opener: the sixteen a picker leads with, in order. */
const FREQUENT_GLYPHS: readonly string[] = [
  '\u{1F92A}',
  '\u{1F60D}',
  '\u{1F929}',
  '\u{1F61C}',
  '\u{1F644}',
  '\u{1F614}',
  '\u{1F634}',
  '\u{1F60E}',
  '\u{1F913}',
  '\u{1F62E}',
  '\u{1F622}',
  '\u{1F631}',
  '\u{1F44A}',
  '\u261D\uFE0F',
  '\u{1F595}',
  '\u{1F64F}',
];

const RECORDS = catalog as readonly GemojiRecord[];

export const CATALOG: readonly EmojiEntry[] = RECORDS.map((record) => ({
  emoji: record.emoji,
  name: record.description,
  category: record.category,
}));

// Searchable text (name, aliases, tags) is kept beside the entries so the
// entries stay exactly the three fields the shell and the grid need.
const KEYWORDS: ReadonlyMap<string, string> = new Map(
  RECORDS.map((record) => [
    record.emoji,
    [record.description, ...(record.aliases ?? []), ...(record.tags ?? [])].join(' ').toLowerCase(),
  ]),
);

const BY_GLYPH: ReadonlyMap<string, EmojiEntry> = new Map(
  CATALOG.map((entry) => [entry.emoji, entry]),
);

const CATEGORY_BY_LOWER_NAME: ReadonlyMap<string, string> = new Map(
  CATEGORY_FILTERS.map((name) => [name.toLowerCase(), name]),
);

export const FREQUENTLY_USED: readonly EmojiEntry[] = FREQUENT_GLYPHS.map((glyph) =>
  BY_GLYPH.get(glyph),
).filter((entry): entry is EmojiEntry => entry !== undefined);

/** The curated opener as plain glyphs — the list a user starts from. */
export const FREQUENT_SEED_GLYPHS: readonly string[] = FREQUENTLY_USED.map((entry) => entry.emoji);

/** Whether the catalog offers this glyph at all. */
export function isKnownEmoji(glyph: string): boolean {
  return BY_GLYPH.has(glyph);
}

const CATEGORY_COUNTS: ReadonlyMap<string, number> = (() => {
  const counts = new Map<string, number>();
  for (const name of CATEGORY_FILTERS) {
    counts.set(name, 0);
  }
  for (const entry of CATALOG) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  }
  return counts;
})();

export function catalogSize(): number {
  return CATALOG.length;
}

/** Names an emoji the way the shell footer reads it ("Upside-Down Face"). */
export function selectionTitle(entry: EmojiEntry): string {
  return entry.name.replace(
    /(^|[\s‐-―-])([a-z])/gu,
    (_match, separator: string, letter: string) => separator + letter.toUpperCase(),
  );
}

/**
 * The shell's search-bar filter dropdown, with the default option first so the
 * button reads "All Categories" before anything is selected.
 */
export function filterOptions(): Array<{ value: string; label: string }> {
  return [
    { value: 'all', label: 'All Categories' },
    ...CATEGORY_FILTERS.map((name) => ({
      value: name,
      label: `${name} (${CATEGORY_COUNTS.get(name) ?? 0})`,
    })),
  ];
}

/**
 * The sections to render for a query and a category filter: the user's
 * frequently used list only while browsing everything, then the gemoji
 * categories in order.
 */
export function searchSections(
  query: string,
  category: string,
  frequent: readonly string[] = FREQUENT_SEED_GLYPHS,
): EmojiSection[] {
  const needle = query.trim().toLowerCase();
  // the filter value comes from the shell's dropdown, so match it by name
  const wanted = CATEGORY_BY_LOWER_NAME.get(category.trim().toLowerCase());
  const limited = wanted !== undefined;
  const matches =
    needle === ''
      ? CATALOG
      : CATALOG.filter((entry) => KEYWORDS.get(entry.emoji)?.includes(needle) === true);

  if (limited) {
    const items = matches.filter((entry) => entry.category === wanted);
    return items.length === 0 ? [] : [{ id: wanted, title: wanted, count: items.length, items }];
  }

  const sections: EmojiSection[] = [];
  if (needle === '') {
    // a saved list can name emoji the catalog no longer ships
    const frequentItems = frequent
      .map((glyph) => BY_GLYPH.get(glyph))
      .filter((entry): entry is EmojiEntry => entry !== undefined);
    if (frequentItems.length > 0) {
      sections.push({
        id: FREQUENT_SECTION_ID,
        title: FREQUENT_SECTION_TITLE,
        count: frequentItems.length,
        items: frequentItems,
      });
    }
  }
  for (const name of CATEGORY_FILTERS) {
    const items = matches.filter((entry) => entry.category === name);
    if (items.length > 0) {
      sections.push({ id: name, title: name, count: items.length, items });
    }
  }
  return sections;
}

/** Every emoji in render order, across sections. */
export function flattenEmoji(sections: readonly EmojiSection[]): readonly EmojiEntry[] {
  return sections.flatMap((section) => section.items);
}

/**
 * Where the selection lands after a search: kept when it is still offered,
 * otherwise the first emoji (or -1 when there is nothing to select).
 */
export function selectionAfterSearch(
  sections: readonly EmojiSection[],
  glyph: string | null,
): number {
  if (flattenEmoji(sections).length === 0) {
    return -1;
  }
  const index =
    glyph === null ? -1 : flattenEmoji(sections).findIndex((entry) => entry.emoji === glyph);
  return index < 0 ? 0 : index;
}

/**
 * Grid movement that matches the shell's native grid maths: horizontal steps
 * refuse to leave the row, vertical steps refuse to land on a missing row.
 */
export function moveIndex(
  from: number,
  total: number,
  columns: number,
  columnDelta: number,
  rowDelta: number,
): number {
  if (total <= 0 || from < 0 || from >= total) {
    return -1;
  }
  const row = Math.floor(from / columns);
  const column = from % columns;
  const nextColumn = column + columnDelta;
  if (row + rowDelta < 0 || nextColumn < 0 || nextColumn >= columns) {
    return -1;
  }
  const next = (row + rowDelta) * columns + nextColumn;
  return next < total ? next : -1;
}
