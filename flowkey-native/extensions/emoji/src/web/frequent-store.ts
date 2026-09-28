import type { FlowKeyCapabilities } from '@flowkey-cli/native-sdk';
import { FREQUENT_SEED, parseFrequent } from '../frequent';

/**
 * Persistence for the user's Frequently Used list. The shell owns the store and
 * slices it per extension id, so the key only has to be stable inside FlowKey.
 */
const STORAGE_KEY = 'frequently-used';

/**
 * The stored list, or the curated seed when nothing is saved yet. A storage
 * failure (declined, locked, corrupt) falls back to the seed rather than
 * leaving the picker empty — the list still works for this session.
 */
export async function loadFrequent(storage: FlowKeyCapabilities['storage']): Promise<string[]> {
  try {
    const saved = parseFrequent(await storage.get(STORAGE_KEY));
    return saved ?? [...FREQUENT_SEED];
  } catch {
    return [...FREQUENT_SEED];
  }
}

/** Persists the list. Returns whether it was written, so the surface can say so. */
export async function saveFrequent(
  storage: FlowKeyCapabilities['storage'],
  glyphs: readonly string[],
): Promise<boolean> {
  try {
    await storage.set(STORAGE_KEY, [...glyphs]);
    return true;
  } catch {
    return false;
  }
}
