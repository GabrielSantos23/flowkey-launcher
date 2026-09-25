import { describe, expect, test } from 'bun:test';
import { TranslateError, deriveToken, parseTranslationResponse, translate, type NativeCallFn } from '../src/api/client';

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
  test('produces the classic text.seed pair shape from the zero seed', () => {
    // Exact value verified against the live endpoint on 2026-09: Google accepted
    // tk=129960.129960 (derived from seed "0") for the text "teste".
    expect(deriveToken('teste', '0')).toBe('129960.129960');
    const token = deriveToken('Hello world', '0');
    expect(token).toMatch(/^\d+\.\d+$/);
    expect(deriveToken('Hello world', '0')).toBe(token);
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
  const ctx = (call: NativeCallFn) => ({ call });

  test('successful translation hits the endpoint directly with a zero-seed token', async () => {
    const { call, calls } = scriptCall([fetchResult(200, okBody)]);
    const result = await translate(ctx(call), 'Olá mundo', { from: 'auto', to: 'en' });
    expect(result.translatedText).toBe('Hello world');
    expect(result.detectedFrom).toBe('en');
    expect(result.langTo).toBe('en');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('http.fetch');
    expect(String(calls[0].params?.url)).toContain('https://translate.google.com/translate_a/single?');
    expect(String(calls[0].params?.url)).toContain('client=dict-chrome-ex');
    expect(String(calls[0].params?.url)).toContain('tk=');
  });

  test('empty input returns an empty result without any network call', async () => {
    const { call, calls } = scriptCall([]);
    const result = await translate(ctx(call), '   ', { from: 'auto', to: 'en' });
    expect(result.translatedText).toBe('');
    expect(calls).toHaveLength(0);
  });

  test('429 surfaces as a distinct rateLimited error', async () => {
    const { call } = scriptCall([fetchResult(429, 'too many')]);
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
    const { call } = scriptCall([fetchResult(503, 'unavailable')]);
    await translate(ctx(call), 'Olá', { from: 'auto', to: 'en' }).then(
      () => {
        throw new Error('expected TranslateError');
      },
      (caught) => expect((caught as TranslateError).code).toBe('rateLimited'),
    );
  });

  test('other non-200 statuses surface as requestFailed', async () => {
    const { call } = scriptCall([fetchResult(500, 'boom')]);
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

  test('non-JSON 200 body maps to invalidResponse pointing at an extension update', async () => {
    const { call } = scriptCall([fetchResult(200, '<html>not json</html>')]);
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
