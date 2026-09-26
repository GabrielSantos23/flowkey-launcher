import { describe, expect, test } from 'bun:test';
import { NativeBridge } from '../src/bridge';
import type { NativeResultMessage, SidecarMessage } from '@flowkey-cli/native-sdk';

describe('NativeBridge', () => {
  test('rejects with nativeTimeout after the custom timeoutMs elapses', async () => {
    const sent: SidecarMessage[] = [];
    const bridge = new NativeBridge((message) => sent.push(message));
    const pending = bridge.call(
      'ext-a',
      'oauth.authorize',
      { provider: 'spotify' },
      { timeoutMs: 30 },
    );
    let error: { code: string } | undefined;
    try {
      await pending;
    } catch (caught) {
      error = caught as { code: string };
    }
    expect(error?.code).toBe('nativeTimeout');
  });

  test('resolves when the result arrives before the custom timeout', async () => {
    const sent: SidecarMessage[] = [];
    const bridge = new NativeBridge((message) => sent.push(message));
    const pending = bridge.call<{ ok: boolean }>(
      'ext-a',
      'secrets.get',
      { key: 'k' },
      { timeoutMs: 500 },
    );
    const requestId = (sent[0] as { requestId: string }).requestId;
    bridge.handleResult({
      type: 'nativeResult',
      requestId,
      ok: true,
      result: { ok: true },
    } as NativeResultMessage);
    expect(await pending).toEqual({ ok: true });
  });
});
