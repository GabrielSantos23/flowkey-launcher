import { describe, expect, test } from 'bun:test';
import type { FlowKeyCapabilities } from '@flowkey-cli/native-sdk';
import { SpotifyClient } from '../../src/api/client';
import { capabilitiesToNativeCall } from '../../src/web/native-call';

interface Recorded {
  group: string;
  args: unknown[];
}

function stubCapabilities(results: Record<string, unknown> = {}): {
  capabilities: FlowKeyCapabilities;
  recorded: Recorded[];
} {
  const recorded: Recorded[] = [];
  const record =
    (group: string, fallback: unknown) =>
    async (...args: unknown[]) => {
      recorded.push({ group, args });
      return results[group] ?? fallback;
    };
  const capabilities = {
    http: {
      fetch: record('http.fetch', { status: 200, headers: {}, body: '{}' }),
    },
    image: {
      fetch: record('image.fetch', 'file:///C:/cache/a.png'),
    },
    clipboard: {
      write: record('clipboard.write', {}),
    },
    oauth: {
      authorize: record('oauth.authorize', { ok: true }),
      status: record('oauth.status', { ok: true }),
      disconnect: record('oauth.disconnect', {}),
    },
  };
  return { capabilities: capabilities as unknown as FlowKeyCapabilities, recorded };
}

describe('capabilitiesToNativeCall', () => {
  test('http.fetch maps to the typed http group and restores the raw result shape', async () => {
    const { capabilities, recorded } = stubCapabilities({
      'http.fetch': {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'user-1',
          display_name: 'me',
          product: 'premium',
          country: 'US',
        }),
      },
    });
    const client = new SpotifyClient(capabilitiesToNativeCall(capabilities));

    const me = await client.me();

    expect(me.id).toBe('user-1');
    expect(recorded[0].group).toBe('http.fetch');
    const [url, options] = recorded[0].args as [string, Record<string, unknown>];
    expect(url).toBe('https://api.spotify.com/v1/me');
    expect(options.method).toBe('GET');
    expect(options.auth).toBe('spotify');
  });

  test('http.fetch keeps the request timeout in the forwarded options', async () => {
    const { capabilities, recorded } = stubCapabilities();
    const client = new SpotifyClient(capabilitiesToNativeCall(capabilities));
    await client.me();
    const [, options] = recorded[0].args as [string, Record<string, unknown>];
    expect(options.timeoutMs).toBe(15_000);
  });

  test('image.fetch returns the cached uri produced by the image group', async () => {
    const { capabilities, recorded } = stubCapabilities();
    const client = new SpotifyClient(capabilitiesToNativeCall(capabilities));
    const uri = await client.fetchImage('https://i.scdn.co/a.jpg');
    expect(uri).toBe('file:///C:/cache/a.png');
    expect(recorded[0]).toEqual({ group: 'image.fetch', args: ['https://i.scdn.co/a.jpg'] });
  });

  test('clipboard.write routes through the clipboard group', async () => {
    const { capabilities, recorded } = stubCapabilities();
    const client = new SpotifyClient(capabilitiesToNativeCall(capabilities));
    await client.copyText('hello');
    expect(recorded[0]).toEqual({ group: 'clipboard.write', args: ['hello'] });
  });

  test('oauth calls keep the spotify provider, client id and timeouts', async () => {
    const { capabilities, recorded } = stubCapabilities();
    const client = new SpotifyClient(capabilitiesToNativeCall(capabilities));
    const controller = new AbortController();

    await client.authorize(controller.signal, 'my-client-id');
    expect(recorded[0].group).toBe('oauth.authorize');
    expect(recorded[0].args[0]).toBe('spotify');
    const authorizeOptions = recorded[0].args[1] as Record<string, unknown>;
    expect(authorizeOptions.clientId).toBe('my-client-id');
    expect(authorizeOptions.signal).toBe(controller.signal);
    expect(authorizeOptions.timeoutMs).toBe(150_000);

    await client.authStatus();
    expect(recorded[1].group).toBe('oauth.status');

    await client.disconnect();
    expect(recorded[2].group).toBe('oauth.disconnect');
  });

  test('undeclared methods are rejected with methodNotDeclared', async () => {
    const { capabilities } = stubCapabilities();
    const call = capabilitiesToNativeCall(capabilities);
    await expect(call('fs.readText', { path: 'C:/x' })).rejects.toEqual(
      expect.objectContaining({ code: 'methodNotDeclared' }),
    );
  });
});
