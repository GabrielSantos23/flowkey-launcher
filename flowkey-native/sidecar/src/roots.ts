import type {
  ActionHandler,
  ActionRegistry,
  CommandProps,
  ReactExtensionModule,
} from '@flowkey-cli/react-ui';
import { ReactRoot } from '@flowkey-cli/react-ui';
import { createCapabilities, type SidecarMessage } from '@flowkey-cli/native-sdk';
import type { NativeBridge } from './bridge';

export const PUSH_INTERVAL_MS = 100;
export const MAX_ROOTS = 4;
const RETAINED_SENT_TREES = 4;

interface SentTree {
  json: string;
  registry: ActionRegistry;
}

export class ManagedRoot {
  readonly reactRoot: ReactRoot;
  readonly controller = new AbortController();
  destroyed = false;
  responsePending = false;
  lastQuery = '';
  lastFilterValue?: string;
  lastSentJson: string | null = null;
  private lastPushAt = 0;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPush: SentTree | null = null;
  private sentTrees: SentTree[] = [];

  constructor(
    readonly key: string,
    readonly extensionId: string,
    readonly commandId: string,
    component: ReactExtensionModule['component'],
    private readonly emit: (message: SidecarMessage) => void,
    private readonly nativeCall: NativeBridge['call'],
  ) {
    this.reactRoot = new ReactRoot(component, {
      onCommit: () => this.onAsyncCommit(),
      onError: (error) => {
        this.emit({
          type: 'log',
          level: 'error',
          message: `react render error in ${this.extensionId}/${this.commandId}: ${String(error)}`,
        });
      },
    });
  }

  updateProps(props: {
    query: string;
    filterValue?: string;
    commandId?: string;
    preferences: CommandProps['preferences'];
  }): void {
    this.responsePending = true;
    try {
      this.lastQuery = props.query;
      this.lastFilterValue = props.filterValue;
      const native: CommandProps['native'] = {
        call: (method, params, options) => {
          if (this.destroyed) {
            return Promise.reject({
              code: 'aborted',
              message: `native method ${method} aborted`,
            });
          }
          return this.nativeCall(this.extensionId, method, params, {
            signal: anySignal([this.controller.signal, options?.signal]),
          });
        },
        showHud: (options) => {
          if (this.destroyed) {
            return Promise.reject({
              code: 'aborted',
              message: 'native method hud.show aborted',
            });
          }
          return this.nativeCall(
            this.extensionId,
            'hud.show',
            { ...options },
            {
              signal: this.controller.signal,
            },
          );
        },
      };
      this.reactRoot.update({
        ...props,
        native,
        capabilities: createCapabilities(native.call),
        signal: this.controller.signal,
      });
      const generation = this.reactRoot.current;
      if (generation) {
        this.markSent(generation.json, generation.registry);
      }
    } finally {
      this.responsePending = false;
    }
  }

  resolveAction(actionId: string): ActionHandler | undefined {
    for (const sent of this.sentTrees) {
      const handler = sent.registry.resolve(actionId);
      if (handler) return handler;
    }
    return undefined;
  }

  markSent(json: string, registry: ActionRegistry): void {
    this.lastSentJson = json;
    this.sentTrees.unshift({ json, registry });
    if (this.sentTrees.length > RETAINED_SENT_TREES) this.sentTrees.length = RETAINED_SENT_TREES;
  }

