import type {
  ExtensionModule,
  PreferenceSchema,
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
import clipboardHistory from '@flowkey/extension-clipboard-history';

type LoadedExtension = ExtensionModule & { preferences: Preferences };

const REGISTRY: ExtensionModule[] = [emoji, apps, httpTest, clipboardHistory];

export function loadExtensions(): ExtensionModule[] {
  return REGISTRY.filter((m) => {
    const reserved = m.manifest.commands.some((c) => c.id === '__open__');
    if (reserved) {
      process.stderr.write(`extension ${m.manifest.id} declares reserved action id __open__; skipped
`);
      return false;
    }
    return true;
  });
}

export function toReadyExtensions(modules: ExtensionModule[]): ReadyExtension[] {
  return modules.map((m) => ({
    id: m.manifest.id,
    name: m.manifest.name,
    version: m.manifest.version,
    icon: m.manifest.icon,
    preferences: ((m.manifest as { preferences?: PreferenceSchema[] }).preferences ??
      []) as PreferenceSchema[],
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
  private lastCommandId?: string;
  private lastFilterValue?: string;
  private commandIdByRequest = new Map<string, string>();

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
        if (message.commandId) {
          this.commandIdByRequest.set(message.requestId, message.commandId);
        }
        await this.runSearch(message.extensionId, message.query, message.requestId, emit, message.filterValue);
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
    this.lastQuery = query;
    this.lastExtensionId = extensionId;
    const commandId = this.commandIdByRequest.get(requestId);
    this.lastCommandId = commandId;
    this.lastFilterValue = filterValue;
    try {
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

      const tree: UiTree | null | undefined = ext.handlers.onAction
        ? await ext.handlers.onAction(actionId, item, this.context(ext))
        : null;
      if (tree) {
        emit({ type: 'ui', requestId, tree });
        return;
      }
      if (this.lastExtensionId === extensionId) {
        const refreshed = await ext.handlers.search(this.lastQuery, this.context(ext, this.lastCommandId, this.lastFilterValue));
        emit({ type: 'ui', requestId, tree: refreshed });
      }
    } catch (error) {
      emit({ type: 'error', requestId, error: toProtocolError(error) });
    }
  }

  private context(ext: LoadedExtension, commandId?: string, filterValue?: string) {
    return {
      preferences: ext.preferences,
      commandId,
      filterValue,
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
