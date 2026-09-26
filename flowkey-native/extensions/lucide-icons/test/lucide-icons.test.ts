import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateManifest } from '@flowkey/native-sdk';
import manifestJson from '../manifest.json';
import { COLORS, COLOR_OPTIONS, DEFAULT_COLOR, resolveColor } from '../src/colors';
import { allIcons, componentName, displayName, filterIcons, iconPageUrl } from '../src/icons';

describe('lucide metadata bundle', () => {
  test('ships a large, sorted icon set with keywords and canonical svg', () => {
    expect(allIcons.length).toBeGreaterThan(1000);
    for (const name of ['apple', 'activity', 'arrow-down']) {
      const icon = allIcons.find((i) => i.name === name);
      expect(icon).toBeDefined();
      expect(icon!.keywords.length).toBeGreaterThan(0);
      expect(icon!.svg).toContain('<svg');
      expect(icon!.svg).toContain('viewBox="0 0 24 24"');
      expect(icon!.svg).toContain(`lucide-${name}`);
    }
  });

  test('names are unique and sorted', () => {
    const names = allIcons.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort().join(',')).toBe(names.join(','));
  });
});

describe('filterIcons', () => {
  test('empty query returns the full set', () => {
    expect(filterIcons('')).toBe(allIcons);
    expect(filterIcons('   ')).toBe(allIcons);
  });

  test('matches by name and keyword', () => {
    const byName = filterIcons('a-arrow-down');
    expect(byName[0].name).toBe('a-arrow-down');
    const byKeyword = filterIcons('vegetable');
    expect(byKeyword.some((i) => i.name === 'carrot')).toBe(true);
    expect(filterIcons('zzz-no-such-icon').length).toBe(0);
  });

  test('multi-word queries match when every token is found', () => {
    const results = filterIcons('arrow down');
    expect(results[0].name).toBe('a-arrow-down');
    expect(filterIcons('down arrow')[0].name).toBe('a-arrow-down');
    expect(filterIcons('arrow vegetable').length).toBe(0);
  });
});

describe('naming helpers', () => {
  test('pascalCase preference changes the copied name', () => {
    const icon = allIcons.find((i) => i.name === 'a-arrow-down')!;
    expect(displayName(icon, false)).toBe('a-arrow-down');
    expect(displayName(icon, true)).toBe('AArrowDown');
    expect(componentName(icon)).toBe('<AArrowDown />');
  });

  test('icon page url uses the kebab name', () => {
    const icon = allIcons.find((i) => i.name === 'apple')!;
    expect(iconPageUrl(icon)).toBe('https://lucide.dev/icons/apple');
  });
});

describe('color palette', () => {
  test('raycast-compatible keys with PrimaryText default', () => {
    expect(DEFAULT_COLOR).toBe('PrimaryText');
    expect(COLOR_OPTIONS[0]).toEqual({ label: 'PrimaryText', value: 'PrimaryText' });
    expect(Object.keys(COLORS)).toEqual([
      'PrimaryText',
      'Red',
      'Orange',
      'Yellow',
      'Green',
      'Blue',
      'Purple',
      'Pink',
      'Brown',
    ]);
  });

  test('resolveColor falls back to PrimaryText on unknown values', () => {
    expect(resolveColor('Red')).toBe(COLORS.Red);
    expect(resolveColor(undefined)).toBe(COLORS.PrimaryText);
    expect(resolveColor('NeonPink')).toBe(COLORS.PrimaryText);
  });
});

describe('manifest', () => {
  test('is valid and declares the generic clipboard/open capabilities', () => {
    const result = validateManifest(manifestJson);
    expect(result.errors).toEqual([]);
    expect(manifestJson.id).toBe('lucide-icons');
    expect(manifestJson.icon).toBe('command-icon.png');
    expect(manifestJson.commands[0].icon).toBe('command-icon.png');
    expect(manifestJson.httpHosts).toEqual([]);
    expect(manifestJson.nativeMethods).toContain('clipboard.write');
    expect(manifestJson.nativeMethods).toContain('clipboard.paste');
    expect(manifestJson.nativeMethods).toContain('shell.openUrl');
  });

  test('ships the icon image referenced by the manifest', () => {
    const png = readFileSync(resolve(import.meta.dir, '../assets/command-icon.png'));
    expect(png.length).toBeGreaterThan(0);
    expect(
      png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe(true);
  });
});
