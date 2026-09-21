import { defineExtension, type UiItem, type ExtensionModule } from '@flowkey/native-sdk';
import manifestJson from '../manifest.json';

interface HistoryItem {
  id: string;
  text: string;
  timestamp: number;
}

let lastQuery = '';

function toUiItem(entry: HistoryItem, showTimestamps: boolean): UiItem {
  const preview = entry.text.replace(/\s+/g, ' ').slice(0, 80);
  return {
    id: entry.id,
    title: preview.length > 0 ? preview : '(empty)',
    subtitle: showTimestamps ? new Date(entry.timestamp).toLocaleTimeString() : undefined,
    actions: [{ id: 'copy', title: 'Copy', primary: true }, { id: 'delete', title: 'Remove from history' }],
  };
}

export default defineExtension({
  manifest: manifestJson as unknown as ExtensionModule['manifest'],
  handlers: {
    async command(commandId, ctx) {
      if (commandId === 'clear') {
        await ctx.native.call('clipboard.clearHistory', {});
      }
    },
    async search(query, ctx) {
      const q = query.trim();
      lastQuery = q;
      const result = (await ctx.native.call<{ items: HistoryItem[] }>('clipboard.history', {
        query: q,
        limit: 50,
      })) ?? { items: [] };
      const showTimestamps = (ctx.preferences['showTimestamps'] as boolean | undefined) ?? true;
      const items = result.items.map((entry) => toUiItem(entry, showTimestamps));
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
      if (actionId === 'delete') {
        await ctx.native.call('clipboard.deleteEntry', { id: item.id });
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
