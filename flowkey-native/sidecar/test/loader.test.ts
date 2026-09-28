import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateManifest } from '@flowkey-cli/native-sdk';
import type {
  ExtensionContext,
  ExtensionManifest,
  NativeCallMessage,
  ReadyMessage,
  SidecarMessage,
  UiMessage,
  WebViewMessage,
  WebResultMessage,
} from '@flowkey-cli/native-sdk';
import {
  buildEnvironment,
  collectBackgroundSchedules,
  Dispatcher,
  loadExtensions,
  loadInstalledExtensions,
} from '../src/loader';
import type { LoadedModule } from '../src/loader';
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

describe('extension environment', () => {
  test('bundled first-party modules are marked as development', () => {
    const modules = loadExtensions();
    expect(modules.length).toBeGreaterThan(0);
    for (const module of modules) {
      expect(module.source).toBe('bundled');
    }
  });

  test('installed modules are not marked as development', async () => {
    const { modules } = await loadInstalledExtensions(fixturesDir);
    expect(modules.length).toBeGreaterThan(0);
    for (const module of modules) {
      expect(module.source).toBe('installed');
    }
  });

  test('buildEnvironment resolves the command mode and development flag', () => {
    const manifest: ExtensionManifest = {
      id: 'demo-ext',
      name: 'Demo Extension',
      version: '1.0.0',
      commands: [
        { id: 'open', title: 'Open', mode: 'view' },
        { id: 'refresh', title: 'Refresh', mode: 'background' },
      ],
      nativeMethods: [],
      httpHosts: [],
    };
    const module = { manifest, source: 'installed', preferences: {} } as LoadedModule;

    expect(buildEnvironment(module, 'refresh')).toEqual({
      extensionId: 'demo-ext',
      extensionName: 'Demo Extension',
      extensionVersion: '1.0.0',
      commandId: 'refresh',
      commandMode: 'background',
      isDevelopment: false,
    });
    expect(buildEnvironment(module).commandId).toBeUndefined();
    expect(buildEnvironment(module).commandMode).toBeUndefined();
    expect(buildEnvironment(module, 'open').commandMode).toBe('view');
  });
});

describe('functional search context', () => {
  test('carries the environment with the manifest facts', async () => {
    const manifest: ExtensionManifest = {
      id: 'env-ext',
      name: 'Env Ext',
      version: '2.3.4',
      commands: [{ id: 'open', title: 'Open', mode: 'view' }],
      nativeMethods: [],
      httpHosts: [],
    };
    let captured: ExtensionContext | undefined;
    const module = {
      manifest,
      source: 'installed',
      preferences: {},
      handlers: {
        async search(query: string, ctx: ExtensionContext) {
          captured = ctx;
          return { type: 'list', sections: [{ items: [] }] };
        },
      },
    } as unknown as LoadedModule;

    const dispatcher = new Dispatcher([module], () => {});
    await dispatcher.handle(
      { type: 'search', requestId: 's-1', extensionId: 'env-ext', query: 'x' },
      () => {},
    );

    expect(captured?.environment).toEqual({
      extensionId: 'env-ext',
      extensionName: 'Env Ext',
      extensionVersion: '2.3.4',
      commandId: undefined,
      commandMode: undefined,
      isDevelopment: false,
    });
  });
});

describe('window controls', () => {
  test('functional context window controls emit protocol messages', async () => {
    const manifest: ExtensionManifest = {
      id: 'env-ext',
      name: 'Env Ext',
      version: '1.0.0',
      commands: [{ id: 'open', title: 'Open', mode: 'view' }],
      nativeMethods: [],
      httpHosts: [],
    };
    let captured: ExtensionContext | undefined;
    const module = {
      manifest,
      source: 'installed',
      preferences: {},
      handlers: {
        async search(query: string, ctx: ExtensionContext) {
          captured = ctx;
          return { type: 'list', sections: [{ items: [] }] };
        },
      },
    } as unknown as LoadedModule;

    const emitted: unknown[] = [];
    const dispatcher = new Dispatcher([module], (message) => emitted.push(message));
    await dispatcher.handle(
      { type: 'search', requestId: 's-1', extensionId: 'env-ext', query: 'x' },
      () => {},
    );

    captured!.window.closeMainWindow();
    captured!.window.popToRoot();
    captured!.window.clearSearchBar();
    captured!.window.launchCommand('open', 'query-text');

    expect(emitted).toEqual([
      { type: 'windowCommand', extensionId: 'env-ext', command: 'closeMainWindow' },
      { type: 'windowCommand', extensionId: 'env-ext', command: 'popToRoot' },
      { type: 'windowCommand', extensionId: 'env-ext', command: 'clearSearchBar' },
      { type: 'launchCommand', extensionId: 'env-ext', commandId: 'open', query: 'query-text' },
    ]);
  });
});

