import type { MappedSearchItem } from '../../services/search/types/MappedSearchItem';

export type SectionKey = 'favorites' | 'scripts' | 'commands';

export type SectionedRow =
  | { kind: 'header'; title: string; section: SectionKey }
  | { kind: 'item'; item: MappedSearchItem; originalIndex: number };

export function categorizeItem(item: MappedSearchItem): SectionKey {
  // Favorites always lead — the user pinned them above everything else.
  if (item.isFavorite) return 'favorites';
  // Scripts is an activity surface — it displays run rows only.
  // Run-row variants: 'run' (live), 'run-failed' (failed-pending-dismiss),
  // 'run-done' (kept script result). All three route by typeLabel.
  // Definition rows (`cmd_scripts_dyn_*`, all other commands) flow into
  // Commands and rank through the Rust ranker like any other command.
  if (item.type === 'run' || item.type === 'run-failed' || item.type === 'run-done') {
    if (item.typeLabel === 'Script') return 'scripts';
    return 'commands';
  }
  return 'commands';
}

const SECTION_ORDER: SectionKey[] = ['favorites', 'scripts', 'commands'];

const SECTION_TITLES: Record<SectionKey, string> = {
  favorites: 'Favorites',
  scripts: 'Scripts',
  commands: 'Commands',
};

export function buildSectionedView(items: MappedSearchItem[]): SectionedRow[] {
  const buckets: Record<SectionKey, Array<{ item: MappedSearchItem; originalIndex: number }>> = {
    favorites: [],
    scripts: [],
    commands: [],
  };

  for (let i = 0; i < items.length; i++) {
    const key = categorizeItem(items[i]);
    buckets[key].push({ item: items[i], originalIndex: i });
  }

  const rows: SectionedRow[] = [];

  for (const section of SECTION_ORDER) {
    const bucket = buckets[section];
    if (bucket.length === 0) continue;

    rows.push({ kind: 'header', title: SECTION_TITLES[section], section });
    for (const entry of bucket) {
      rows.push({ kind: 'item', item: entry.item, originalIndex: entry.originalIndex });
    }
  }

  return rows;
}
