/**
 * asyar-sdk/worker — entry point for Tier 2 background worker scripts.
 *
 * Enforces `window.__ASYAR_ROLE__ === 'worker'` at module-load time.
 * Throws immediately if imported into a view iframe or outside an iframe.
 */

declare global {
  interface Window {
    __ASYAR_ROLE__?: string;
  }
}

if (typeof window !== 'undefined' && window.__ASYAR_ROLE__ !== 'worker') {
  throw new Error(
    `[asyar-sdk/worker] Module loaded in invalid role: ${JSON.stringify(
      window.__ASYAR_ROLE__,
    )}. asyar-sdk/worker can only be imported from a worker context ` +
      "(a Tier 2 extension's headless iframe). " +
      'Did you mean to import from "asyar-sdk/view"?',
  );
}

import type { Namespace } from './ipc/namespaces';
import type { BaseServiceProxy } from './services/BaseServiceProxy';

import { LogServiceProxy } from './services/LogServiceProxy';
import { StorageServiceProxy } from './services/StorageServiceProxy';
import { NotesServiceProxy } from './services/NotesServiceProxy';
import { CacheServiceProxy } from './services/CacheServiceProxy';
import { SearchServiceProxy } from './services/SearchServiceProxy';
import { NetworkServiceProxy } from './services/NetworkServiceProxy';
import { ShellServiceProxy } from './services/ShellServiceProxy';
import { OAuthServiceProxy } from './services/OAuthServiceProxy';
import { FileManagerServiceProxy } from './services/FileManagerServiceProxy';
import { ApplicationServiceProxy } from './services/ApplicationService';
import { PowerServiceProxy } from './services/PowerServiceProxy';
import { ScreenServiceProxy } from './services/ScreenServiceProxy';
import { ProcessServiceProxy } from './services/ProcessServiceProxy';
import { SystemEventsServiceProxy } from './services/SystemEventsServiceProxy';
import { TimerServiceProxy } from './services/TimerServiceProxy';
import { FileSystemWatcherServiceProxy } from './services/FileSystemWatcherService';
import { StatusBarServiceProxy } from './services/StatusBarServiceProxy';
import { CommandServiceProxy } from './services/CommandServiceProxy';
import { ExtensionStateProxy } from './services/ExtensionStateProxy';
import { ActionServiceProxy } from './services/ActionServiceProxy';
import { FeedbackServiceProxy } from './services/FeedbackServiceProxy';
import { IslandServiceProxy } from './services/IslandServiceProxy';
import { OnboardingServiceProxy } from './services/OnboardingServiceProxy';
import { RunServiceProxy } from './services/RunServiceProxy';
import { SnippetsServiceProxy } from './services/SnippetsServiceProxy';
import { BrowserServiceProxy } from './services/BrowserServiceProxy';
import { FilesServiceProxy } from './services/FilesServiceProxy';
import { OpenerServiceProxy } from './services/OpenerServiceProxy';
import { EnvironmentServiceProxy } from './services/EnvironmentServiceProxy';
import { extensionRpc } from './services/ExtensionRpc';

import { ExtensionContextCore } from './ExtensionContextCore';

function buildWorkerProxyBag(): Partial<Record<Namespace, BaseServiceProxy>> {
  return {
    log: new LogServiceProxy(),
    storage: new StorageServiceProxy(),
    notes: new NotesServiceProxy(),
    cache: new CacheServiceProxy(),
    search: new SearchServiceProxy(),
    network: new NetworkServiceProxy(),
    shell: new ShellServiceProxy(),
    oauth: new OAuthServiceProxy(),
    fs: new FileManagerServiceProxy(),
    application: new ApplicationServiceProxy(),
    power: new PowerServiceProxy(),
    screen: new ScreenServiceProxy(),
    process: new ProcessServiceProxy(),
    systemEvents: new SystemEventsServiceProxy(),
    timers: new TimerServiceProxy(),
    fsWatcher: new FileSystemWatcherServiceProxy(),
    statusBar: new StatusBarServiceProxy(),
    commands: new CommandServiceProxy(),
    state: new ExtensionStateProxy(),
    feedback: new FeedbackServiceProxy(),
    island: new IslandServiceProxy(),
    onboarding: new OnboardingServiceProxy(),
    runs: new RunServiceProxy(),
    snippets: new SnippetsServiceProxy(),
    browser: new BrowserServiceProxy(),
    files: new FilesServiceProxy(),
    opener: new OpenerServiceProxy(),
    environment: new EnvironmentServiceProxy(),
    // Role-neutral: pure postMessage forwarder. Exposes registerAction,
    // unregisterAction, and registerActionHandler so manifest root actions
    // (send-notification, show-hud, notification callbacks) can register
    // from the worker and survive view Dormant.
    actions: new ActionServiceProxy(),
  };
}

