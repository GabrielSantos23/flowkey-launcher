/**
 * Runtime shim aliased to `@flowkey/native-sdk`. The SDK is types-only at
 * runtime (contexts and capabilities are injected as props); only the
 * `defineExtension` identity helper comes through the host.
 */
const host = (
  globalThis as {
    __FLOWKEY_HOST__?: { nativeSdk?: Record<string, unknown> };
  }
).__FLOWKEY_HOST__;

export const defineExtension =
  (host?.nativeSdk?.defineExtension as ((module: unknown) => unknown) | undefined) ??
  ((module: unknown) => module);
