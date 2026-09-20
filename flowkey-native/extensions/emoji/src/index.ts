import { defineExtension, type UiItem, type UiSection, type ExtensionModule } from '@flowkey/native-sdk';
import emojiData from './data/emoji.json';
import symbolsData from './data/symbols.json';
import kaomojiData from './data/kaomoji.json';

interface CatalogRecord {
  char: string;
  name: string;
  shortcode?: string;
  category?: string;
  keywords?: string[];
}

interface KaomojiRecord {
  text: string;
  name: string;
  category?: string;
  keywords?: string[];
}

const EMOJI = emojiData as CatalogRecord[];
const SYMBOLS = symbolsData as CatalogRecord[];
const KAOMOJI = kaomojiData as KaomojiRecord[];

const recents: string[] = [];

function score(record: { name: string; keywords?: string[] }, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const name = record.name.toLowerCase();
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  const words = name.split(/\s+/);
  if (words.some((w) => w.startsWith(q))) return 60;
  const kw = (record.keywords ?? []).find((k) => k.toLowerCase().includes(q));
  if (kw) return 40;
  return 0;
}

function emojiItem(record: CatalogRecord): UiItem {
  return {
    id: record.char,
    title: `${record.char} ${titleCase(record.name)}`,
    subtitle: record.keywords?.slice(0, 4).join(', '),
    icon: record.char,
    actions: [{ id: 'copy', title: 'Copy', primary: true }],
  };
}

function titleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

function sectionFor(title: string, items: UiItem[]): UiSection | null {
  return items.length > 0 ? { title, items } : null;
}

export default defineExtension({
  manifest: {
    id: 'emoji',
    name: 'Emoji',
    version: '1.0.0',
    description: 'Emoji, symbol, and kaomoji picker with categories and keyword search.',
    icon: '😀',
    commands: [{ id: 'open', title: 'Emoji & Symbols' }],
    nativeMethods: ['clipboard.write'],
    httpHosts: [],
  },
  handlers: {
    async search(query) {
      const q = query.trim().toLowerCase();
      if (!q) {
        const recentItems = recents
          .map((char) => [...EMOJI, ...SYMBOLS].find((r) => r.char === char))
          .filter((r): r is CatalogRecord => Boolean(r))
          .map(emojiItem);
        const sections = [
          sectionFor('Frequently Used', recentItems),
          sectionFor(
            'Smileys & People',
            EMOJI.filter((r) => r.category === 'smileys-people').slice(0, 60).map(emojiItem),
          ),
          sectionFor(
            'Symbols',
            SYMBOLS.slice(0, 60).map(emojiItem),
          ),
          sectionFor(
            'Kaomoji',
            KAOMOJI.slice(0, 30).map((k) => ({
              id: k.text,
              title: k.text,
              subtitle: k.name,
              actions: [{ id: 'copy', title: 'Copy', primary: true }],
            })),
          ),
        ].filter((s): s is UiSection => s !== null);
        return { type: 'list', sections, emptyView: { title: 'No matches', description: 'Try another keyword' } };
      }

      const ranked = [...EMOJI, ...SYMBOLS]
        .map((r) => ({ r, s: score(r, q) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 100)
        .map((x) => emojiItem(x.r));

      const kaomojiItems = KAOMOJI.filter(
        (k) => k.name.toLowerCase().includes(q) || (k.keywords ?? []).some((kw) => kw.toLowerCase().includes(q)),
      )
        .slice(0, 30)
        .map((k) => ({
          id: k.text,
          title: k.text,
          subtitle: k.name,
          actions: [{ id: 'copy', title: 'Copy', primary: true }],
        }));

      const sections = [
        sectionFor('Emoji', ranked),
        sectionFor('Kaomoji', kaomojiItems),
      ].filter((s): s is UiSection => s !== null);

      return { type: 'list', sections, emptyView: { title: 'No matches', description: 'Try another keyword' } };
    },
    async onAction(actionId, item, ctx) {
      if (!item) return null;
      if (actionId === 'copy') {
        if (!recents.includes(item.id)) {
          recents.unshift(item.id);
          if (recents.length > 20) recents.pop();
        }
        await ctx.native.call('clipboard.write', { text: item.id });
        return null;
      }
      return null;
    },
  } as ExtensionModule['handlers'],
});
