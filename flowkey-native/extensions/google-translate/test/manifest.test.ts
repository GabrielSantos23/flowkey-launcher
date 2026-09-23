import { describe, expect, test } from 'bun:test';
import manifest from '../manifest.json';

const VIEW_COMMANDS = new Set(['translate', 'quick-translate', 'translate-clipboard']);

describe('google-translate manifest', () => {
  test('every command is a known view command', () => {
    const ids = manifest.commands.map((command) => command.id);
    expect(ids.length).toBe(VIEW_COMMANDS.size);
    for (const id of ids) {
      expect(VIEW_COMMANDS.has(id)).toBe(true);
    }
  });

  test('declares only the native methods it uses and no more', () => {
    expect([...manifest.nativeMethods].sort()).toEqual(['clipboard.read', 'clipboard.write', 'http.fetch']);
  });

  test('httpHosts are limited to the unofficial translate endpoint', () => {
    expect(manifest.httpHosts).toEqual(['translate.google.com']);
  });

  test('preference dropdowns resolve through custom-code fallback fields', () => {
    const names = manifest.preferences.map((preference) => preference.name);
    expect(names).toEqual([
      'langFrom',
      'langFromCustom',
      'lang1',
      'lang1Custom',
      'lang2',
      'lang2Custom',
    ]);
    for (const preference of manifest.preferences) {
      if (preference.type === 'dropdown') {
        expect(preference.options?.length).toBeGreaterThanOrEqual(25);
      }
    }
  });
});
