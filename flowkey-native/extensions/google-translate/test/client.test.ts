import { beforeEach, describe, expect, test } from 'bun:test';
import {
  TranslateError,
  deriveToken,
  parseTranslationResponse,
  translate,
  __resetTkkCacheForTests,
  __seedTkkCacheForTests,
  type NativeCallFn,
} from '../src/api/client';

interface RecordedCall {
  method: string;
  params: Record<string, unknown> | undefined;
}

type ScriptedResponse = { result?: unknown; error?: unknown };

function scriptCall(responses: ScriptedResponse[]): { call: NativeCallFn; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const call = (async (method: string, params?: Record<string, unknown>) => {
    calls.push({ method, params });
    const next = responses.shift();
    if (!next) throw new Error('no scripted response');
    if (next.error !== undefined) throw next.error;
    return next.result;
  }) as NativeCallFn;
  return { call, calls };
}

const homepageOk = () => ({
  result: { status: 200, bodyText: "...tkk:'444123.987654'...", headers: {}, truncated: false },
});

const fetchResult = (status: number, bodyText: string) => ({
  result: { status, bodyText, headers: {}, truncated: false },
});

// A realistic translate_a/single payload: one translated segment, romanization
// in segment index 1 slot [2], detected language, and an autocorrect entry.
const okBody = JSON.stringify([
  [
    ['Hello world', 'Olá mundo', null, null, 10],
    [null, null, 'həˈloʊ wɜːld'],
  ],
  null,
  'en',
  ,
  ,
  ,
  ,
  [['hello', '<b><i>hallo</i></b>', null, null, 10]],
  [['en']],
  [],
]);

describe('deriveToken', () => {
  test('produces the classic text.seed pair shape', () => {
    const token = deriveToken('Hello world', '444123.987654');
    expect(token).toMatch(/^\d+\.\d+$/);
    // Deterministic for identical inputs.
    expect(deriveToken('Hello world', '444123.987654')).toBe(token);
    // Different seed produces a different token.
    expect(deriveToken('Hello world', '0.1')).not.toBe(token);
  });
});

describe('parseTranslationResponse', () => {
  test('parses a successful translation with pronunciation and detection', () => {
    const parsed = parseTranslationResponse(JSON.parse(okBody));
    expect(parsed.translatedText).toBe('Hello world');
    expect(parsed.pronunciationText).toBe('həˈloʊ wɜːld');
    expect(parsed.detectedFrom).toBe('en');
  });

  test('empty translation (valid response, no segments) is not an error', () => {
    const parsed = parseTranslationResponse([[], null, 'en']);
    expect(parsed.translatedText).toBe('');
  });

  test('unrecognized shape raises invalidResponse, not a crash', () => {
    for (const bad of [null, {}, [], ['nope'], [42]]) {
      expect(() => parseTranslationResponse(bad)).toThrow(TranslateError);
      try {
        parseTranslationResponse(bad);
      } catch (caught) {
        expect((caught as TranslateError).code).toBe('invalidResponse');
        expect((caught as TranslateError).message).toContain('extension may need an update');
      }
    }
  });
});

describe('translate client', () => {
  beforeEach(() => __resetTkkCacheForTests());
  const ctx = (call: NativeCallFn) => ({ call });

  test('successful translation fetches homepage seed then the endpoint', async () => {
    const { call, calls } = scriptCall([homepageOk(), fetchResult(200, okBody)]);
    const result = await translate(ctx(call), 'Olá mundo', { from: 'auto', to: 'en' });
    expect(result.translatedText).toBe('Hello world');
    expect(result.detectedFrom).toBe('en');
    expect(result.langTo).toBe('en');
    expect(calls[0].method).toBe('http.fetch');
    expect(String(calls[0].params?.url)).toBe('https://translate.google.com');
    expect(String(calls[1].params?.url)).toContain('https://translate.google.com/translate_a/single?');
    expect(String(calls[1].params?.url)).toContain('client=dict-chrome-ex');
    expect(String(calls[1].params?.url)).toContain('tk=');
  });

  test('caches the homepage seed between calls', async () => {
    const { call, calls } = scriptCall([homepageOk(), fetchResult(200, okBody), fetchResult(200, okBody)]);
    await translate(ctx(call), 'Olá mundo', { from: 'auto', to: 'en' });
    await translate(ctx(call), 'Outro texto', { from: 'auto', to: 'en' });
    expect(calls.filter((entry) => entry.params?.url === 'https://translate.google.com')).toHaveLength(1);
  });

  test('empty input returns an empty result without any network call', async () => {
    const { call, calls } = scriptCall([]);
    const result = await translate(ctx(call), '   ', { from: 'auto', to: 'en' });
    expect(result.translatedText).toBe('');
    expect(calls).toHaveLength(0);
  });

  test('429 surfaces as a distinct rateLimited error', async () => {
    const { call } = scriptCall([homepageOk(), fetchResult(429, 'too many')]);
    try {
      await translate(ctx(call), 'Olá', { from: 'auto', to: 'en' });
      throw new Error('expected TranslateError');
    } catch (caught) {
      expect(caught).toBeInstanceOf(TranslateError);
      expect((caught as TranslateError).code).toBe('rateLimited');
      expect((caught as TranslateError).message).toContain('try again later');
    }
  });

  test('503 also surfaces as rateLimited', async () => {
    const { call } = scriptCall([homepageOk(), fetchResult(503, 'unavailable')]);
    await translate(ctx(call), 'Olá', { from: 'auto', to: 'en' }).then(
      () => {
        throw new Error('expected TranslateError');
      },
      (caught) => expect((caught as TranslateError).code).toBe('rateLimited'),
    );
  });

  test('other non-200 statuses surface as requestFailed', async () => {
    const { call } = scriptCall([homepageOk(), fetchResult(500, 'boom')]);
    await translate(ctx(call), 'Olá', { from: 'auto', to: 'en' }).then(
      () => {
        throw new Error('expected TranslateError');
      },
      (caught) => {
        expect((caught as TranslateError).code).toBe('requestFailed');
        expect((caught as TranslateError).status).toBe(500);
      },
    );
  });

  test('homepage seed failure without a cached seed surfaces tokenUnavailable', async () => {
    const { call } = scriptCall([fetchResult(503, 'down')]);
    await translate(ctx(call), 'Olá', { from: 'auto', to: 'en' }).then(
      () => {
        throw new Error('expected TranslateError');
      },
      (caught) => {
        expect((caught as TranslateError).code).toBe('tokenUnavailable');
        expect((caught as TranslateError).message).toContain('token seed');
      },
    );
  });

  test('homepage seed failure falls back to a previously cached seed', async () => {
    __seedTkkCacheForTests('444123.987654');
    const { call, calls } = scriptCall([fetchResult(200, okBody)]);
    const result = await translate(ctx(call), 'Segunda', { from: 'auto', to: 'en' });
    expect(result.translatedText).toBe('Hello world');
    // Only the endpoint was called; the stale-seeded homepage fetch never happened.
    expect(calls).toHaveLength(1);
  });

  test('a token the endpoint rejects (non-200 / bad JSON) maps to invalidResponse or requestFailed', async () => {
    const { call } = scriptCall([homepageOk(), fetchResult(200, '<html>not json</html>')]);
    await translate(ctx(call), 'Olá', { from: 'auto', to: 'en' }).then(
      () => {
        throw new Error('expected TranslateError');
      },
      (caught) => {
        expect((caught as TranslateError).code).toBe('invalidResponse');
        expect((caught as TranslateError).message).toContain('extension may need an update');
      },
    );
  });
});
