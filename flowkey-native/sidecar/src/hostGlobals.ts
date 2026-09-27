import * as React from 'react';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import {
  Action,
  ActionPanel,
  Color,
  Detail,
  Form,
  Grid,
  Icon,
  List,
  defineReactExtension,
  useCachedPromise,
  useCachedState,
  useDebounce,
  useFetch,
  useLocalStorage,
  usePromise,
  withCache,
} from '@flowkey-cli/react-ui';
import {
  captureException,
  createCapabilities,
  defineExtension,
  randomId,
} from '@flowkey-cli/native-sdk';

/**
 * Runtime services the sidecar injects into every installed extension bundle.
 * Extension builds alias `react`, `@flowkey-cli/react-ui` and `@flowkey-cli/native-sdk`
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
    Form: typeof Form;
    defineReactExtension: typeof defineReactExtension;
    usePromise: typeof usePromise;
    useFetch: typeof useFetch;
    useDebounce: typeof useDebounce;
    useCachedState: typeof useCachedState;
    useLocalStorage: typeof useLocalStorage;
    useCachedPromise: typeof useCachedPromise;
    withCache: typeof withCache;
    Color: typeof Color;
    Icon: typeof Icon;
  };
  nativeSdk: {
    defineExtension: typeof defineExtension;
    createCapabilities: typeof createCapabilities;
    randomId: typeof randomId;
    captureException: typeof captureException;
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
    reactUi: {
      List,
      Detail,
      Grid,
      Form,
      ActionPanel,
      Action,
      defineReactExtension,
      usePromise,
      useFetch,
      useDebounce,
      useCachedState,
      useLocalStorage,
      useCachedPromise,
      withCache,
      Color,
      Icon,
    },
    nativeSdk: { defineExtension, createCapabilities, randomId, captureException },
  };
}

export function hostGlobals(): FlowKeyHostGlobals {
  if (!globalThis.__FLOWKEY_HOST__) {
    throw new Error('host globals not installed; call installHostGlobals() first');
  }
  return globalThis.__FLOWKEY_HOST__;
}
