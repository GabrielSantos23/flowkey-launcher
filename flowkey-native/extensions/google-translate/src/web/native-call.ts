/**
 * Adapts the typed web capabilities (injected by the webview host page) to the
 * raw `NativeCallFn` the translate client is built on. Only the four methods
 * the manifest declares are mapped — anything else is rejected fail-closed,
 * matching the shell's undeclared-method behavior.
 */
import type { FlowKeyCapabilities } from '@flowkey-cli/native-sdk';
import type { NativeCallFn } from '../api/client';

export function capabilitiesToNativeCall(capabilities: FlowKeyCapabilities): NativeCallFn {
  return (async (
    method: string,
    params: Record<string, unknown> = {},
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ) => {
    switch (method) {
      case 'http.fetch': {
        const response = await capabilities.http.fetch(
          params.url as string,
          {
            method: params.method as string | undefined,
            headers: params.headers as Record<string, string> | undefined,
            body: params.body as string | undefined,
            timeoutMs: params.timeoutMs as number | undefined,
            signal: options?.signal,
          } as Parameters<FlowKeyCapabilities['http']['fetch']>[1],
        );
        // the client expects the raw route shape {status, bodyText}
        return {
          status: response.status,
          headers: response.headers,
          bodyText: response.body ?? '',
        };
      }
      case 'clipboard.read':
        return { text: await capabilities.clipboard.read() };
      case 'clipboard.write':
        return await capabilities.clipboard.write(params.text as string);
      case 'hud.show':
        // the shell hides the launcher with the HUD, which is what a copy wants
        return await capabilities.hud.show({
          title: params.title as string,
        });
      default:
        throw {
          code: 'methodNotDeclared',
          message: `native method ${method} is not available to web commands`,
        };
    }
  }) as NativeCallFn;
}
