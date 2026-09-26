import { describe, expect, test } from 'bun:test';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { buildExtension, packageExtension } from '../src/build';
import { scaffoldExtension } from '../src/scaffold';
import { loadManifest } from '../src/lib/project';

const repoRoot = resolve(import.meta.dir, '../..');
const templateDir = join(repoRoot, 'cli', 'templates', 'default');

function scratch(name: string): string {
  const dir = join(
    tmpdir(),
    `flowkey-cli-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('scaffoldExtension', () => {
  test('copies the template and replaces tokens', () => {
    const dir = scratch('scaffold');
    const target = scaffoldExtension({
      name: 'My Widget',
      dir: join(dir, 'my-widget'),
      templateDir,
    });
    const manifest = JSON.parse(readFileSync(join(target, 'manifest.json'), 'utf8'));
    expect(manifest.id).toBe('my-widget');
    expect(manifest.name).toBe('My Widget');
    expect(manifest.__EXTENSION_NAME__).toBeUndefined();
    expect(manifest.nativeMethods).toContain('http.fetch');
    const source = readFileSync(join(target, 'src', 'index.tsx'), 'utf8');
    expect(source).not.toContain('__EXTENSION_');
    rmSync(dir, { recursive: true, force: true });
  });

  test('scaffolded manifest passes loadManifest', () => {
    const dir = scratch('scaffold-valid');
    const target = scaffoldExtension({
      name: 'Valid Ext',
      dir: join(dir, 'valid-ext'),
      templateDir,
    });
    const loaded = loadManifest(join(target, 'manifest.json'));
    expect(loaded.manifest.id).toBe('valid-ext');
    expect(loaded.warnings.length).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('buildExtension', () => {
  test('copies image-form manifest icons into dist', async () => {
    const dir = scratch('icon');
    const target = join(dir, 'icon-ext');
    mkdirSync(join(target, 'assets'), { recursive: true });
    mkdirSync(join(target, 'src'));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    writeFileSync(join(target, 'assets', 'command-icon.png'), png);
    writeFileSync(
      join(target, 'manifest.json'),
      JSON.stringify({
        id: 'icon-ext',
        name: 'Icon Ext',
        version: '1.0.0',
        description: 'Uses an image icon.',
        icon: 'command-icon.png',
        commands: [{ id: 'open', title: 'Open' }],
        nativeMethods: [],
        httpHosts: [],
      }),
    );
    writeFileSync(
      join(target, 'src', 'index.tsx'),
      'export default { manifest: {}, component: () => null };\n',
    );
    await buildExtension({ manifest: join(target, 'manifest.json') });
    expect(existsSync(join(target, 'dist', 'command-icon.png'))).toBe(true);
    expect(readFileSync(join(target, 'dist', 'command-icon.png')).equals(png)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  }, 20000);

  test('bundles the template into dist with no bare react import', async () => {
    const dir = scratch('build');
    const target = scaffoldExtension({
      name: 'Build Ext',
      dir: join(dir, 'build-ext'),
      templateDir,
    });
    const result = await buildExtension({ manifest: join(target, 'manifest.json') });
    expect(result.entryFile).toBe('main.js');
    expect(existsSync(result.entryPath)).toBe(true);

    const distManifest = JSON.parse(readFileSync(join(target, 'dist', 'manifest.json'), 'utf8'));
    expect(distManifest.entry).toBe('main.js');
    expect(distManifest.id).toBe('build-ext');

    const bundle = readFileSync(result.entryPath, 'utf8');
    // The bundle must read the host globals, never import react/react-ui bare.
    expect(bundle).toContain('__FLOWKEY_HOST__');
    expect(bundle).not.toMatch(/from\s*["']react["']/);
    expect(bundle).not.toMatch(/from\s*["']@flowkey\/react-ui["']/);
    rmSync(dir, { recursive: true, force: true });
  }, 20000);

  test('bundled main.js loads in bun with host globals installed', async () => {
    const { installHostGlobals } = await import(join(repoRoot, 'sidecar', 'src', 'hostGlobals.ts'));
    installHostGlobals();
    const dir = scratch('load');
    const target = scaffoldExtension({ name: 'Load Ext', dir: join(dir, 'load-ext'), templateDir });
    const result = await buildExtension({ manifest: join(target, 'manifest.json') });
    const mod = (await import(result.entryPath)) as { default: { component: unknown } };
    expect(typeof mod.default.component).toBe('function');
    rmSync(dir, { recursive: true, force: true });
  }, 20000);
});

describe('packageExtension', () => {
  test('produces a .flowkey zip with manifest.json at the root', async () => {
    const dir = scratch('package');
    const target = scaffoldExtension({ name: 'Pkg Ext', dir: join(dir, 'pkg-ext'), templateDir });
    const out = await packageExtension({ manifest: join(target, 'manifest.json') });
    expect(existsSync(out)).toBe(true);
    expect(out.endsWith('pkg-ext-0.1.0.flowkey')).toBe(true);

    const zip = unzipSync(new Uint8Array(readFileSync(out)));
    expect(Object.keys(zip)).toContain('manifest.json');
    expect(Object.keys(zip)).toContain('main.js');
    const manifest = JSON.parse(new TextDecoder().decode(zip['manifest.json']!));
    expect(manifest.entry).toBe('main.js');
    rmSync(dir, { recursive: true, force: true });
  }, 20000);
});
