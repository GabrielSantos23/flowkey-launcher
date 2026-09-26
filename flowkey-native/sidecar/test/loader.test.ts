import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateManifest } from '@flowkey/native-sdk';
import type { ReadyMessage } from '@flowkey/native-sdk';
import { loadInstalledExtensions } from '../src/loader';
import { installHostGlobals } from '../src/hostGlobals';

installHostGlobals();

const fixturesDir = resolve(import.meta.dir, 'fixtures/installed');
const extensionsDir = resolve(import.meta.dir, '../../extensions');

describe('loadInstalledExtensions', () => {
  test('loads valid extensions with the on-disk manifest as authority', async () => {
    const { modules, failures } = await loadInstalledExtensions(fixturesDir);
    expect(failures.map((f) => f.id).sort()).toEqual(['broken-bundle', 'broken-manifest']);
    const demo = modules.find((m) => m.manifest.id === 'demo-ext') as unknown as {
      manifest: { name: string };
      handlers: unknown;
    };
    expect(demo).toBeDefined();
    expect(demo?.manifest.name).toBe('Demo Extension');
    expect(demo?.handlers).toBeDefined();
  });

  test('reports invalid manifests and broken bundles as failures without blocking others', async () => {
    const { modules, failures } = await loadInstalledExtensions(fixturesDir);
    const failedIds = failures.map((f) => f.id).sort();
    expect(failedIds).toEqual(['broken-bundle', 'broken-manifest']);
    expect(failures.find((f) => f.id === 'broken-manifest')?.message).toContain('invalid manifest');
    expect(failures.find((f) => f.id === 'broken-bundle')?.message).toContain('failed to load');
    expect(modules.length).toBe(2);
  });

  test('loaded React modules resolve their UI pieces from host globals', async () => {
    const { modules } = await loadInstalledExtensions(fixturesDir);
    const reactExt = modules.find((m) => m.manifest.id === 'demo-react-ext') as unknown as {
      component: (props: unknown) => { type: unknown; props: unknown };
    };
    expect(reactExt?.component).toBeDefined();
    // The outer element's type is the host-provided List component; rendering
    // it once yields the serializable string-typed host node.
    const element = reactExt.component({});
    const inner = (element.type as (props: unknown) => { type: string })(element.props);
    expect(inner.type).toBe('list');
  });

  test('functional fixture module serves searches through its handlers', async () => {
    const { modules } = await loadInstalledExtensions(fixturesDir);
    const demo = modules.find((m) => m.manifest.id === 'demo-ext') as unknown as {
      handlers: {
        search: (query: string) => Promise<{ type: string; sections: { items: unknown[] }[] }>;
      };
    };
    const tree = await demo.handlers.search('al');
    expect(tree.type).toBe('list');
    expect(tree.sections[0].items).toHaveLength(1);
  });

  test('a missing extensions directory yields no modules and no failures', async () => {
    const { modules, failures } = await loadInstalledExtensions(
      resolve(fixturesDir, '../does-not-exist'),
    );
    expect(modules).toEqual([]);
    expect(failures).toEqual([]);
  });
});

describe('first-party manifests', () => {
  test('every bundled extension manifest passes validateManifest', () => {
    for (const name of readdirSync(extensionsDir)) {
      const manifestPath = resolve(extensionsDir, name, 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const result = validateManifest(manifest);
      expect(result.errors).toEqual([]);
    }
  });
});

describe('protocol fixture readiness', () => {
  const protocolFixture = JSON.parse(
    readFileSync(resolve(import.meta.dir, '../../contract/protocol.fixture.json'), 'utf8'),
  );

  test('ready fixture round-trips with failures present', () => {
    const ready = protocolFixture.sidecarToHost.ready as ReadyMessage;
    expect(ready.failures).toEqual([]);
    const withFailures = protocolFixture.sidecarToHost.readyWithFailures as ReadyMessage;
    expect(withFailures.failures?.[0].id).toBe('weather-pro');
  });

  test('init fixture carries disabledExtensions', () => {
    expect(protocolFixture.hostToSidecar.init.disabledExtensions).toEqual([]);
  });
});
