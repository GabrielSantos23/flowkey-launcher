import { describe, expect, test } from 'bun:test';
import type { ExtensionManifest } from '@flowkey-cli/native-sdk';
import manifest from '../manifest.json';
import { GRID_COLUMNS } from '../src/emoji-model';
import emoji from '../src/index.tsx';

describe('emoji manifest', () => {
  test('declares exactly one picker command', () => {
    const ids = manifest.commands.map((command) => command.id);
    expect(ids).toEqual(['open']);
  });

  test('the picker renders in the webview on the shared bundle', () => {
    const [command] = manifest.commands;
    expect(command.ui).toBe('web');
    expect(command.mode).toBe('view');
    expect(command.webEntry).toBe('app.web.js');
  });

  test('the command names the picker, not the extension', () => {
    expect(manifest.commands[0].title).toBe('Emoji & Symbols');
  });

  test('declares only the native methods it uses and no more', () => {
    expect([...manifest.nativeMethods].sort()).toEqual([
      'clipboard.paste',
      'clipboard.write',
      // the user's Frequently Used list has to survive a restart
      'storage.get',
      'storage.set',
    ]);
  });

  test('reaches no network', () => {
    expect(manifest.httpHosts).toEqual([]);
  });

  test('the packaged manifest and the embedded one agree', () => {
    // the sidecar gates capabilities on the embedded copy, so a drift here
    // would silently unlock or lock the wrong routes
    expect(emoji.manifest).toEqual(manifest as unknown as ExtensionManifest);
  });

  test('the packaged module is a web-only placeholder', () => {
    // the picker renders in the webview, so the packaged entry carries the
    // manifest and a notice component only - no tree handlers, no catalog
    expect(Object.keys(emoji).sort()).toEqual(['component', 'manifest']);
  });

  test('the grid is eight columns wide', () => {
    expect(GRID_COLUMNS).toBe(8);
  });
});
