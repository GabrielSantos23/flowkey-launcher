import * as React from 'react';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import { Action, ActionPanel, Detail, Grid, List, defineReactExtension } from '@flowkey/react-ui';
import { defineExtension } from '@flowkey/native-sdk';

/**
 * Runtime services the sidecar injects into every installed extension bundle.
 * Extension builds alias `react`, `@flowkey/react-ui` and `@flowkey/native-sdk`
 * to shims that read these globals, so React hooks and the UI serializer come
 * from the sidecar's single module instances (two React copies would break
 * hooks; a second component copy would not serialize).
 */
export interface FlowKeyHostGlobals {
  react: typeof React;
  reactJsx: typeof ReactJsxRuntime;
  reactUi: {
    List: typeof List;
    Detail: typeof Detail;
    Grid: typeof Grid;
    ActionPanel: typeof ActionPanel;
    Action: typeof Action;
    defineReactExtension: typeof defineReactExtension;
  };
  nativeSdk: {
    defineExtension: typeof defineExtension;
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __FLOWKEY_HOST__: FlowKeyHostGlobals | undefined;
}

export function installHostGlobals(): void {
  globalThis.__FLOWKEY_HOST__ = {
    react: React,
    reactJsx: ReactJsxRuntime,
    reactUi: { List, Detail, Grid, ActionPanel, Action, defineReactExtension },
    nativeSdk: { defineExtension },
  };
}

export function hostGlobals(): FlowKeyHostGlobals {
  if (!globalThis.__FLOWKEY_HOST__) {
    throw new Error('host globals not installed; call installHostGlobals() first');
  }
  return globalThis.__FLOWKEY_HOST__;
}
