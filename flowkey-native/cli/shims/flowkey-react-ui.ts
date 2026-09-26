/**
 * Runtime shim aliased to `@flowkey/react-ui`. Reads the component set from
 * the sidecar's host globals so the serialized element tags are produced by
 * the same module instances the sidecar's serializer understands.
 */
const host = (
  globalThis as {
    __FLOWKEY_HOST__?: { reactUi?: Record<string, unknown> };
  }
).__FLOWKEY_HOST__;
const reactUi = host?.reactUi ?? {};

function missing(name: string): never {
  throw new Error(
    `the FlowKey sidecar did not provide @flowkey/react-ui (missing ${name}); rebuild the extension with @flowkey/cli`,
  );
}

export const List = reactUi.List ?? (() => missing('List'));
export const Detail = reactUi.Detail ?? (() => missing('Detail'));
export const Grid = reactUi.Grid ?? (() => missing('Grid'));
export const ActionPanel = reactUi.ActionPanel ?? (() => missing('ActionPanel'));
export const Action = reactUi.Action ?? (() => missing('Action'));
export const defineReactExtension = reactUi.defineReactExtension ?? ((module: unknown) => module);
