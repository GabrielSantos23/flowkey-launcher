/**
 * Adapts the typed web capabilities (injected by the webview host page) to the
 * raw `NativeCallFn` the SpotifyClient is built on. Only the methods the
 * client uses are mapped — anything else is rejected fail-closed, matching the
 * shell's undeclared-method behavior.
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
            auth: params.auth as string | undefined,
            discardBody: params.discardBody as boolean | undefined,
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
      case 'image.fetch':
        return { ok: true, uri: await capabilities.image.fetch(params.url as string) };
      case 'clipboard.write':
        return await capabilities.clipboard.write(params.text as string);
      case 'oauth.authorize':
        return await capabilities.oauth.authorize(params.provider as string, {
          clientId: params.clientId as string | undefined,
          signal: options?.signal,
          timeoutMs: options?.timeoutMs,
        });
      case 'oauth.status':
        return await capabilities.oauth.status(params.provider as string, {
          signal: options?.signal,
        });
      case 'oauth.disconnect':
        return await capabilities.oauth.disconnect(params.provider as string);
      default:
        throw {
          code: 'methodNotDeclared',
          message: `native method ${method} is not available to web commands`,
        };
    }
  }) as NativeCallFn;
}
