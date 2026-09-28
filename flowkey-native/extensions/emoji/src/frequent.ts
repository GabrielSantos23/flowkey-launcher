import { FREQUENT_SEED_GLYPHS, isKnownEmoji } from './emoji-model';

/**
 * The user's "Frequently Used" list. The picker starts from the curated seed and
 * remembers what the user pins instead, most recently pinned first, capped so
 * the section stays one compact block above the categories.
 */
export const FREQUENT_LIMIT = 16;

export const FREQUENT_SEED: readonly string[] = FREQUENT_SEED_GLYPHS;

export function isFrequent(list: readonly string[], glyph: string): boolean {
  return list.includes(glyph);
}

/**
 * Pins an emoji to the front of the list, or unpins it when it is already
 * there. Pinned past the limit, the least recently pinned falls off the end.
 */
export function toggleFrequent(list: readonly string[], glyph: string): string[] {
  if (!isKnownEmoji(glyph)) {
    return dedupe(list).slice(0, FREQUENT_LIMIT);
  }
  if (isFrequent(list, glyph)) {
    return list.filter((entry) => entry !== glyph);
  }
  return [glyph, ...dedupe(list)].slice(0, FREQUENT_LIMIT);
}

/**
 * Reads a saved list. `null` means "nothing usable is stored" — the caller falls
 * back to the seed. An empty array is a real answer: the user unpinned
 * everything and the section should stay hidden.
 */
export function parseFrequent(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const known = value.filter(
    (entry): entry is string => typeof entry === 'string' && isKnownEmoji(entry),
  );
  const list = dedupe(known);
  if (list.length === 0 && value.length > 0) {
    return null; // the stored blob held nothing the catalog knows
  }
  return list.slice(0, FREQUENT_LIMIT);
}

function dedupe(list: readonly string[]): string[] {
  return [...new Set(list)];
}