/**
 * Worker-side: intercept every `asyar:action:execute` postMessage and feed
 * RPC envelopes ({ __rpc__: "request" | "abort", ... }) into the RPC
 * dispatcher. Non-RPC actions fall through to the user's action handlers.
 *
 * Idempotent — one listener per worker iframe. Installed eagerly at module
 * load so even the very first `onRequest` registration is covered without
 * a bootstrap ordering hazard.
 */
function installWorkerRpcInterceptor(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('message', (event: MessageEvent) => {
    const data = (event as MessageEvent<unknown>).data;
    if (!data || typeof data !== 'object') return;
    const d = data as { type?: unknown; payload?: unknown };
    if (d.type !== 'asyar:action:execute') return;
    const payload = d.payload;
    if (!payload || typeof payload !== 'object') return;
    if ((payload as { __rpc__?: unknown }).__rpc__ === undefined) return;
    extensionRpc.deliverActionPayload(payload);
  });
}

installWorkerRpcInterceptor();

// Auto-report uncaught errors / rejections to host parent (Task 24).
if (typeof window !== 'undefined' && window.parent !== window) {
  window.addEventListener('error', (e: ErrorEvent) => {
    window.parent.postMessage(
      {
        type: 'asyar:feedback:uncaught',
        payload: {
          kind: 'iframe_uncaught',
          developerDetail: e.error?.stack ?? String(e.message),
        },
      },
      '*',
    );
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    window.parent.postMessage(
      {
        type: 'asyar:feedback:uncaught',
        payload: {
          kind: 'iframe_unhandled_rejection',
          developerDetail: String(e.reason),
        },
      },
      '*',
    );
  });
}

export class ExtensionContext extends ExtensionContextCore {
  constructor() {
    const proxies = buildWorkerProxyBag();
    super({ role: 'worker', proxies });
  }

  protected override notifyRpcIfAvailable(id: string): void {
    // Patch the extensionRpc singleton's broker so worker-side
    // state:rpcReply messages carry the extensionId. Without this,
    // the launcher's IPC router rejects every rpc reply and the view's
    // context.request(...) times out even though the worker handler ran.
    extensionRpc.setExtensionId(id);
  }

  /**
   * Worker-side RPC entry. Registers `handler` for the given `id`. Returns
   * a disposer that unregisters the handler.
   *
   * The `handler` receives the request payload as its first argument and an
   * `AbortSignal` as its second argument. The signal fires when the
   * view-side timeout elapses, so long-running handlers can bail at yield
   * points (`signal.aborted`) or pass the signal into AbortController-aware
   * APIs such as `fetch`. Handlers that ignore the signal still produce a
   * leak — but a detectable one: the late reply is silently dropped by the
   * view-side SDK.
   */
  onRequest<TPayload = unknown, TResult = unknown>(
    id: string,
    handler: (payload: TPayload, signal: AbortSignal) => Promise<TResult>,
  ): () => void {
    return extensionRpc.onRequest(
      id,
      handler as unknown as (payload: unknown, signal: AbortSignal) => Promise<unknown>,
    );
  }
}

export { messageBroker, MessageBroker } from './ipc/MessageBroker';
export type { IPCMessage, IPCResponse, HostDispatcher } from './ipc/MessageBroker';
export { NAMESPACES, isNamespace } from './ipc/namespaces';
export type { Namespace, WireCommand } from './ipc/namespaces';
export { extensionBridge, ExtensionBridge } from './ExtensionBridge';
export { PreferencesFacade } from './PreferencesFacade';
export type { PreferencesSnapshot } from './PreferencesFacade';
export { environment } from './environment';
export type { EnvironmentSnapshot, IEnvironmentService } from './types/EnvironmentType';
export * from './errors';
