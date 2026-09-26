import type { ComponentType } from 'react';
import type {
  ExtensionManifest,
  FlowKeyCapabilities,
  HudOptions,
  Preferences,
} from '@flowkey-cli/native-sdk';

export interface ReactNativeContext {
  call<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<T>;
  showHud(options: HudOptions): Promise<void>;
}

export interface CommandProps {
  query: string;
  filterValue?: string;
  commandId?: string;
  preferences: Preferences;
  native: ReactNativeContext;
  /** Typed capability groups (http, storage, clipboard, …) — same as `native`, but ergonomic. */
  capabilities: FlowKeyCapabilities;
  signal: AbortSignal;
}

export interface ReactExtensionModule {
  manifest: ExtensionManifest;
  component: ComponentType<CommandProps>;
}

export function defineReactExtension(module: ReactExtensionModule): ReactExtensionModule {
  return module;
}
