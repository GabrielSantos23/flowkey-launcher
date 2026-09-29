import { defineExtension, type ExtensionModule } from '@flowkey-cli/native-sdk';
import manifestJson from '../manifest.json';

/**
 * The `open` command declares `ui: "web"`, so the sidecar never renders this
 * module (see `isWebOnlyModule`) — the clipboard surface lives in
 * `src/index.web.tsx` and runs in the shell's WebView2. This entry stays as
 * the bundle's main entry point and hosts the `clear` background command.
 */
export default defineExtension({
  manifest: manifestJson as unknown as ExtensionModule['manifest'],
  handlers: {
    async command(commandId, ctx) {
      if (commandId === 'clear') {
        await ctx.native.call('clipboard.clearHistory', {});
        await ctx.native.showHud({ title: 'Clipboard history cleared' });
      }
    },
    async search() {
      // The `open` command is ui: "web" and renders in the shell's WebView2 —
      // the root list only needs the command row. The loader still runs this
      // handler because the extension also has the tree-less `clear` command,
      // so it reports no rows.
      return { type: 'list', sections: [] };
    },
  },
} as ExtensionModule);
