import {
  defineExtension,
  type ExtensionModule,
  type ExtensionContext,
  type UiItem,
  type UiTree,
} from '@flowkey-cli/native-sdk';

interface LinkRecord {
  target: string;
  addedAtMs: number;
}

type LinkStore = Record<string, LinkRecord>;

async function loadLinks(ctx: ExtensionContext): Promise<LinkStore> {
  return await ctx.capabilities.storage.allItems<LinkRecord>();
}

function renderLinks(links: LinkStore, query: string): UiTree {
  const q = query.trim().toLowerCase();
  const items: UiItem[] = Object.entries(links)
    .filter(
      ([name, link]) =>
        q.length === 0 || name.toLowerCase().includes(q) || link.target.toLowerCase().includes(q),
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, link]) => ({
      id: name,
      title: name,
      subtitle: link.target,
      kind: 'Quicklink',
      iconName: 'link',
      actions: [
        { id: 'open', title: 'Open', primary: true },
        { id: 'copy', title: 'Copy Target' },
        {
          id: 'delete',
          title: 'Delete Quicklink',
          style: 'destructive',
          shortcut: { key: 'backspace', modifiers: ['ctrl'] },
        },
      ],
    }));
  return {
    type: 'list',
    sections: items.length > 0 ? [{ items }] : [],
    emptyView: {
      title: q.length > 0 ? 'No matching quicklinks' : 'No quicklinks yet',
      description: q.length > 0 ? undefined : 'Run "Add Quicklink" to save your first link',
    },
  };
}

export default defineExtension({
  manifest: {
    id: 'quicklinks',
    name: 'Quicklinks',
    version: '1.0.0',
    description: 'Search and open your saved links, files and folders.',
    icon: '🔗',
    commands: [
      {
        id: 'search',
        title: 'Quicklinks',
        keywords: ['links', 'open', 'url', 'bookmark'],
        icon: 'link',
        iconColor: '#0EA5E9',
      },
      {
        id: 'add',
        title: 'Add Quicklink',
        mode: 'background',
        keywords: ['links', 'save', 'create'],
        icon: 'plus',
        iconColor: '#0EA5E9',
        arguments: [
          { name: 'name', type: 'text', placeholder: 'name', required: true },
          { name: 'target', type: 'text', placeholder: 'url or path', required: true },
        ],
      },
    ],
    nativeMethods: ['storage.*', 'shell.open', 'clipboard.write', 'hud.show'],
    httpHosts: [],
  },
  handlers: {
    async search(query, ctx) {
      return renderLinks(await loadLinks(ctx), query);
    },
    async onAction(actionId, item, ctx) {
      if (!item) {
        return null;
      }
      const links = await loadLinks(ctx);
      const link = links[item.id];
      if (actionId === 'open') {
        if (link) {
          await ctx.capabilities.shell.open(link.target);
        }
        return null;
      }
      if (actionId === 'copy') {
        if (link) {
          await ctx.capabilities.clipboard.write(link.target);
          await ctx.native.showHud({ title: 'Target copied' });
        }
        return null;
      }
      if (actionId === 'delete') {
        await ctx.capabilities.storage.delete(item.id);
        await ctx.native.showHud({ title: 'Quicklink deleted' });
        return renderLinks(await loadLinks(ctx), '');
      }
      return null;
    },
    async command(commandId, ctx) {
      if (commandId !== 'add') {
        return;
      }
      const name = (ctx.arguments?.name ?? '').trim();
      const target = (ctx.arguments?.target ?? '').trim();
      if (name.length === 0 || target.length === 0) {
        return;
      }
      await ctx.capabilities.storage.set(name, {
        target,
        addedAtMs: Date.now(),
      } satisfies LinkRecord);
      await ctx.native.showHud({ title: `Saved '${name}'` });
    },
  } as ExtensionModule['handlers'],
});
