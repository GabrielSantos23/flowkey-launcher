export type NativeCallFn = <T = unknown>(
  method: string,
  params?: Record<string, unknown>,
  options?: { signal?: AbortSignal; timeoutMs?: number },
) => Promise<T>;

interface FetchResult {
  status: number;
  bodyText: string;
}

/**
 * Failure codes surfaced to the UI, kept distinct so the user can tell
 * "the query has no translation" apart from "the endpoint is unusable right now".
 */
export type TranslateErrorCode =
  | 'rateLimited'
  | 'tokenUnavailable'
  | 'invalidResponse'
  | 'requestFailed'
  | 'invalidParams';

export class TranslateError extends Error {
  constructor(
    readonly code: TranslateErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface TranslateOptions {
  from: string;
  to: string;
}

export interface TranslateResult {
  originalText: string;
  translatedText: string;
  pronunciationText?: string;
  /** Language Google detected, populated when from is 'auto'. */
  detectedFrom?: string;
  langTo: string;
}

const TRANSLATE_BASE = 'https://translate.google.com/translate_a/single';
const HOMEPAGE_URL = 'https://translate.google.com';
const REQUEST_TIMEOUT_MS = 15_000;
const TKK_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

interface TkkCache {
  value: string;
  fetchedAt: number;
}

const tkkCache: TkkCache = { value: '', fetchedAt: 0 };

/** Test-only hooks: the TKK cache is module-global, so tests must reset/seed it. */
export function __resetTkkCacheForTests(): void {
  tkkCache.value = '';
  tkkCache.fetchedAt = 0;
}

export function __seedTkkCacheForTests(value: string, fetchedAt = Date.now()): void {
  tkkCache.value = value;
  tkkCache.fetchedAt = fetchedAt;
}

// ---------------------------------------------------------------------------
// tk token derivation (reverse-engineered Google Translate web algorithm;
// same computation the vendor library in the reference extension performs).
// ---------------------------------------------------------------------------

function shiftOrXor(a: number, b: string): number {
  for (let i = 0; i < b.length - 2; i += 3) {
    const c = b.charAt(i + 2);
    let d = c >= 'a' ? c.charCodeAt(0) - 87 : Number(c);
    d = b.charAt(i + 1) === '+' ? a >>> d : a << d;
    a = b.charAt(i) === '+' ? (a + d) & 4294967295 : a ^ d;
  }
  return a;
}

function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code < 128) {
      bytes[bytes.length] = code;
    } else if (code < 2048) {
      bytes[bytes.length] = (code >> 6) | 192;
    } else if ((code & 64512) === 55296 && i + 1 < text.length && (text.charCodeAt(i + 1) & 64512) === 56320) {
      code = 65536 + ((code & 1023) << 10) + (text.charCodeAt(++i) & 1023);
      bytes[bytes.length] = (code >> 18) | 240;
      bytes[bytes.length] = ((code >> 12) & 63) | 128;
    } else {
      bytes[bytes.length] = (code >> 12) | 224;
    }
    bytes[bytes.length] = ((code >> 6) & 63) | 128;
    bytes[bytes.length] = (code & 63) | 128;
  }
  return bytes;
}

/** Pure tk computation for one text against one TKK value ("epoch.seed"). */
export function deriveToken(text: string, tkk: string): string {
  const seeds = tkk.split('.');
  const epoch = Number(seeds[0]) || 0;
  const seed = Number(seeds[1]) || 0;

  let a = epoch;
  const bytes = utf8Bytes(text);
  for (const byte of bytes) {
    a += byte;
    a = shiftOrXor(a, '+-a^+6');
  }
  a = shiftOrXor(a, '+-3^+b+-f');
  a ^= seed;
  if (a < 0) a = (a & 2147483647) + 2147483648;
  a %= 1e6;
  return `${a.toString()}.${a ^ epoch}`;
}

