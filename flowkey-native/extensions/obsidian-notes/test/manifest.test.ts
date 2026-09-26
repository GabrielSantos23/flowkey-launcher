import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateManifest } from '@flowkey-cli/native-sdk';
import manifestJson from '../manifest.json';

describe('obsidian-notes manifest', () => {
  test('is valid and declares scoped fs + obsidian scheme capabilities', () => {
    const result = validateManifest(manifestJson);
    expect(result.errors).toEqual([]);
    expect(manifestJson.id).toBe('obsidian-notes');
    expect(manifestJson.fsPaths).toEqual(['{{vaultPath}}/**/*.md']);
    expect(manifestJson.uriSchemes).toEqual(['obsidian']);
    expect(manifestJson.nativeMethods).toContain('fs.*');
    expect(manifestJson.nativeMethods).toContain('shell.openPath');
  });

  test('ships the icon image referenced by the manifest', () => {
    const png = readFileSync(resolve(import.meta.dir, '../assets/command-icon.png'));
    expect(png.length).toBeGreaterThan(0);
  });
});
