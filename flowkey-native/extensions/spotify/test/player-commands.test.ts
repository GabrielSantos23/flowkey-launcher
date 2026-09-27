import { describe, expect, test } from 'bun:test';
import { mediaSkipOutcome } from '../src/player-commands';
import type { NativeCallFn } from '../src/api/client';

interface RecordedCall {
  method: string;
  params: Record<string, unknown> | undefined;
}

type ScriptedResponse = { result?: unknown; error?: { code: string; message: string } };

function scriptCall(responses: ScriptedResponse[]): { call: NativeCallFn; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const call = (async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params });
    const next = responses.shift();
    if (!next) {
      throw { code: 'noScriptedResponse', message: 'test scripted no further responses' };
    }
    if (next.error) {
      throw next.error;
    }
    return next.result;
  }) as NativeCallFn;
  return { call, calls };
}

const playingSnapshot = {
  result: {
    playing: true,
    title: 'Test Track',
    artist: 'Test Artist',
    album: null,
    positionMs: 0,
    durationMs: 0,
    updatedAtMs: 0,
  },
};

describe('mediaSkipOutcome', () => {
  test('next sends the Windows media control command and reports the skipped track', async () => {
    const { call, calls } = scriptCall([playingSnapshot, { result: { ok: true } }]);

    const outcome = await mediaSkipOutcome('next', call);

    expect(outcome).toEqual({ kind: 'message', title: 'Skipped Test Track' });
    expect(calls).toEqual([
      { method: 'media.current', params: undefined },
      { method: 'media.control', params: { command: 'next' } },
    ]);
  });

  test('previous reports the track it went back to', async () => {
    const { call, calls } = scriptCall([playingSnapshot, { result: { ok: true } }]);

    const outcome = await mediaSkipOutcome('previous', call);

    expect(outcome).toEqual({ kind: 'message', title: 'Went back to Test Track' });
    expect(calls[1]).toEqual({ method: 'media.control', params: { command: 'previous' } });
  });

  test('reports no track playing when no media session exists', async () => {
    const { call } = scriptCall([
      {
        result: {
          playing: false,
          title: null,
          artist: null,
          album: null,
          positionMs: 0,
          durationMs: 0,
          updatedAtMs: 0,
        },
      },
      { result: { ok: true } },
    ]);

    const outcome = await mediaSkipOutcome('next', call);

    expect(outcome).toEqual({ kind: 'noTrack' });
  });

  test('still skips with a generic message when the snapshot is unavailable', async () => {
    const { call, calls } = scriptCall([
      { error: { code: 'unavailable', message: 'media sessions unavailable' } },
      { result: { ok: true } },
    ]);

    const outcome = await mediaSkipOutcome('next', call);

    expect(outcome).toEqual({ kind: 'message', title: 'Skipped to next track' });
    expect(calls[1]).toEqual({ method: 'media.control', params: { command: 'next' } });
  });

  test('surfaces the control failure instead of a success message', async () => {
    const { call, calls } = scriptCall([
      playingSnapshot,
      { error: { code: 'failed', message: 'media control failed' } },
    ]);

    const outcome = await mediaSkipOutcome('next', call);

    expect(outcome).toEqual({ kind: 'message', title: 'media control failed' });
    expect(calls).toHaveLength(2);
  });
});