describe('background schedules', () => {
  test('collects background commands that declare an interval', () => {
    const manifest: ExtensionManifest = {
      id: 'sched-ext',
      name: 'Sched Ext',
      version: '1.0.0',
      commands: [
        { id: 'tick', title: 'Tick', mode: 'background', interval: 300 },
        { id: 'no-interval', title: 'No interval', mode: 'background' },
        { id: 'view-tick', title: 'View tick', interval: 300 },
      ],
      nativeMethods: [],
      httpHosts: [],
    };
    const module = { manifest, source: 'installed', preferences: {} } as LoadedModule;
    const schedules = collectBackgroundSchedules([module]);
    expect(schedules).toEqual([
      { extensionId: 'sched-ext', commandId: 'tick', intervalSeconds: 300 },
    ]);
  });
});

describe('command arguments', () => {
  test('background command handlers receive captured arguments', async () => {
    const manifest: ExtensionManifest = {
      id: 'arg-ext',
      name: 'Arg Ext',
      version: '1.0.0',
      commands: [{ id: 'sync', title: 'Sync', mode: 'background' }],
      nativeMethods: [],
      httpHosts: [],
    };
    let captured: ExtensionContext | undefined;
    const module = {
      manifest,
      source: 'installed',
      preferences: {},
      handlers: {
        async command(commandId: string, ctx: ExtensionContext) {
          captured = ctx;
        },
      },
    } as unknown as LoadedModule;

    const dispatcher = new Dispatcher([module], () => {});
    await dispatcher.handle(
      {
        type: 'action',
        requestId: 'a-1',
        extensionId: 'arg-ext',
        actionId: '__open__',
        item: { id: 'sync', title: 'Sync', actions: [] },
        arguments: { direction: 'push' },
      },
      () => {},
    );

    expect(captured?.arguments).toEqual({ direction: 'push' });
    expect(captured?.commandId).toBe('sync');
  });
});

