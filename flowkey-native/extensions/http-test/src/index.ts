import { defineExtension, type UiItem, type ExtensionModule } from '@flowkey/native-sdk';

interface FetchResult {
  status: number;
  bodyText: string;
}

export default defineExtension({
  manifest: {
    id: 'http-test',
    name: 'HTTP Test',
    version: '1.0.0',
    description: 'Developer verification for the mediated http.fetch method.',
    icon: '🌐',
    commands: [{ id: 'open', title: 'HTTP Test' }],
    nativeMethods: ['http.fetch'],
    httpHosts: ['api.github.com'],
  },
  handlers: {
    async search(query, ctx) {
      if (ctx.commandId === 'open') {
        return {
          type: 'detail' as const,
          title: 'HTTP fetch verification',
          fields: [
            { label: 'Allowed host', value: 'api.github.com' },
            { label: 'Blocked host', value: 'example.com' },
          ],
          description: [
            '### What you are seeing',
            'This page is a **DetailTree** rendered by the shell: *native WPF*, no WebView2.',
            '',
            '- inline `code` sample',
            '1. numbered item',
            '',
            'Open link: [GitHub](https://github.com)',
            'Blocked link: [evil](javascript:alert(1))',
          ].join('\n'),
          actions: [{ id: 'rerun', title: 'Re-run checks', primary: true }],
        };
      }
      if (query.trim().length === 0) {
        return { type: 'list', sections: [], emptyView: { title: 'Type to run an http.fetch check' } };
      }
      const items: UiItem[] = [];
      try {
        const allowed = await ctx.native.call<FetchResult>('http.fetch', {
          url: 'https://api.github.com/zen',
          headers: { 'User-Agent': 'flowkey-http-test' },
        });
        items.push({
          id: 'allowed',
          title: `allowed: ${allowed.status} ${allowed.bodyText.slice(0, 60)}`,
          kind: 'Check',
        });
      } catch (error) {
        const err = error as { code: string; message: string };
        items.push({ id: 'allowed-error', title: `allowed failed: ${err.code}: ${err.message}` });
      }
      try {
        await ctx.native.call('http.fetch', { url: 'https://example.com/x' });
        items.push({ id: 'denied-unexpected', title: 'denied host unexpectedly succeeded' });
      } catch (error) {
        const err = error as { code: string; message: string };
        items.push({
          id: 'denied',
          title: `denied as expected: ${err.code}`,
          subtitle: err.message,
          kind: 'Check',
        });
      }
      return { type: 'list', sections: [{ title: 'Results', items }], emptyView: { title: 'No results' } };
    },
  } as ExtensionModule['handlers'],
});