  flushPendingPush(responseJson: string | null): void {
    if (this.pushTimer !== null) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    this.pendingPush = null;
    if (this.destroyed) return;
    const current = this.reactRoot.current;
    if (!current) return;
    if (responseJson !== null && current.json === responseJson) return;
    this.pushNow();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.pushTimer !== null) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    this.pendingPush = null;
    this.controller.abort();
    this.reactRoot.unmount();
  }

  private onAsyncCommit(): void {
    if (this.responsePending || this.destroyed) return;
    const current = this.reactRoot.current;
    if (!current || current.json === this.lastSentJson) return;
    const now = Date.now();
    if (now - this.lastPushAt >= PUSH_INTERVAL_MS) {
      this.pushNow();
      return;
    }
    this.pendingPush = { json: current.json, registry: current.registry };
    if (this.pushTimer === null) {
      this.pushTimer = setTimeout(
        () => {
          this.pushTimer = null;
          this.pendingPush = null;
          this.pushNow();
        },
        PUSH_INTERVAL_MS - (now - this.lastPushAt),
      );
    }
  }

  private pushNow(): void {
    if (this.destroyed) return;
    const current = this.reactRoot.current;
    if (!current || current.json === this.lastSentJson) return;
    this.lastPushAt = Date.now();
    this.lastSentJson = current.json;
    this.sentTrees.unshift({ json: current.json, registry: current.registry });
    if (this.sentTrees.length > RETAINED_SENT_TREES) this.sentTrees.length = RETAINED_SENT_TREES;
    this.emit({
      type: 'uiPush',
      extensionId: this.extensionId,
      commandId: this.commandId,
      query: this.lastQuery,
      filterValue: this.lastFilterValue,
      tree: current.tree,
    });
  }
}

export class RootManager {
  private roots = new Map<string, ManagedRoot>();
  private activeKey: string | null = null;

  constructor(
    private readonly emit: (message: SidecarMessage) => void,
    private readonly nativeCall: NativeBridge['call'],
  ) {}

  get size(): number {
    return this.roots.size;
  }

  get(extensionId: string, commandId: string): ManagedRoot | undefined {
    return this.roots.get(this.keyOf(extensionId, commandId));
  }

  activeFor(extensionId: string): ManagedRoot | undefined {
    if (this.activeKey === null) return undefined;
    const root = this.roots.get(this.activeKey);
    return root && root.extensionId === extensionId ? root : undefined;
  }

  ensure(extensionId: string, commandId: string, module: ReactExtensionModule): ManagedRoot {
    const key = this.keyOf(extensionId, commandId);
    let root = this.roots.get(key);
    if (!root) {
      root = new ManagedRoot(
        key,
        extensionId,
        commandId,
        module.component,
        this.emit,
        this.nativeCall,
      );
      this.roots.set(key, root);
      this.evict();
    }
    if (root.destroyed) {
      this.roots.delete(key);
      root = new ManagedRoot(
        key,
        extensionId,
        commandId,
        module.component,
        this.emit,
        this.nativeCall,
      );
      this.roots.set(key, root);
      this.evict();
    }
    this.touch(key);
    this.activeKey = key;
    return root;
  }

  reset(extensionId: string, commandId: string, module: ReactExtensionModule): ManagedRoot {
    const existing = this.get(extensionId, commandId);
    if (existing) {
      this.destroy(existing);
    }
    return this.ensure(extensionId, commandId, module);
  }

  deactivateExtension(extensionId: string): void {
    for (const root of [...this.roots.values()]) {
      if (root.extensionId === extensionId) {
        this.destroy(root);
      }
    }
  }

  destroy(root: ManagedRoot): void {
    this.roots.delete(root.key);
    if (this.activeKey === root.key) {
      this.activeKey = null;
    }
    root.destroy();
  }

  destroyAll(): void {
    for (const root of [...this.roots.values()]) {
      this.destroy(root);
    }
    this.activeKey = null;
  }

  private touch(key: string): void {
    const root = this.roots.get(key);
    if (root) {
      this.roots.delete(key);
      this.roots.set(key, root);
    }
  }

  private evict(): void {
    while (this.roots.size > MAX_ROOTS) {
      let candidate: ManagedRoot | undefined;
      for (const root of this.roots.values()) {
        if (root.key !== this.activeKey) {
          candidate = root;
          break;
        }
      }
      if (!candidate) return;
      this.destroy(candidate);
    }
  }

  private keyOf(extensionId: string, commandId: string): string {
    return `${extensionId}\u0000${commandId}`;
  }
}

function anySignal(signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const live = signals.filter((signal): signal is AbortSignal => signal !== undefined);
  if (live.length === 0) return undefined;
  if (live.length === 1) return live[0];
  const controller = new AbortController();
  for (const signal of live) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}
