import { describe, expect, test } from 'bun:test';
import { TranslateError, type TranslateResult } from '../src/api/client';
import { AUTO_DETECT, LANGUAGES } from '../src/languages';
import {
  clipboardSource,
  detectedLanguage,
  describeFailure,
  failureTitle,
  resolvePair,
  resultCards,
  screenForCommand,
  sourceFilterOptions,
  targetFilterOptions,
  TRANSLATE_DEBOUNCE_MS,
  viewPhase,
  type TranslationRun,
} from '../src/translation-model';

const result = (overrides: Partial<TranslateResult> = {}): TranslateResult => ({
  originalText: 'Hello world',
  translatedText: 'Olá mundo',
  pronunciationText: 'həˈloʊ wɜːld',
  detectedFrom: 'en',
  langTo: 'pt',
  ...overrides,
});

const run = (overrides: Partial<TranslationRun> = {}): TranslationRun => ({
  loading: false,
  failure: null,
  result: null,
  ...overrides,
});

describe('resolvePair', () => {
  test('keeps the preferred target when it differs from the source', () => {
    expect(resolvePair(AUTO_DETECT, 'pt', 'en')).toEqual({ from: AUTO_DETECT, to: 'pt' });
  });

  test('falls back to the secondary target when the source equals the primary', () => {
    expect(resolvePair('en', 'en', 'pt')).toEqual({ from: 'en', to: 'pt' });
  });

  test('keeps the primary target when the secondary is the same language', () => {
    expect(resolvePair('en', 'en', 'en')).toEqual({ from: 'en', to: 'en' });
  });
});

describe('detectedLanguage', () => {
  test('prefers an explicit source', () => {
    expect(detectedLanguage('en', result())).toBe('en');
  });

  test('falls back to the detected language under auto-detect', () => {
    expect(detectedLanguage(AUTO_DETECT, result({ detectedFrom: 'fr' }))).toBe('fr');
  });

  test('falls back to the target label when Google reported nothing', () => {
    expect(detectedLanguage(AUTO_DETECT, result({ detectedFrom: undefined }))).toBe(AUTO_DETECT);
  });
});

describe('viewPhase', () => {
  test('is idle without input', () => {
    expect(viewPhase('', run())).toBe('idle');
  });

  test('is loading while the first translation is in flight', () => {
    expect(viewPhase('hello', run({ loading: true }))).toBe('loading');
  });

  test('keeps showing the previous result while retyping', () => {
    expect(viewPhase('hell', run({ loading: true, result: result() }))).toBe('ready');
  });

  test('is failed on a failure with no previous result', () => {
    expect(
      viewPhase('hello', run({ failure: { kind: 'rateLimited', message: 'slow down' } })),
    ).toBe('failed');
  });

  test('is empty when Google returns a valid but blank translation', () => {
    expect(viewPhase('hello', run({ result: result({ translatedText: '' }) }))).toBe('empty');
  });

  test('is ready once a result with text arrives', () => {
    expect(viewPhase('hello', run({ result: result() }))).toBe('ready');
  });
});

describe('resultCards', () => {
  test('builds one card per target with its pair label and copy payloads', () => {
    const cards = resultCards(
      [
        { target: 'pt', run: run({ result: result() }) },
        {
          target: 'es',
          run: run({ result: result({ translatedText: 'Hola mundo', langTo: 'es' }) }),
        },
      ],
      AUTO_DETECT,
    );

    expect(cards).toHaveLength(2);
    expect(cards[0].key).toBe('pt');
    expect(cards[0].text).toBe('Olá mundo');
    expect(cards[0].pronunciation).toBe('həˈloʊ wɜːld');
    expect(cards[0].pairLabel).toBe('Detected (English) → Portuguese');
    expect(cards[0].copyLabel).toBe('Copy Translation (Portuguese)');
    expect(cards[1].pairLabel).toBe('Detected (English) → Spanish');
  });

  test('labels a lone target without a language suffix', () => {
    const cards = resultCards([{ target: 'pt', run: run({ result: result() }) }], AUTO_DETECT);

    expect(cards[0].copyLabel).toBe('Copy Translation');
  });

  test('keeps a card for a failed target so one bad language does not blank the page', () => {
    const cards = resultCards(
      [
        { target: 'pt', run: run({ result: result() }) },
        { target: 'es', run: run({ failure: { kind: 'rateLimited', message: 'slow down' } }) },
      ],
      'en',
    );

    expect(cards).toHaveLength(2);
    expect(cards[1].key).toBe('es');
    expect(cards[1].failed).toBe(true);
    expect(cards[1].text).toBe('');
    expect(cards[1].error).toBe('slow down');
    expect(cards[1].pairLabel).toBe('English → Spanish');
  });

  test('skips targets that are neither translated nor failed', () => {
    const cards = resultCards(
      [
        { target: 'pt', run: run({ loading: true, result: result() }) },
        {
          target: 'es',
          run: run({ result: result({ translatedText: 'Hola mundo', langTo: 'es' }) }),
        },
      ],
      'en',
    );

    expect(cards.map((card) => card.key)).toEqual(['pt', 'es']);
  });
});