describe('web commands', () => {
  const webManifest: ExtensionManifest = {
    id: 'web-ext',
    name: 'Web Ext',
    version: '1.0.0',
    commands: [
      { id: 'test', title: 'Test', mode: 'view', ui: 'web', webEntry: 'main.web.js' },
      { id: 'tick', title: 'Tick', mode: 'background' },
    ],
    nativeMethods: ['http.fetch'],
    httpHosts: ['speed.cloudflare.com'],
  };
  const webModule = {
    manifest: webManifest,
    source: 'installed',
    preferences: { token: 'abc' },
    component: () => null,
  } as unknown as LoadedModule;

  test('search on a web command emits a webView mount message', async () => {
    const emitted: SidecarMessage[] = [];
    const dispatcher = new Dispatcher([webModule], () => {});
    await dispatcher.handle(
      {
        type: 'search',
        requestId: 's-1',
        extensionId: 'web-ext',
        query: 'hello',
        commandId: 'test',
      },
      (message) => emitted.push(message),
    );

    const mount = emitted.find((m) => m.type === 'webView') as WebViewMessage | undefined;
    expect(mount).toBeDefined();
    expect(mount!.requestId).toBe('s-1');
    expect(mount!.extensionId).toBe('web-ext');
    expect(mount!.commandId).toBe('test');
    expect(mount!.entry).toBe('main.web.js');
    expect(mount!.props.query).toBe('hello');
    expect(mount!.props.preferences).toEqual({ token: 'abc' });
    expect(mount!.props.environment.commandMode).toBe('view');
    expect(emitted.some((m) => m.type === 'ui')).toBe(false);
  });

  test('root search on a web-only extension emits an empty list', async () => {
    const emitted: SidecarMessage[] = [];
    const dispatcher = new Dispatcher([webModule], () => {});
    await dispatcher.handle(
      { type: 'search', requestId: 's-2', extensionId: 'web-ext', query: '' },
      (message) => emitted.push(message),
    );

    const ui = emitted.find((m) => m.type === 'ui') as UiMessage | undefined;
    expect(ui?.tree).toEqual({ type: 'list', sections: [] });
  });

  test('webCall relays through the bridge and answers with webResult', async () => {
    const emitted: SidecarMessage[] = [];
    const dispatcher = new Dispatcher([webModule], (message) => emitted.push(message));
    await dispatcher.handleWebCall({
      type: 'webCall',
      bridgeId: 'w-1',
      extensionId: 'web-ext',
      method: 'http.fetch',
      params: { url: 'https://speed.cloudflare.com/meta' },
    });

    const call = emitted.find((m) => m.type === 'nativeCall') as NativeCallMessage | undefined;
    expect(call?.extensionId).toBe('web-ext');
    expect(call?.method).toBe('http.fetch');

    dispatcher.handleNativeResult({
      type: 'nativeResult',
      requestId: call!.requestId,
      ok: true,
      result: { status: 200 },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const result = emitted.find((m) => m.type === 'webResult') as WebResultMessage | undefined;
    expect(result?.bridgeId).toBe('w-1');
    expect(result?.ok).toBe(true);
    expect(result?.result).toEqual({ status: 200 });
  });

  test('webAbort rejects the bridged call with an aborted webResult', async () => {
    const emitted: SidecarMessage[] = [];
    const dispatcher = new Dispatcher([webModule], (message) => emitted.push(message));
    await dispatcher.handleWebCall({
      type: 'webCall',
      bridgeId: 'w-2',
      extensionId: 'web-ext',
      method: 'http.fetch',
      params: {},
    });

    await dispatcher.handleWebAbort({ type: 'webAbort', bridgeId: 'w-2', extensionId: 'web-ext' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const result = emitted.find((m) => m.type === 'webResult') as WebResultMessage | undefined;
    expect(result?.bridgeId).toBe('w-2');
    expect(result?.ok).toBe(false);
    expect(result?.error?.code).toBe('aborted');
  });

  test('webCall timeoutMs bounds the relayed call deadline', async () => {
    const emitted: SidecarMessage[] = [];
    const dispatcher = new Dispatcher([webModule], (message) => emitted.push(message));
    await dispatcher.handleWebCall({
      type: 'webCall',
      bridgeId: 'w-3',
      extensionId: 'web-ext',
      method: 'oauth.authorize',
      timeoutMs: 30,
      params: { provider: 'spotify' },
    });

    // No nativeResult arrives; the bridge deadline (30ms) must fire well
    // before the 5s default.
    await new Promise((resolve) => setTimeout(resolve, 80));

    const result = emitted.find((m) => m.type === 'webResult') as WebResultMessage | undefined;
    expect(result?.bridgeId).toBe('w-3');
    expect(result?.ok).toBe(false);
    expect(result?.error?.code).toBe('nativeTimeout');
  });

  test('webCall without timeoutMs keeps the default bridge deadline', async () => {
    const emitted: SidecarMessage[] = [];
    const dispatcher = new Dispatcher([webModule], (message) => emitted.push(message));
    await dispatcher.handleWebCall({
      type: 'webCall',
      bridgeId: 'w-4',
      extensionId: 'web-ext',
      method: 'oauth.authorize',
      params: { provider: 'spotify' },
    });

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(emitted.find((m) => m.type === 'webResult')).toBeUndefined();
  });

  test('opening a web command emits a fresh webView mount', async () => {
    const emitted: SidecarMessage[] = [];
    const dispatcher = new Dispatcher([webModule], () => {});
    await dispatcher.handle(
      {
        type: 'action',
        requestId: 'a-1',
        extensionId: 'web-ext',
        actionId: '__open__',
        item: { id: 'test', title: 'Test', actions: [] },
      },
      (message) => emitted.push(message),
    );

    const mount = emitted.find((m) => m.type === 'webView') as WebViewMessage | undefined;
    expect(mount?.props.query).toBe('');
    expect(mount?.commandId).toBe('test');
  });
});
