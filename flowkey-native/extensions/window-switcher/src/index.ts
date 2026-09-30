import {
  defineExtension,
  type ExtensionModule,
  type UiItem,
  type UiTree,
} from '@flowkey-cli/native-sdk';

interface OpenWindow {
  id: string;
  title: string;
  processName: string;
  iconUri?: string;
}

function renderWindows(windows: OpenWindow[], query: string): UiTree {
  const q = query.trim().toLowerCase();
  const items: UiItem[] = windows
    .filter(
      (win) =>
        q.length === 0 ||
        win.title.toLowerCase().includes(q) ||
        win.processName.toLowerCase().includes(q),
    )
    .map((win) => ({
      id: win.id,
      title: win.title,
      subtitle: win.processName,
      kind: 'Window',
      iconUri: win.iconUri,
      actions: [
        { id: 'focus', title: 'Switch to Window', primary: true },
        {
          id: 'close',
          title: 'Close Window',
          style: 'destructive',
          shortcut: { key: 'delete', modifiers: ['ctrl'] },
        },
      ],
    }));
  return {
    type: 'list',
    sections: items.length > 0 ? [{ items }] : [],
    emptyView: {
      title: 'No matching windows',
      description: 'Open an application or loosen the filter',
    },
  };
}

export default defineExtension({
  manifest: {
    id: 'window-switcher',
    name: 'Window Switcher',
    version: '1.0.0',
    description: 'Search open windows and jump to them.',
    icon: '🪟',
    commands: [
      {
        id: 'switch',
        title: 'Window Switcher',
        keywords: ['windows', 'alt-tab', 'switch', 'apps'],
        icon: 'app-window',
        iconColor: '#8B5CF6',
      },
    ],
    nativeMethods: ['windows.list', 'windows.focus', 'windows.close', 'hud.show'],
    httpHosts: [],
  },
  handlers: {
    async search(query, ctx) {
      if (!ctx.environment.commandId) {
        // Root search broadcast: enumerating windows (with icon extraction)
        // on every keystroke is wasted work — this extension only means
        // something inside its own command view.
        return { type: 'list', sections: [] };
      }
      const result = (await ctx.native.call<{ windows?: OpenWindow[] }>('windows.list')) ?? {
        windows: [],
      };
      return renderWindows(result.windows ?? [], query);
    },
    async onAction(actionId, item, ctx) {
      if (!item) {
        return null;
      }
      if (actionId === 'focus') {
        await ctx.capabilities.windows.focus(item.id);
        return null;
      }
      if (actionId === 'close') {
        await ctx.capabilities.windows.close(item.id);
        await ctx.native.showHud({ title: 'Window closed' });
        const result = (await ctx.native.call<{ windows?: OpenWindow[] }>('windows.list')) ?? {
          windows: [],
        };
        return renderWindows(result.windows ?? [], '');
      }
      return null;
    },
  } as ExtensionModule['handlers'],
});
