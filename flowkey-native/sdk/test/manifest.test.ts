import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_ENTRY, isManifestValid, resolveEntry, validateManifest } from '../src/manifest';
import type { ExtensionManifest } from '../src/types';

const contractDir = resolve(import.meta.dir, '../../contract');
const manifestFixture = JSON.parse(
  readFileSync(resolve(contractDir, 'manifest.fixture.json'), 'utf8'),
) as {
  valid: { name: string; manifest: ExtensionManifest }[];
  invalid: {
    name: string;
    manifest: unknown;
    expectedField: string;
    expectedCode: string;
  }[];
};

describe('manifest contract fixture', () => {
  test('every valid fixture manifest passes with no errors', () => {
    expect(manifestFixture.valid.length).toBeGreaterThan(0);
    for (const entry of manifestFixture.valid) {
      const result = validateManifest(entry.manifest);
      expect(result.errors).toEqual([]);
    }
  });

  test('every invalid fixture manifest fails on the expected field and code', () => {
    expect(manifestFixture.invalid.length).toBeGreaterThan(0);
    for (const entry of manifestFixture.invalid) {
      const result = validateManifest(entry.manifest);
      const matched = result.errors.find(
        (e) => e.field === entry.expectedField && e.code === entry.expectedCode,
      );
      expect(matched).toBeDefined();
    }
  });
});

describe('validateManifest', () => {
  test('non-object manifests fail with a single notAnObject error', () => {
    for (const bad of [null, undefined, 42, 'manifest', []]) {
      const result = validateManifest(bad);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('notAnObject');
    }
  });

  test('missing optional fields produce warnings, not errors', () => {
    const result = validateManifest({
      id: 'warned',
      name: 'Warned',
      version: '1.0.0',
      commands: [{ id: 'open', title: 'Open' }],
      nativeMethods: [],
      httpHosts: [],
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((w) => w.field)).toContain('description');
    expect(result.warnings.map((w) => w.field)).toContain('icon');
  });

  test('native method wildcards require a dotted namespace', () => {
    const base = {
      id: 'wild',
      name: 'Wild',
      version: '1.0.0',
      commands: [{ id: 'open', title: 'Open' }],
      httpHosts: [],
    };
    expect(
      isManifestValid({ ...base, nativeMethods: ['storage.*', 'clipboard.*', 'a.b.c.*'] }),
    ).toBe(true);
    expect(isManifestValid({ ...base, nativeMethods: ['*'] })).toBe(false);
    expect(isManifestValid({ ...base, nativeMethods: ['.write'] })).toBe(false);
    expect(isManifestValid({ ...base, nativeMethods: ['Storage.Write'] })).toBe(false);
  });

  test('http host validation rejects paths, schemes and credentials', () => {
    const base = {
      id: 'hosty',
      name: 'Hosty',
      version: '1.0.0',
      commands: [{ id: 'open', title: 'Open' }],
      nativeMethods: [],
    };
    expect(
      isManifestValid({
        ...base,
        httpHosts: ['api.example.com', '.cdn.example.com', 'localhost:8080'],
      }),
    ).toBe(true);
    expect(isManifestValid({ ...base, httpHosts: ['api.example.com/v1'] })).toBe(false);
    expect(isManifestValid({ ...base, httpHosts: ['user:pass@api.example.com'] })).toBe(false);
  });

  test('duplicate preference names are rejected', () => {
    const result = validateManifest({
      id: 'dupes',
      name: 'Dupes',
      version: '1.0.0',
      commands: [{ id: 'open', title: 'Open' }],
      nativeMethods: [],
      httpHosts: [],
      preferences: [
        { name: 'region', type: 'text', title: 'Region' },
        { name: 'region', type: 'text', title: 'Region Again' },
      ],
    });
    expect(
      result.errors.some((e) => e.code === 'duplicate' && e.field === 'preferences[1].name'),
    ).toBe(true);
  });
});

describe('resolveEntry', () => {
  test('defaults to main.js when entry is absent', () => {
    const manifest = {
      id: 'x',
      name: 'X',
      version: '1.0.0',
      commands: [],
      nativeMethods: [],
      httpHosts: [],
    };
    expect(resolveEntry(manifest)).toBe(DEFAULT_ENTRY);
    expect(DEFAULT_ENTRY).toBe('main.js');
  });
});
