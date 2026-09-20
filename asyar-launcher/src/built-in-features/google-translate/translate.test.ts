import { describe, it, expect, vi } from 'vitest';
import {
  simpleTranslate,
  doubleWayTranslate,
  multiTranslate,
  getGoogleTranslateWebUrl,
} from './simpleTranslate';
import { getLanguageName, getISOCode, languages } from './languages';
import { tokenGenerator } from './tokenGenerator';

describe('Google Translate - languages', () => {
  it('has Portuguese (Brazil) mapped to pt', () => {
    expect(getLanguageName('pt')).toBe('Portuguese (Brazil)');
    expect(getISOCode('Portuguese (Brazil)')).toBe('pt');
    expect(getISOCode('pt')).toBe('pt');
  });

  it('has English mapped to en', () => {
    expect(getLanguageName('en')).toBe('English');
    expect(getISOCode('English')).toBe('en');
  });

  it('contains over 100 languages', () => {
    expect(languages.length).toBeGreaterThan(100);
  });
});

describe('Google Translate - tokenGenerator', () => {
  it('generates a token for given text', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        `window.TKK=eval('((function(){var a=123;return a;})())');tkk:'432100.123456';`,
    });

    const token = await tokenGenerator('hello world', mockFetch as any);
    expect(token.name).toBe('tk');
    expect(token.value).toBeTruthy();
    expect(typeof token.value).toBe('string');
  });
});

describe('Google Translate - simpleTranslate', () => {
  it('returns empty result when text is empty', async () => {
    const res = await simpleTranslate('', { langFrom: 'auto', langTo: ['pt'] });
    expect(res.translatedText).toBe('');
    expect(res.originalText).toBe('');
  });

  it('translates text using mocked Google Translate endpoint', async () => {
    const mockJson = [[['olá', 'hello', null, null, 1]], null, 'en'];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockJson,
      text: async () => `tkk:'432100.123456'`,
    });

    const res = await simpleTranslate(
      'hello',
      { langFrom: 'en', langTo: ['pt'] },
      mockFetch as any,
    );

    expect(res.translatedText).toBe('olá');
    expect(res.langFrom).toBe('en');
    expect(res.langTo).toBe('pt');
  });

  it('doubleWayTranslate produces forward and reverse translations', async () => {
    // 1st call: "teste" -> "teste" (pt -> pt)
    // 2nd call: "teste" -> "test" (pt -> en)
    let callCount = 0;
    const mockFetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('translate_a/single')) {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => [[['teste', 'teste', null, null, 1]], null, 'pt'],
          };
        } else {
          return {
            ok: true,
            json: async () => [[['test', 'teste', null, null, 1]], null, 'pt'],
          };
        }
      }
      return {
        ok: true,
        text: async () => `tkk:'432100.123456'`,
      };
    });

    const results = await doubleWayTranslate(
      'teste',
      { langFrom: 'auto', langTo: ['pt'] },
      mockFetch as any,
    );

    expect(results).toHaveLength(2);
    expect(results[0].translatedText).toBe('teste');
    expect(results[0].langFrom).toBe('pt');
    expect(results[0].langTo).toBe('pt');

    expect(results[1].translatedText).toBe('test');
    expect(results[1].langFrom).toBe('pt');
    expect(results[1].langTo).toBe('en');
  });

  it('multiTranslate translates to multiple target languages', async () => {
    let callCount = 0;
    const mockFetch = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('translate_a/single')) {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => [[['olá', 'hello', null, null, 1]], null, 'en'],
          };
        } else {
          return {
            ok: true,
            json: async () => [[['hola', 'hello', null, null, 1]], null, 'en'],
          };
        }
      }
      return {
        ok: true,
        text: async () => `tkk:'432100.123456'`,
      };
    });

    const results = await multiTranslate(
      'hello',
      { langFrom: 'en', langTo: ['pt', 'es'] },
      mockFetch as any,
    );

    expect(results).toHaveLength(2);
    expect(results[0].translatedText).toBe('olá');
    expect(results[1].translatedText).toBe('hola');
  });

  it('constructs correct web URL', () => {
    const url = getGoogleTranslateWebUrl('hello world', 'en', 'pt');
    expect(url).toContain('sl=en');
    expect(url).toContain('tl=pt');
    expect(url).toContain('text=hello%20world');
  });
});
