import { defineExtension, type UiItem, type UiSection, type ExtensionModule } from '@flowkey/native-sdk';
import catalog from '../data/emoji.json';

interface GemojiRecord {
  emoji: string;
  description: string;
  category: string;
  aliases?: string[];
  tags?: string[];
}

const DATA = catalog as GemojiRecord[];
const recents: string[] = [];

function score(record: GemojiRecord, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const description = record.description.toLowerCase();
  if (description === q) return 100;
  if (description.startsWith(q)) return 80;
  if (description.split(/\s+/).some((w) => w.startsWith(q))) return 60;
  if ((record.aliases ?? []).some((a) => a.toLowerCase() === q)) return 70;
  if ((record.aliases ?? []).some((a) => a.toLowerCase().startsWith(q))) return 55;
  if ((record.tags ?? []).some((t) => t.toLowerCase() === q)) return 45;
  if ((record.tags ?? []).some((t) => t.toLowerCase().includes(q))) return 30;
  return 0;
}

function item(record: GemojiRecord): UiItem {
  const alias = record.aliases?.[0];
  return {
    id: record.emoji,
    title: `${record.emoji} ${titleCase(record.description)}`,
    subtitle: [alias ? `:${alias}:` : null, ...(record.tags ?? [])].filter(Boolean).join('  '),
    icon: record.emoji,
    actions: [{ id: 'copy', title: 'Copy', primary: true }],
  };
}

function titleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

function sectionFor(title: string, items: UiItem[]): UiSection | null {
  return items.length > 0 ? { title, items } : null;
}

const CATEGORIES = [
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

export default defineExtension({
  manifest: {
    id: 'emoji',
    name: 'Emoji',
    version: '2.0.0',
    description: 'Emoji picker with categories and keyword search.',
    icon: '😀',
    commands: [{ id: 'open', title: 'Emoji & Symbols', keywords: ['emoji', 'symbol'] }, { id: 'grid', title: 'Emoji Grid', keywords: ['emoji', 'grid', 'pick'], mode: 'view' }],
    nativeMethods: ['clipboard.write'],
    httpHosts: [],
  },
  handlers: {
    async search(query, ctx) {
      if (ctx.commandId === 'grid') {
        return {
          type: 'grid',
          title: 'Results',
          columns: 8,
          items: DATA.map((r) => ({
            id: r.emoji,
            title: r.description,
            icon: r.emoji,
            actions: [{ id: 'copy', title: 'Copy', primary: true }],
          })),
          emptyView: { title: 'No emoji' },
        };
      }
      const q = query.trim().toLowerCase();
      const emptyView = { title: 'No matches', description: 'Try another keyword' };

      if (!q) {
        const recentItems = recents
          .map((char) => DATA.find((r) => r.emoji === char))
          .filter((r): r is GemojiRecord => Boolean(r))
          .map(item);
        const sections = [
          sectionFor('Frequently Used', recentItems),
          ...CATEGORIES.map((c) => sectionFor(c, DATA.filter((r) => r.category === c).map(item))),
        ].filter((s): s is UiSection => s !== null);
        return { type: 'list', sections, emptyView };
      }

      const ranked = DATA.map((r) => ({ r, s: score(r, q) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 200)
        .map((x) => item(x.r));

      const sections = [sectionFor('Emoji', ranked)].filter((s): s is UiSection => s !== null);
      return { type: 'list', sections, emptyView };
    },
    async onAction(actionId, itemRecord, ctx) {
      if (!itemRecord) return null;
      if (actionId === 'copy') {
        if (!recents.includes(itemRecord.id)) {
          recents.unshift(itemRecord.id);
          if (recents.length > 20) recents.pop();
        }
        await ctx.native.call('clipboard.write', { text: itemRecord.id });
      }
      return null;
    },
  } as ExtensionModule['handlers'],
});
