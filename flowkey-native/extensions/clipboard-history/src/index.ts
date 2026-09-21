import { defineExtension, type UiItem, type ExtensionModule } from '@flowkey/native-sdk';
import manifestJson from '../manifest.json';

interface HistoryItem {
  id: string;
  text: string;
  timestamp: number;
  kind?: 'text' | 'image';
  iconUri?: string;
  previewImageUri?: string;
  source?: string;
  width?: number;
  height?: number;
}

let lastQuery = '';

function toUiItem(entry: HistoryItem, showTimestamps: boolean): UiItem {
  const isImage = entry.kind === 'image';
  const time = showTimestamps ? new Date(entry.timestamp).toLocaleTimeString() : undefined;
  const subtitle = [entry.source, time].filter(Boolean).join(' · ') || undefined;
  const preview = entry.text.replace(/\s+/g, ' ').slice(0, 80);
  const pane = {
    preview: isImage ? undefined : entry.text,
    previewImageUri: entry.previewImageUri,
    fields: isImage
      ? [
          { label: 'Source', value: entry.source ?? 'Unknown' },
          { label: 'Type', value: 'Image' },
          { label: 'Dimensions', value: `${entry.width ?? 0}×${entry.height ?? 0}` },
        ]
      : [
          { label: 'Source', value: entry.source ?? 'Unknown' },
          { label: 'Type', value: 'Text' },
          { label: 'Characters', value: String(entry.text.length) },
        ],
  };
  return {
    id: entry.id,
    title: isImage ? `Image (${entry.width ?? 0}×${entry.height ?? 0})` : preview.length > 0 ? preview : '(empty)',
    subtitle,
    kind: isImage ? 'Image' : undefined,
    iconUri: isImage ? entry.iconUri : undefined,
    pane,
    actions: [
      { id: 'paste', title: 'Paste', primary: true },
      { id: 'copy', title: 'Copy to Clipboard' },
      { id: 'edit', title: 'Edit' },
      { id: 'delete', title: 'Remove from history' },
    ],
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
      const filterValue = (ctx.filterValue ?? 'all') as 'all' | 'text' | 'image';
      const result = (await ctx.native.call<{ items: HistoryItem[] }>('clipboard.history', {
        query: q,
        limit: 50,
      })) ?? { items: [] };
      const filtered = result.items.filter(
        (entry) => filterValue === 'all' || (entry.kind ?? 'text') === filterValue,
      );
      const showTimestamps = (ctx.preferences['showTimestamps'] as boolean | undefined) ?? true;
      const items = filtered.map((entry) => toUiItem(entry, showTimestamps));
      return {
        type: 'list',
        layout: 'side-pane',
        filter: {
          options: [
            { label: 'All Types', value: 'all' },
            { label: 'Text', value: 'text' },
            { label: 'Image', value: 'image' },
          ],
        },
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
      if (actionId === 'paste') {
        await ctx.native.call('clipboard.pasteEntry', { id: item.id });
        return null;
      }
      if (actionId === 'edit') {
        await ctx.native.call('clipboard.editEntry', { id: item.id });
        return null;
      }
      if (actionId !== 'copy') {
        return null;
      }
      const full = (await ctx.native.call<{ items: HistoryItem[] }>('clipboard.history', {
        query: lastQuery,
        limit: 50,
      }))?.items.find((h) => h.id === item.id);
      if (full?.kind === 'image') {
        await ctx.native.call('clipboard.copyEntry', { id: item.id });
      } else if (full) {
        await ctx.native.call('clipboard.write', { text: full.text });
      }
      return null;
    },
  } as ExtensionModule['handlers'],
});