async function fetchTkk(call: NativeCallFn, signal?: AbortSignal): Promise<string> {
  const result = await call<FetchResult>('http.fetch', { url: HOMEPAGE_URL, method: 'GET', timeoutMs: 10_000 }, {
    signal,
  });
  if (result.status !== 200) {
    throw new TranslateError('tokenUnavailable', `Google homepage returned HTTP ${result.status} fetching the token seed.`, result.status);
  }
  const match = result.bodyText.match(/tkk:'\d+\.\d+'/);
  if (!match) {
    throw new TranslateError(
      'tokenUnavailable',
      'Google homepage did not contain the expected token seed — the extension may need an update.',
    );
  }
  return match[0].split(':')[1].replace(/'/g, '');
}

async function currentTkk(call: NativeCallFn, signal?: AbortSignal): Promise<string> {
  const now = Date.now();
  if (tkkCache.value && now - tkkCache.fetchedAt < TKK_REFRESH_INTERVAL_MS) {
    return tkkCache.value;
  }
  try {
    const value = await fetchTkk(call, signal);
    tkkCache.value = value;
    tkkCache.fetchedAt = now;
    return value;
  } catch (caught) {
    // A stale seed is better than none: Google accepts old TKK values for a while.
    if (tkkCache.value) return tkkCache.value;
    if (caught instanceof TranslateError) throw caught;
    throw new TranslateError(
      'tokenUnavailable',
      'Could not reach Google to obtain the translation token seed — check your connection.',
    );
  }
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

export interface ParsedTranslation {
  translatedText: string;
  pronunciationText?: string;
  detectedFrom?: string;
}

/**
 * Parses the positional array `translate_a/single` returns:
 *  - body[0][i][0]  translated text segments (index 1 may hold romanization at [2])
 *  - body[2]        detected source language
 *  - body[7][0]     autocorrect suggestion with <b><i> markup
 *  - body[8][0][0]  alternative detection ("did you mean")
 * Throws TranslateError('invalidResponse') when the shape is unrecognizable,
 * which is the signal that Google changed the endpoint.
 */
export function parseTranslationResponse(rawBody: unknown): ParsedTranslation {
  if (!Array.isArray(rawBody) || !Array.isArray(rawBody[0])) {
    throw new TranslateError(
      'invalidResponse',
      'Google returned an unrecognized response shape — the extension may need an update.',
    );
  }
  const segments = rawBody[0] as unknown[];
  let translatedText = '';
  let pronunciationText: string | undefined;
  for (const segment of segments) {
    if (!Array.isArray(segment)) continue;
    if (typeof segment[0] === 'string') {
      translatedText += segment[0];
    }
    // Romanization rides in segments without translated text: [null, null, "translit"].
    if (typeof segment[2] === 'string' && segment[2].length > 0) {
      pronunciationText = segment[2];
    }
  }
  let detectedFrom: string | undefined;
  if (typeof rawBody[2] === 'string' && rawBody[2]) {
    detectedFrom = rawBody[2];
  } else if (Array.isArray(rawBody[8]) && Array.isArray((rawBody[8] as unknown[])[0])) {
    const alt = ((rawBody[8] as unknown[])[0] as unknown[])[0];
    if (typeof alt === 'string' && alt) detectedFrom = alt;
  }
  return { translatedText, pronunciationText, detectedFrom };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

async function callTranslate(
  call: NativeCallFn,
  text: string,
  options: TranslateOptions,
  signal?: AbortSignal,
): Promise<unknown> {
  const tkk = await currentTkk(call, signal);
  const tk = deriveToken(text, tkk);
  const params = new URLSearchParams({
    client: 'dict-chrome-ex',
    sl: options.from,
    tl: options.to,
    hl: options.to,
    dt: 't',
    ie: 'UTF-8',
    oe: 'UTF-8',
    otf: '1',
    ssel: '0',
    tsel: '0',
    kc: '7',
    tk,
  });
  const query = params.toString();
  const url = `${TRANSLATE_BASE}?${query}&q=${encodeURIComponent(text)}`;
  const init: Record<string, unknown> = { url, method: 'GET', timeoutMs: REQUEST_TIMEOUT_MS };
  // The endpoint rejects very long GET URLs; move the text into a form POST past 2048 chars.
  if (url.length > 2048) {
    init.url = `${TRANSLATE_BASE}?${query}`;
    init.method = 'POST';
    init.body = `q=${encodeURIComponent(text)}`;
    init.headers = { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' };
  }

  let result: FetchResult;
  try {
    result = await call<FetchResult>('http.fetch', init, { signal, timeoutMs: REQUEST_TIMEOUT_MS + 5_000 });
  } catch (caught) {
    if (caught instanceof TranslateError) throw caught;
    const message = caught instanceof Error ? caught.message : String(caught);
    throw new TranslateError('requestFailed', `Network request to Google failed: ${message}`);
  }

  if (result.status === 429 || result.status === 503) {
    throw new TranslateError(
      'rateLimited',
      'Google is rate limiting translation requests (HTTP ' + result.status + ') — please try again later.',
      result.status,
    );
  }
  if (result.status !== 200) {
    throw new TranslateError('requestFailed', `Google returned HTTP ${result.status} for the translation request.`, result.status);
  }

  let body: unknown;
  try {
    body = JSON.parse(result.bodyText);
  } catch {
    throw new TranslateError(
      'invalidResponse',
      'Google returned non-JSON content — the extension may need an update.',
    );
  }
  return body;
}

export async function translate(
  ctx: { call: NativeCallFn; signal?: AbortSignal },
  text: string,
  options: TranslateOptions,
): Promise<TranslateResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { originalText: text, translatedText: '', langTo: options.to };
  }
  const body = await callTranslate(ctx.call, trimmed, options, ctx.signal);
  const parsed = parseTranslationResponse(body);
  return {
    originalText: text,
    translatedText: parsed.translatedText,
    pronunciationText: parsed.pronunciationText,
    detectedFrom: options.from === 'auto' ? parsed.detectedFrom : undefined,
    langTo: options.to,
  };
}

export function describeTranslateError(error: unknown): string {
  if (error instanceof TranslateError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
