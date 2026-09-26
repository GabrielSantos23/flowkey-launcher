import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  ExtensionModule,
  ExtensionManifest,
  PreferenceSchema,
  ReadyExtension,
  ReadyFailure,
  HostMessage,
  SidecarMessage,
  InitMessage,
  Preferences,
  UiTree,
  HudOptions,
} from '@flowkey/native-sdk';
import { resolveEntry, validateManifest, createCapabilities } from '@flowkey/native-sdk';
import type { ReactExtensionModule } from '@flowkey/react-ui';
import { ReactRoot } from '@flowkey/react-ui';
import { NativeBridge } from './bridge';
import { RootManager, type ManagedRoot } from './roots';
import emoji from '@flowkey/extension-emoji';
import googleTranslate from '@flowkey/extension-google-translate';
import apps from '@flowkey/extension-apps';
import clipboardHistory from '@flowkey/extension-clipboard-history';
import spotify from '@flowkey/extension-spotify';
import reactDemo from '@flowkey/extension-react-demo';
import lucideIcons from '@flowkey/extension-lucide-icons';

type LoadedFunctional = ExtensionModule & { preferences: Preferences };
type LoadedReact = ReactExtensionModule & { preferences: Preferences };
export type LoadedModule = LoadedFunctional | LoadedReact;

function isReactModule(module: LoadedModule): module is LoadedReact {
  return 'component' in module;
}

const REGISTRY: (ExtensionModule | ReactExtensionModule)[] = [
  emoji,
  apps,
  clipboardHistory,
  googleTranslate,
  reactDemo,
  spotify,
  lucideIcons,
];

export function loadExtensions(): LoadedModule[] {
  return REGISTRY.filter((m) => {
    const reserved = m.manifest.commands.some((c) => c.id === '__open__');
    if (reserved) {
      process.stderr.write(
        `extension ${m.manifest.id} declares reserved action id __open__; skipped\n`,
      );
      return false;
    }
    return true;
  }) as LoadedModule[];
}

/**
 * Discovers installed third-party extensions under `extensionsDir` (one
 * directory per extension, each with a manifest.json and a bundled .js entry).
 * The on-disk manifest is the authoritative policy source — the bundle's own
 * embedded manifest, if any, is ignored. A broken extension is reported as a
 * failure and never prevents the others from loading.
 */
