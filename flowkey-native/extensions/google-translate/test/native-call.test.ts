import { describe, expect, test } from 'bun:test';
import type { FlowKeyCapabilities } from '@flowkey-cli/native-sdk';
import { capabilitiesToNativeCall } from '../src/web/native-call';

const capabilities = (overrides: Record<string, unknown> = {}): FlowKeyCapabilities =>
  ({
    http: { fetch: async () => ({ status: 200, body: 'ok', headers: {} }) },
    clipboard: { read: async () => 'from the clipboard', write: async () => {} },
    hud: { show: async () => {} },
    ...overrides,
  }) as unknown as FlowKeyCapabilities;

describe('capabilitiesToNativeCall', () => {
  test('routes clipboard.write through the clipboard capability', async () => {
    const written: string[] = [];
    const call = capabilitiesToNativeCall(
      capabilities({
        clipboard: {
          read: async () => '',
          write: async (text: string) => {
            written.push(text);
          },
        },
      }),
    );

    await call('clipboard.write', { text: 'Olá mundo' });

    expect(written).toEqual(['Olá mundo']);
  });

  test('routes hud.show, so confirming a copy also dismisses the window', async () => {
    const shown: unknown[] = [];
    const call = capabilitiesToNativeCall(
      capabilities({
        hud: {
          show: async (request: unknown) => {
            shown.push(request);
          },
        },
      }),
    );

    await call('hud.show', { title: 'Copy Translation — copied' });

    expect(shown).toEqual([{ title: 'Copy Translation — copied' }]);
  });

  test('unwraps http.fetch into the raw route shape the client expects', async () => {
    const call = capabilitiesToNativeCall(
      capabilities({
        http: { fetch: async () => ({ status: 201, body: 'payload', headers: { a: 'b' } }) },
      }),
    );

    expect(
      await call<{ status: number; bodyText: string; headers: Record<string, string> }>(
        'http.fetch',
        { url: 'https://translate.google.com' },
      ),
    ).toEqual({
      status: 201,
      bodyText: 'payload',
      headers: { a: 'b' },
    });
  });

  test('fails closed on any method the manifest does not declare', async () => {
    const call = capabilitiesToNativeCall(capabilities());

    expect(call('secrets.get', { key: 'token' })).rejects.toMatchObject({
      code: 'methodNotDeclared',
    });
  });
});
