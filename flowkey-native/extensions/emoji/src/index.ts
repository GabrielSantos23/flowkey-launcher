import { defineExtension, type ExtensionModule } from '@flowkey/native-sdk';
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

export default defineExtension({
  manifest: {
    id: 'emoji',
    name: 'Emoji',
    version: '2.0.0',
    description: 'Emoji picker with categories and keyword search.',
    icon: '😀',
    commands: [
      { id: 'open', title: 'Emoji & Symbols', keywords: ['emoji', 'symbol'], icon: 'smile', iconColor: '#4F8CFF' },
    ],
    nativeMethods: ['clipboard.write'],
    httpHosts: [],
  },
  handlers: {
    async search(query, ctx) {
      if (ctx.commandId === 'open') {
        const q = query.trim().toLowerCase();
        const matches = q
          ? DATA.filter(
              (r) =>
                r.description.toLowerCase().includes(q) ||
                (r.aliases ?? []).some((a) => a.toLowerCase().includes(q)) ||
                (r.tags ?? []).some((t) => t.toLowerCase().includes(q)),
            )
          : DATA;
        return {
          type: 'grid',
          title: 'Results',
          columns: 8,
          items: matches.map((r) => ({
            id: r.emoji,
            title: r.description,
            icon: r.emoji,
            actions: [{ id: 'copy', title: 'Copy', primary: true }],
          })),
          emptyView: { title: 'No emoji', description: 'Try another keyword' },
        };
      }
      return {
        type: 'list',
        sections: [],
        emptyView: { title: 'Emoji & Symbols', description: 'Run the command to open the grid' },
      };
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
