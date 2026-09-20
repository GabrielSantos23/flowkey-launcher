import { defineExtension, type UiItem, type ExtensionModule } from '@flowkey/native-sdk';

interface HistoryItem {
  id: string;
  text: string;
  timestamp: number;
}

let lastQuery = '';

function toUiItem(entry: HistoryItem): UiItem {
  const preview = entry.text.replace(/\s+/g, ' ').slice(0, 80);
  return {
    id: entry.id,
    title: preview.length > 0 ? preview : '(empty)',
    subtitle: new Date(entry.timestamp).toLocaleTimeString(),
    actions: [{ id: 'copy', title: 'Copy', primary: true }],
  };
}

export default defineExtension({
  manifest: {
    id: 'clipboard-history',
    name: 'Clipboard History',
    version: '1.0.0',
    description: 'Browse and re-copy recent clipboard text.',
    icon: '📋',
    commands: [
      { id: 'open', title: 'Clipboard History' },
      { id: 'clear', title: 'Clear Clipboard History' },
    ],
    nativeMethods: ['clipboard.read', 'clipboard.history', 'clipboard.clearHistory', 'clipboard.write'],
    httpHosts: [],
  },
  handlers: {
    async search(query, ctx) {
      const q = query.trim();
      if (q.toLowerCase() === 'clear') {
        return {
          type: 'list',
          sections: [{
            title: 'Maintenance',
            items: [{ id: '__clear__', title: 'Clear clipboard history', actions: [{ id: 'clearHistory', title: 'Clear', primary: true }] }],
          }],
          emptyView: { title: 'Nothing to clear' },
        };
      }
      lastQuery = q;
      const result = (await ctx.native.call<{ items: HistoryItem[] }>('clipboard.history', {
        query: q,
        limit: 50,
      })) ?? { items: [] };
      const items = result.items.map(toUiItem);
      return {
        type: 'list',
        sections: items.length > 0 ? [{ title: 'Recent', items }] : [],
        emptyView: { title: 'Clipboard history is empty', description: 'Copy some text anywhere' },
      };
    },
    async onAction(actionId, item, ctx) {
      if (!item) {
        return null;
      }
      if (actionId === 'clearHistory') {
        await ctx.native.call('clipboard.clearHistory', {});
        return null;
      }
      if (actionId !== 'copy') {
        return null;
      }
      const full = (await ctx.native.call<{ items: HistoryItem[] }>('clipboard.history', {
        query: lastQuery,
        limit: 50,
      }))?.items.find((h) => h.id === item.id);
      if (full) {
        await ctx.native.call('clipboard.write', { text: full.text });
      }
      return null;
    },
  } as ExtensionModule['handlers'],
});
