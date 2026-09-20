import type {
  ExtensionModule,
  ReadyExtension,
  HostMessage,
  SidecarMessage,
  InitMessage,
  Preferences,
  UiTree,
} from '@flowkey/native-sdk';
import { NativeBridge } from './bridge';
import emoji from '@flowkey/extension-emoji';
import apps from '@flowkey/extension-apps';
import httpTest from '@flowkey/extension-http-test';

type LoadedExtension = ExtensionModule & { preferences: Preferences };

const REGISTRY: ExtensionModule[] = [emoji, apps, httpTest];

export function loadExtensions(): ExtensionModule[] {
  return REGISTRY;
}

export function toReadyExtensions(modules: ExtensionModule[]): ReadyExtension[] {
  return modules.map((m) => ({
    id: m.manifest.id,
    name: m.manifest.name,
    version: m.manifest.version,
    commands: m.manifest.commands,
    nativeMethods: m.manifest.nativeMethods,
    httpHosts: m.manifest.httpHosts,
  }));
}

export function applyInit(modules: ExtensionModule[], init: InitMessage): LoadedExtension[] {
  return modules.map((m) => ({
    ...m,
    preferences: init.preferences[m.manifest.id] ?? {},
  }));
}

export class Dispatcher {
  private bridge: NativeBridge;
  private lastQuery = '';
  private lastExtensionId = '';

  constructor(
    private loaded: LoadedExtension[],
    emit: (message: SidecarMessage) => void,
  ) {
    this.bridge = new NativeBridge(emit);
  }

  handleNativeResult(message: Parameters<NativeBridge['handleResult']>[0]): void {
    this.bridge.handleResult(message);
  }

  failPendingNativeCalls(error: { code: string; message: string }): void {
    this.bridge.failAll(error);
  }

  async handle(message: HostMessage, emit: (message: SidecarMessage) => void): Promise<void> {
    switch (message.type) {
      case 'init':
        break;
      case 'search':
        await this.runSearch(message.extensionId, message.query, message.requestId, emit);
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
    this.lastQuery = query;
    this.lastExtensionId = extensionId;
    try {
      const tree = await ext.handlers.search(query, this.context(ext));
      emit({ type: 'ui', requestId, tree });
    } catch (error) {
      emit({ type: 'error', requestId, error: toProtocolError(error) });
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
      const tree: UiTree | null | undefined = ext.handlers.onAction
        ? await ext.handlers.onAction(actionId, item, this.context(ext))
        : null;
      if (tree) {
        emit({ type: 'ui', requestId, tree });
        return;
      }
      if (this.lastExtensionId === extensionId) {
        const refreshed = await ext.handlers.search(this.lastQuery, this.context(ext));
        emit({ type: 'ui', requestId, tree: refreshed });
      }
    } catch (error) {
      emit({ type: 'error', requestId, error: toProtocolError(error) });
    }
  }

  private context(ext: LoadedExtension) {
    return {
      preferences: ext.preferences,
      native: {
        call: <T = unknown>(method: string, params?: Record<string, unknown>) =>
          this.bridge.call<T>(ext.manifest.id, method, params),
      },
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
