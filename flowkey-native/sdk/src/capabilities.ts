import type { HudOptions } from './types';

/** Raw native transport available on every extension context. */
export type NativeCaller = <T = unknown>(
  method: string,
  params?: Record<string, unknown>,
  options?: { signal?: AbortSignal; timeoutMs?: number },
) => Promise<T>;

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body?: string;
}

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Request OAuth token injection for a provider declared in the manifest. */
  auth?: string;
}

export interface AppEntry {
  id: string;
  name: string;
  iconUri?: string;
}

export interface MediaSnapshot {
  isPlaying: boolean;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  positionSeconds?: number;
  durationSeconds?: number;
}

export interface HistoryEntry {
  id: string;
  text: string;
}

/**
 * Typed capability groups over the raw native-call transport. Built once per
 * extension by the sidecar and injected into every context and component's
 * props, so extensions never hand-roll `native.call('namespace.method', ...)`
 * strings. Every method still goes through the shell's manifest and consent
 * gate on the host side.
 */
export interface FlowKeyCapabilities {
  /** Host-allowlisted HTTP (every request is checked against manifest httpHosts). */
  http: {
    fetch(url: string, options?: FetchOptions): Promise<HttpResponse>;
    fetchJson<T = unknown>(url: string, options?: FetchOptions): Promise<T>;
  };
  clipboard: {
    read(): Promise<string | null>;
    write(text: string): Promise<void>;
    /** Writes the text and pastes it into the foreground application. */
    paste(text: string): Promise<void>;
    history(options?: { query?: string; limit?: number }): Promise<HistoryEntry[]>;
  };
  storage: {
    get<T = unknown>(key: string): Promise<T | null>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
    keys(): Promise<string[]>;
  };
  secrets: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  };
  shell: {
    openUrl(url: string): Promise<void>;
  };
  apps: {
    list(query?: string): Promise<AppEntry[]>;
    launch(id: string): Promise<void>;
  };
  media: {
    current(): Promise<MediaSnapshot>;
    control(action: string): Promise<void>;
  };
  image: {
    /** Downloads, downscales and caches an allowlisted image; returns a file: URI. */
    fetch(url: string): Promise<string>;
  };
  hud: {
    show(options: HudOptions): Promise<void>;
  };
}

function unwrapOk(result: { ok?: boolean } | undefined, method: string): void {
  if (result && result.ok === false) {
    throw new Error(`native call ${method} failed`);
  }
}

export function createCapabilities(call: NativeCaller): FlowKeyCapabilities {
  const httpFetch = async (url: string, options?: FetchOptions): Promise<HttpResponse> =>
    await call<{ status: number; headers: Record<string, string>; body?: string }>('http.fetch', {
      url,
      ...options,
    });

  return {
    http: {
      fetch: httpFetch,
      async fetchJson<T = unknown>(url: string, options?: FetchOptions): Promise<T> {
        const response = await httpFetch(url, options);
        return JSON.parse(response.body ?? '{}') as T;
      },
    },
    clipboard: {
      async read() {
        const result = await call<{ text?: string | null }>('clipboard.read');
        return result.text ?? null;
      },
      async write(text) {
        await call('clipboard.write', { text });
      },
      async paste(text) {
        await call('clipboard.paste', { text });
      },
      async history(options) {
        const result = await call<{ items?: HistoryEntry[] }>('clipboard.history', {
          query: options?.query,
          limit: options?.limit,
        });
        return result.items ?? [];
      },
    },
    storage: {
      async get<T = unknown>(key: string): Promise<T | null> {
        const result = await call<{ ok: boolean; value?: unknown }>('storage.get', { key });
        unwrapOk(result, 'storage.get');
        return (result.value ?? null) as T | null;
      },
      async set(key, value) {
        await call('storage.set', { key, value });
      },
      async delete(key) {
        await call('storage.delete', { key });
      },
      async keys() {
        const result = await call<{ ok: boolean; keys?: string[] }>('storage.keys');
        return result.keys ?? [];
      },
    },
    secrets: {
      async get(key) {
        const result = await call<{ ok?: boolean; value?: string }>('secrets.get', { key });
        unwrapOk(result, 'secrets.get');
        return result.value ?? null;
      },
      async set(key, value) {
        await call('secrets.set', { key, value });
      },
      async delete(key) {
        await call('secrets.delete', { key });
      },
    },
    shell: {
      async openUrl(url) {
        await call('shell.openUrl', { url });
      },
    },
    apps: {
      async list(query) {
        const result = await call<{ items?: AppEntry[] }>('apps.list', { query });
        return result.items ?? [];
      },
      async launch(id) {
        await call('apps.launch', { id });
      },
    },
    media: {
      async current() {
        return call<MediaSnapshot>('media.current');
      },
      async control(action) {
        await call('media.control', { action });
      },
    },
    image: {
      async fetch(url) {
        const result = await call<{ ok?: boolean; uri?: string }>('image.fetch', { url });
        unwrapOk(result, 'image.fetch');
        return result.uri ?? '';
      },
    },
    hud: {
      async show(options) {
        await call('hud.show', { ...options });
      },
    },
  };
}
