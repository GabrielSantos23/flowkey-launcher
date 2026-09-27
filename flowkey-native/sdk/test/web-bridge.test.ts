import { describe, expect, test } from 'bun:test';
import { createWebCapabilities, type WebHostLink } from '../src/web/bridge';

function fakeLink(): {
  link: WebHostLink;
  posted: Record<string, unknown>[];
  respond: (result: unknown) => void;
} {
  const posted: Record<string, unknown>[] = [];
  let handler: ((message: { bridgeId: string; ok: boolean; result?: unknown }) => void) | null =
    null;
  const link: WebHostLink = {
    post: (message) => posted.push(message),
    addResultHandler: (h) => {
      handler = h as never;
    },
  };
  return {
    link,
    posted,
    respond: (result) => handler?.({ bridgeId: String(posted.at(-1)?.bridgeId), ok: true, result }),
  };
}

describe('web capabilities adapter', () => {
  test('http.fetch posts the method with params and maps the shell result', async () => {
    const { link, posted, respond } = fakeLink();
    const capabilities = createWebCapabilities(link);
    const controller = new AbortController();

    const promise = capabilities.http.fetch('https://speed.cloudflare.com/meta', {
      discardBody: true,
      signal: controller.signal,
    });
    expect(posted[0].type).toBe('webCall');
    expect(posted[0].method).toBe('http.fetch');
    expect((posted[0].params as Record<string, unknown>).url).toBe(
      'https://speed.cloudflare.com/meta',
    );
    expect((posted[0].params as Record<string, unknown>).discardBody).toBe(true);

    respond({ status: 200, headers: {}, bodyText: null, bytesReceived: 4096 });
    const response = await promise;
    expect(response.status).toBe(200);
    expect(response.body).toBeUndefined();
    expect(response.bytesReceived).toBe(4096);
  });

  test('http.fetchJson parses the shell bodyText payload', async () => {
    const { link, respond } = fakeLink();
    const capabilities = createWebCapabilities(link);
    const promise = capabilities.http.fetchJson<{ ok: boolean }>(
      'https://speed.cloudflare.com/meta',
    );
    respond({ status: 200, headers: {}, bodyText: '{"ok":true}' });
    expect(await promise).toEqual({ ok: true });
  });

  test('storage.get unwraps the ok envelope', async () => {
    const { link, respond } = fakeLink();
    const capabilities = createWebCapabilities(link);
    const promise = capabilities.storage.get('token');
    respond({ ok: true, value: { jwt: 'x' } });
    expect(await promise).toEqual({ jwt: 'x' });
  });

  test('clipboard.write sends the text param', async () => {
    const { link, posted, respond } = fakeLink();
    const capabilities = createWebCapabilities(link);
    const promise = capabilities.clipboard.write('summary');
    respond({ ok: true });
    await promise;
    expect(posted[0].method).toBe('clipboard.write');
    expect(posted[0].params).toEqual({ text: 'summary' });
  });

  test('aborting the signal posts webAbort and rejects', async () => {
    const { link, posted } = fakeLink();
    const capabilities = createWebCapabilities(link);
    const controller = new AbortController();
    const promise = capabilities.http.fetch('https://speed.cloudflare.com/__down?bytes=4000000', {
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toEqual({ code: 'aborted', message: expect.any(String) });
    expect(posted.some((m) => m.type === 'webAbort')).toBe(true);
  });
});
