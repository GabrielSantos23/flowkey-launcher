import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { logService } from '../log/logService';

export type AppUpdatePhase = 'idle' | 'checking' | 'downloading' | 'ready';

export interface AppUpdateState {
  phase: AppUpdatePhase;
  pendingVersion?: string;
  /** Progress percent while downloading (best-effort; Rust emits coarse events). */
  percent?: number;
}

type Listener = (state: AppUpdateState) => void;

/**
 * Observable app-update state, shared by the Settings → About tab and any
 * update badge. Rust drives the lifecycle through `asyar:app-update:*`
 * events; the frontend mirrors them here so every surface agrees.
 */
class AppUpdateStore {
  private state: AppUpdateState = { phase: 'idle' };
  private listeners = new Set<Listener>();

  get current(): AppUpdateState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  set(state: AppUpdateState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

export const appUpdate = new AppUpdateStore();

/** Ask Rust to check for an update (and download+install if one is found). */
export async function checkForUpdate(): Promise<void> {
  appUpdate.set({ phase: 'checking' });
  try {
    const version = await invoke<string | null>('app_updater_check_now');
    if (version) {
      // The ready event also fires; setting here covers a missed event.
      appUpdate.set({ phase: 'ready', pendingVersion: version });
    } else {
      appUpdate.set({ phase: 'idle' });
    }
  } catch (err) {
    logService.error(`app_updater_check_now failed: ${err}`);
    appUpdate.set({ phase: 'idle' });
    throw err;
  }
}

/** Restart the app so the sentinel-based updater applies the pending update. */
export async function installDownloadedUpdate(): Promise<void> {
  await invoke('app_relaunch');
}

// Restore pending-update state across sessions and mirror Rust's lifecycle.
let initialized = false;
export async function initAppUpdater(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    const pending = await invoke<{ version: string } | null>('app_updater_get_pending');
    if (pending?.version) {
      appUpdate.set({ phase: 'ready', pendingVersion: pending.version });
    }
  } catch (err) {
    logService.warn(`app_updater_get_pending failed: ${err}`);
  }

  const onChecking = () => appUpdate.set({ phase: 'checking' });
  const onIdle = () => appUpdate.set({ phase: 'idle' });
  const onDownloading = (e: { payload: { version?: string } }) =>
    appUpdate.set({ phase: 'downloading', pendingVersion: e.payload.version });
  const onReady = (e: { payload: { version?: string } }) =>
    appUpdate.set({ phase: 'ready', pendingVersion: e.payload.version });

  try {
    const unlisteners: Promise<UnlistenFn>[] = [
      listen('asyar:app-update:checking', onChecking),
      listen('asyar:app-update:idle', onIdle),
      listen<{ version?: string }>('asyar:app-update:downloading', onDownloading),
      listen<{ version?: string }>('asyar:app-update:ready', onReady),
    ];
    void Promise.all(unlisteners).then((fns) => fns.forEach((fn) => fn()));
  } catch (err) {
    logService.warn(`app updater event listeners failed: ${err}`);
  }
}

void initAppUpdater();
