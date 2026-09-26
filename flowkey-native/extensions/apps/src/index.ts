import { defineExtension, type UiItem, type ExtensionModule } from '@flowkey-cli/native-sdk';

interface AppInfo {
  id: string;
  name: string;
  iconUri?: string;
  launchCount?: number;
}

export default defineExtension({
  manifest: {
    id: 'apps',
    name: 'Apps',
    version: '1.0.0',
    description: 'Launch installed applications.',
    icon: '🚀',
    commands: [{ id: 'open', title: 'Apps', icon: 'rocket', iconColor: '#8B5CF6' }],
    nativeMethods: ['apps.list', 'apps.launch'],
    httpHosts: [],
  },
  handlers: {
    async search(query, ctx) {
      const result = (await ctx.native.call<{ apps: AppInfo[] }>('apps.list', { query })) ?? {
        apps: [],
      };
      const items: UiItem[] = result.apps.map((app) => ({
        id: app.id,
        title: app.name,
        subtitle:
          app.launchCount && app.launchCount > 0 ? `launched ${app.launchCount}x` : undefined,
        kind: 'Application',
        iconUri: app.iconUri,
        actions: [{ id: 'launch', title: 'Open', primary: true }],
      }));
      return {
        type: 'list',
        sections: items.length > 0 ? [{ items }] : [],
        emptyView: { title: 'No apps found', description: 'Try another name' },
      };
    },
    async onAction(actionId, item, ctx) {
      if (!item || actionId !== 'launch') {
        return null;
      }
      await ctx.native.call('apps.launch', { id: item.id });
      return null;
    },
  } as ExtensionModule['handlers'],
});
