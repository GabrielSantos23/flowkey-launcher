import {
  defineExtension,
  type ExtensionModule,
  type ExtensionContext,
  type UiItem,
  type UiTree,
} from '@flowkey-cli/native-sdk';

interface SnippetRecord {
  text: string;
  addedAtMs: number;
}

type SnippetStore = Record<string, SnippetRecord>;

async function loadSnippets(ctx: ExtensionContext): Promise<SnippetStore> {
  return await ctx.capabilities.storage.allItems<SnippetRecord>();
}

function renderSnippets(snippets: SnippetStore, query: string): UiTree {
  const q = query.trim().toLowerCase();
  const items: UiItem[] = Object.entries(snippets)
    .filter(
      ([name, snippet]) =>
        q.length === 0 || name.toLowerCase().includes(q) || snippet.text.toLowerCase().includes(q),
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, snippet]) => ({
      id: name,
      title: name,
      subtitle: snippet.text,
      kind: 'Snippet',
      iconName: 'scissors',
      actions: [
        { id: 'paste', title: 'Paste into Foreground', primary: true },
        { id: 'copy', title: 'Copy Text' },
        {
          id: 'delete',
          title: 'Delete Snippet',
          style: 'destructive',
          shortcut: { key: 'backspace', modifiers: ['ctrl'] },
        },
      ],
    }));
  return {
    type: 'list',
    sections: items.length > 0 ? [{ items }] : [],
    emptyView: {
      title: q.length > 0 ? 'No matching snippets' : 'No snippets yet',
      description: q.length > 0 ? undefined : 'Run "Add Snippet" to save your first snippet',
    },
  };
}

export default defineExtension({
  manifest: {
    id: 'snippets',
    name: 'Snippets',
    version: '1.0.0',
    description: 'Save and paste text snippets into any app.',
    icon: '✂️',
    commands: [
      {
        id: 'search',
        title: 'Snippets',
        keywords: ['snippets', 'text', 'expand', 'paste'],
        icon: 'scissors',
        iconColor: '#22C55E',
      },
      {
        id: 'add',
        title: 'Add Snippet',
        mode: 'background',
        keywords: ['snippets', 'save', 'create'],
        icon: 'plus',
        iconColor: '#22C55E',
        arguments: [
          { name: 'name', type: 'text', placeholder: 'name', required: true },
          { name: 'text', type: 'text', placeholder: 'snippet text', required: true },
        ],
      },
    ],
    nativeMethods: ['storage.*', 'clipboard.paste', 'clipboard.write', 'hud.show'],
    httpHosts: [],
  },
  handlers: {
    async search(query, ctx) {
      return renderSnippets(await loadSnippets(ctx), query);
    },
    async onAction(actionId, item, ctx) {
      if (!item) {
        return null;
      }
      const snippets = await loadSnippets(ctx);
      const snippet = snippets[item.id];
      if (actionId === 'paste') {
        if (snippet) {
          await ctx.capabilities.clipboard.paste(snippet.text);
        }
        return null;
      }
      if (actionId === 'copy') {
        if (snippet) {
          await ctx.capabilities.clipboard.write(snippet.text);
          await ctx.native.showHud({ title: 'Snippet copied' });
        }
        return null;
      }
      if (actionId === 'delete') {
        await ctx.capabilities.storage.delete(item.id);
        await ctx.native.showHud({ title: 'Snippet deleted' });
        return renderSnippets(await loadSnippets(ctx), '');
      }
      return null;
    },
    async command(commandId, ctx) {
      if (commandId !== 'add') {
        return;
      }
      const name = (ctx.arguments?.name ?? '').trim();
      const text = (ctx.arguments?.text ?? '').trim();
      if (name.length === 0 || text.length === 0) {
        return;
      }
      await ctx.capabilities.storage.set(name, {
        text,
        addedAtMs: Date.now(),
      } satisfies SnippetRecord);
      await ctx.native.showHud({ title: `Saved '${name}'` });
    },
  } as ExtensionModule['handlers'],
});