describe('clipboardSource', () => {
  test('prefers typed text over the clipboard', () => {
    expect(clipboardSource('typed', 'clipboard')).toEqual({ text: 'typed', fromClipboard: false });
  });

  test('falls back to the clipboard until the user types', () => {
    expect(clipboardSource('   ', 'clipboard')).toEqual({ text: 'clipboard', fromClipboard: true });
  });

  test('reports nothing when both are empty', () => {
    expect(clipboardSource('', '')).toEqual({ text: '', fromClipboard: false });
  });
});

describe('failures', () => {
  test('separates a rate limit from an outage in the title', () => {
    expect(failureTitle({ kind: 'rateLimited', message: 'x' })).toBe('Translation is rate limited');
    expect(failureTitle({ kind: 'unavailable', message: 'x' })).toBe(
      'Translation is currently unavailable',
    );
  });

  test('maps the client error codes onto the two failure kinds', () => {
    expect(describeFailure(new TranslateError('rateLimited', 'slow down')).kind).toBe(
      'rateLimited',
    );
    expect(describeFailure(new TranslateError('requestFailed', 'offline')).kind).toBe(
      'unavailable',
    );
    expect(describeFailure(new Error('boom'))).toEqual({ kind: 'unavailable', message: 'boom' });
  });
});

describe('screenForCommand', () => {
  test('maps every launcher command to its screen', () => {
    expect(screenForCommand('translate')).toBe('translate');
    expect(screenForCommand('quick-translate')).toBe('quick-translate');
    expect(screenForCommand('translate-clipboard')).toBe('translate-clipboard');
  });

  test('falls back to the single-target screen', () => {
    expect(screenForCommand(undefined)).toBe('translate');
    expect(screenForCommand('something-else')).toBe('translate');
  });
});

describe('targetFilterOptions', () => {
  test('leads with the active target so the shell labels the dropdown correctly', () => {
    const options = targetFilterOptions(AUTO_DETECT, 'pt');
    expect(options[0]).toEqual({ value: 'pt', label: 'Auto-Detect → Portuguese' });
  });

  test('offers every language once, as a pair with the source', () => {
    const options = targetFilterOptions('en', 'pt');
    expect(options.filter((option) => option.value === 'pt')).toHaveLength(1);
    expect(options.some((option) => option.label === 'English → French')).toBe(true);
    expect(options).toHaveLength(LANGUAGES.length);
  });

  test('keeps a custom code from settings in the list', () => {
    // 'haw' is not in the curated list, so it is named by its code like everywhere else
    const options = targetFilterOptions(AUTO_DETECT, 'haw');
    expect(options[0]).toEqual({ value: 'haw', label: 'Auto-Detect → HAW' });
  });
});

describe('sourceFilterOptions', () => {
  test('leads with the active source, auto-detect included', () => {
    const options = sourceFilterOptions(AUTO_DETECT);
    expect(options[0]).toEqual({ value: AUTO_DETECT, label: 'From: Auto-Detect' });
    expect(options.some((option) => option.label === 'From: Portuguese')).toBe(true);
    expect(options).toHaveLength(LANGUAGES.length + 1);
  });

  test('names the picked source first', () => {
    expect(sourceFilterOptions('fr')[0]).toEqual({ value: 'fr', label: 'From: French' });
  });
});

describe('constants', () => {
  test('debounce keeps typing from hammering the endpoint', () => {
    expect(TRANSLATE_DEBOUNCE_MS).toBeGreaterThanOrEqual(300);
  });
});