export async function loadInstalledExtensions(
  extensionsDir: string,
): Promise<{ modules: LoadedModule[]; failures: ReadyFailure[] }> {
  const modules: LoadedModule[] = [];
  const failures: ReadyFailure[] = [];
  const seenIds = new Set<string>();

  const dirEntries = await readdir(extensionsDir, { withFileTypes: true }).catch(() => null);
  if (dirEntries === null) {
    // No installed extensions directory (or unreadable) — nothing to load.
    return { modules, failures };
  }

  for (const dirEntry of dirEntries) {
    if (!dirEntry.isDirectory() || dirEntry.name.startsWith('.')) continue;
    const extensionDir = join(extensionsDir, dirEntry.name);
    try {
      const raw = await readFile(join(extensionDir, 'manifest.json'), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      const validation = validateManifest(parsed);
      if (validation.errors.length > 0) {
        const first = validation.errors[0];
        failures.push({ id: dirEntry.name, message: `invalid manifest: ${first.message}` });
        continue;
      }
      const manifest = parsed as ExtensionManifest;
      if (seenIds.has(manifest.id)) {
        failures.push({
          id: dirEntry.name,
          message: `duplicate extension id '${manifest.id}' (already loaded from another directory)`,
        });
        continue;
      }
      seenIds.add(manifest.id);

      const entryPath = join(extensionDir, resolveEntry(manifest));
      const imported = (await import(pathToFileURL(entryPath).href)) as {
        default?: unknown;
      } & Record<string, unknown>;
      const exposed = (imported.default ?? imported) as {
        component?: unknown;
        handlers?: unknown;
      };
      const loaded = toLoadedModule(manifest, exposed);
      if (!loaded) {
        failures.push({
          id: manifest.id,
          message: 'entry bundle must export a component or handlers object as its default export',
        });
        continue;
      }
      modules.push(loaded);
    } catch (error) {
      failures.push({ id: dirEntry.name, message: `failed to load: ${describeError(error)}` });
    }
  }

  return { modules, failures };
}

function toLoadedModule(
  manifest: ExtensionManifest,
  exposed: { component?: unknown; handlers?: unknown },
): LoadedModule | null {
  if (typeof exposed.component === 'function') {
    return {
      manifest,
      preferences: {},
      component: exposed.component as ReactExtensionModule['component'],
    } as LoadedReact;
  }
  if (typeof exposed.handlers === 'object' && exposed.handlers !== null) {
    return {
      manifest,
      preferences: {},
      handlers: exposed.handlers as ExtensionModule['handlers'],
    } as LoadedFunctional;
  }
  return null;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function toReadyExtensions(modules: LoadedModule[]): ReadyExtension[] {
  return modules.map((m) => ({
    id: m.manifest.id,
    name: m.manifest.name,
    version: m.manifest.version,
    description: m.manifest.description,
    icon: m.manifest.icon,
    preferences: ((m.manifest as { preferences?: PreferenceSchema[] }).preferences ??
      []) as PreferenceSchema[],
    commands: m.manifest.commands,
    nativeMethods: m.manifest.nativeMethods,
    httpHosts: m.manifest.httpHosts,
    oauth: (m.manifest as { oauth?: string[] }).oauth ?? [],
  }));
}

export function applyInit(modules: LoadedModule[], init: InitMessage): LoadedModule[] {
  return modules.map((m) => ({
    ...m,
    preferences: init.preferences[m.manifest.id] ?? {},
  }));
}

export class Dispatcher {
  private bridge: NativeBridge;
  private roots: RootManager;
  private lastQuery = '';
  private lastExtensionId = '';
  private lastCommandId?: string;
  private lastFilterValue?: string;
  private commandIdByRequest = new Map<string, string>();

  constructor(
    private loaded: LoadedModule[],
    emit: (message: SidecarMessage) => void,
  ) {
    this.bridge = new NativeBridge(emit);
    this.roots = new RootManager(emit, (extensionId, method, params, options) =>
      this.bridge.call(extensionId, method, params, options),
    );
  }

  handleNativeResult(message: Parameters<NativeBridge['handleResult']>[0]): void {
    this.bridge.handleResult(message);
  }

  failPendingNativeCalls(error: { code: string; message: string }): void {
    this.roots.destroyAll();
    this.bridge.failAll(error);
  }

  async handle(message: HostMessage, emit: (message: SidecarMessage) => void): Promise<void> {
    switch (message.type) {
      case 'init':
        break;
      case 'search':
        if (message.commandId) {
          this.commandIdByRequest.set(message.requestId, message.commandId);
        }
        await this.runSearch(
          message.extensionId,
          message.query,
          message.requestId,
          emit,
          message.filterValue,
        );
        break;
      case 'action':
        await this.runAction(
          message.extensionId,
          message.actionId,
          message.item,
          message.requestId,
          emit,
        );
        break;
      case 'preferences': {
        const ext = this.loaded.find((e) => e.manifest.id === message.extensionId);
        if (ext) ext.preferences = message.values;
        break;
      }
      default:
        emit({
          type: 'log',
          level: 'warn',
          message: `unhandled message type ${JSON.stringify(message)}`,
        });
    }
  }

  private async runSearch(
    extensionId: string,
    query: string,
    requestId: string,
    emit: (message: SidecarMessage) => void,
    filterValue?: string,
  ): Promise<void> {
    const ext = this.loaded.find((e) => e.manifest.id === extensionId);
    if (!ext) {
      emit({
        type: 'error',
        requestId,
        error: { code: 'unknownExtension', message: `extension ${extensionId} not loaded` },
      });
      return;
    }
    const commandId = this.commandIdByRequest.get(requestId);
    this.lastQuery = query;
    this.lastExtensionId = extensionId;
    this.lastCommandId = commandId;
    this.lastFilterValue = filterValue;
    try {
      if (isReactModule(ext)) {
        if (commandId) {
          const root = this.roots.ensure(extensionId, commandId, ext);
          this.respondFromRoot(root, requestId, emit, { query, filterValue, commandId });
        } else {
          this.roots.deactivateExtension(extensionId);
          this.renderTransient(ext, requestId, emit, { query, filterValue });
        }
        return;
      }
      const tree = await ext.handlers.search(query, this.context(ext, commandId, filterValue));
      emit({ type: 'ui', requestId, tree });
    } catch (error) {
      emit({ type: 'error', requestId, error: toProtocolError(error) });
    } finally {
      this.commandIdByRequest.delete(requestId);
    }
  }

  private async runAction(
    extensionId: string,
    actionId: string,
    item: Parameters<NonNullable<ExtensionModule['handlers']['onAction']>>[1],
    requestId: string,
    emit: (message: SidecarMessage) => void,
  ): Promise<void> {
    const ext = this.loaded.find((e) => e.manifest.id === extensionId);
    if (!ext) {
      emit({
        type: 'error',
        requestId,
        error: { code: 'unknownExtension', message: `extension ${extensionId} not loaded` },
      });
      return;
    }
    try {
      if (actionId === '__open__') {
        const commandId = item?.id ?? '';
        const command = ext.manifest.commands.find((c) => c.id === commandId);
        if (!command) {
          emit({
            type: 'error',
            requestId,
            error: {
              code: 'unknownCommand',
              message: `command '${commandId}' not found in ${extensionId}`,
            },
          });
          return;
        }
        if (isReactModule(ext)) {
          const root = this.roots.reset(extensionId, commandId, ext);
          this.respondFromRoot(root, requestId, emit, {
            query: '',
            filterValue: undefined,
            commandId,
          });
          return;
        }
        if (command.mode === 'background') {
          if (!ext.handlers.command) {
            emit({
              type: 'error',
              requestId,
              error: { code: 'unknownCommand', message: `command '${commandId}' has no handler` },
            });
            return;
          }
          await ext.handlers.command(commandId, this.context(ext));
          emit({ type: 'ack', requestId });
          return;
        }
        const tree = await ext.handlers.search('', this.context(ext, commandId));
        this.lastQuery = '';
        this.lastExtensionId = extensionId;
        this.lastCommandId = commandId;
        this.lastFilterValue = undefined;
        emit({ type: 'ui', requestId, tree });
        return;
      }

      if (isReactModule(ext)) {
        const root = this.roots.activeFor(extensionId);
        if (!root) {
          emit({
            type: 'error',
            requestId,
            error: { code: 'unknownAction', message: `no active view for ${extensionId}` },
          });
          return;
        }
        const handler = root.resolveAction(actionId);
        if (!handler) {
          emit({
            type: 'error',
            requestId,
            error: { code: 'unknownAction', message: `unknown action '${actionId}'` },
          });
          return;
        }
        try {
          await handler();
          const generation = root.reactRoot.current;
          if (!generation) {
            emit({
              type: 'error',
              requestId,
              error: { code: 'extensionError', message: 'action produced no tree' },
            });
            return;
          }
          root.flushPendingPush(generation.json);
          root.markSent(generation.json, generation.registry);
          emit({ type: 'ui', requestId, tree: generation.tree });
        } catch (error) {
          root.flushPendingPush(null);
          emit({ type: 'error', requestId, error: toProtocolError(error) });
        }
        return;
      }

      const tree: UiTree | null | undefined = ext.handlers.onAction
        ? await ext.handlers.onAction(actionId, item, this.context(ext))
        : null;
      if (tree) {
        emit({ type: 'ui', requestId, tree });
        return;
      }
      if (this.lastExtensionId === extensionId) {
        const refreshed = await ext.handlers.search(
          this.lastQuery,
          this.context(ext, this.lastCommandId, this.lastFilterValue),
        );
        emit({ type: 'ui', requestId, tree: refreshed });
      }
    } catch (error) {
      emit({ type: 'error', requestId, error: toProtocolError(error) });
    }
  }

  private respondFromRoot(
    root: ManagedRoot,
    requestId: string,
    emit: (message: SidecarMessage) => void,
    props: { query: string; filterValue?: string; commandId: string },
  ): void {
    const ext = this.loaded.find((e) => e.manifest.id === root.extensionId);
    if (!ext || !isReactModule(ext)) {
      emit({
        type: 'error',
        requestId,
        error: { code: 'unknownExtension', message: `extension ${root.extensionId} not loaded` },
      });
      return;
    }
    root.responsePending = true;
    try {
      root.updateProps({ ...props, preferences: ext.preferences });
      const generation = root.reactRoot.current;
      if (!generation) {
        emit({
          type: 'error',
          requestId,
          error: { code: 'extensionError', message: 'render produced no tree' },
        });
        return;
      }
      emit({ type: 'ui', requestId, tree: generation.tree });
    } catch (error) {
      emit({ type: 'error', requestId, error: toProtocolError(error) });
    } finally {
      root.responsePending = false;
    }
  }
  private renderTransient(
    ext: LoadedReact,
    requestId: string,
    emit: (message: SidecarMessage) => void,
    props: { query: string; filterValue?: string },
  ): void {
    const root = new ReactRoot(ext.component, {
      onCommit: () => {},
      onError: () => {},
    });
    try {
      const native = {
        call: <T = unknown>(
          method: string,
          params?: Record<string, unknown>,
          options?: { signal?: AbortSignal; timeoutMs?: number },
        ) => this.bridge.call<T>(ext.manifest.id, method, params, options),
        showHud: (options: HudOptions) =>
          this.bridge.call<void>(ext.manifest.id, 'hud.show', { ...options }),
      };
      const generation = root.update({
        query: props.query,
        filterValue: props.filterValue,
        preferences: ext.preferences,
        native,
        capabilities: createCapabilities(native.call),
        signal: new AbortController().signal,
      });
      if (!generation) {
        emit({
          type: 'error',
          requestId,
          error: { code: 'extensionError', message: 'render produced no tree' },
        });
        return;
      }
      emit({ type: 'ui', requestId, tree: generation.tree });
    } finally {
      root.unmount();
    }
  }

  dispose(): void {
    this.roots.destroyAll();
  }

  private context(ext: LoadedFunctional, commandId?: string, filterValue?: string) {
    const native = {
      call: <T = unknown>(
        method: string,
        params?: Record<string, unknown>,
        options?: { signal?: AbortSignal; timeoutMs?: number },
      ) => this.bridge.call<T>(ext.manifest.id, method, params, options),
      showHud: (options: HudOptions) =>
        this.bridge.call<void>(ext.manifest.id, 'hud.show', { ...options }),
    };
    return {
      preferences: ext.preferences,
      commandId,
      filterValue,
      native,
      capabilities: createCapabilities(native.call),
    };
  }
}

function toProtocolError(error: unknown): { code: string; message: string } {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const e = error as { code: unknown; message: unknown };
    return { code: String(e.code), message: String(e.message) };
  }
  return { code: 'extensionError', message: String(error) };
}
