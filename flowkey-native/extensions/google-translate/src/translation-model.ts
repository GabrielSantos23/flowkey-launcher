import { TranslateError, describeTranslateError, type TranslateResult } from './api/client';
import { AUTO_DETECT, LANGUAGES, isSameLanguage, languageName } from './languages';
import { languagePairLabel } from './preferences';

/**
 * Pure view model for the web surface. Everything the three translation
 * screens render or the app chrome reports is derived here, so the screens stay
 * declarative and the interesting behavior (pair resolution, phases, card
 * building) is unit-tested without a DOM.
 */

/** Typing pause before a translation request fires, in ms. */
export const TRANSLATE_DEBOUNCE_MS = 500;

/** The three launcher commands this surface renders. */
export type TranslateScreen = 'translate' | 'quick-translate' | 'translate-clipboard';

/** Maps a launched command id to the screen that renders it. */
export function screenForCommand(commandId: string | undefined): TranslateScreen {
  switch (commandId) {
    case 'quick-translate':
      return 'quick-translate';
    case 'translate-clipboard':
      return 'translate-clipboard';
    default:
      return 'translate';
  }
}

export type TranslationFailure =
  { kind: 'unavailable'; message: string } | { kind: 'rateLimited'; message: string };

/** One translation in flight / settled: shared by every screen. */
export interface TranslationRun {
  loading: boolean;
  failure: TranslationFailure | null;
  result: TranslateResult | null;
}

export interface LanguagePair {
  from: string;
  to: string;
}

/** What the body of a screen shows for the current input. */
export type ViewPhase = 'idle' | 'loading' | 'ready' | 'empty' | 'failed';

/** One target language's in-flight state (Quick Translate has two of them). */
export interface TargetRun {
  target: string;
  run: TranslationRun;
}

/** One rendered translation card. */
export interface ResultCard {
  key: string;
  target: string;
  targetName: string;
  text: string;
  pronunciation: string;
  pairLabel: string;
  copyLabel: string;
  failed: boolean;
  error: string;
  loading: boolean;
}

export function describeFailure(error: unknown): TranslationFailure {
  if (error instanceof TranslateError) {
    if (error.code === 'rateLimited') {
      return { kind: 'rateLimited', message: error.message };
    }
    return { kind: 'unavailable', message: error.message };
  }
  return { kind: 'unavailable', message: describeTranslateError(error) };
}

export function failureTitle(failure: TranslationFailure): string {
  return failure.kind === 'rateLimited'
    ? 'Translation is rate limited'
    : 'Translation is currently unavailable';
}

export function emptyTextFailureTitle(): string {
  return 'No translation returned';
}

/**
 * Resolves the effective from/to pair, honoring the primary/secondary target
 * fallback: when the source and the primary target are the same language, the
 * secondary target takes over.
 */
export function resolvePair(from: string, primary: string, secondary: string): LanguagePair {
  let to = primary;
  if (
    from !== AUTO_DETECT &&
    isSameLanguage(from, to) &&
    secondary &&
    !isSameLanguage(from, secondary)
  ) {
    to = secondary;
  }
  return { from, to };
}

/**
 * The search-bar filter options for the single-target commands: pick the
 * language to translate INTO, labelled as the pair it produces. The active
 * option leads, because the shell labels the dropdown with the first option
 * until the user picks one.
 */
export function targetFilterOptions(
  from: string,
  current: string,
): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [
    { value: current, label: `${languageName(from)} → ${languageName(current)}` },
  ];
  for (const lang of LANGUAGES) {
    if (lang.code === current) continue;
    options.push({ value: lang.code, label: `${languageName(from)} → ${lang.name}` });
  }
  return options;
}

/**
 * The search-bar filter options for Quick Translate: pick the language to
 * translate FROM, auto-detect included, active option first.
 */
export function sourceFilterOptions(current: string): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [
    { value: current, label: `From: ${languageName(current)}` },
  ];
  for (const lang of LANGUAGES) {
    if (lang.code === current) continue;
    options.push({ value: lang.code, label: `From: ${lang.name}` });
  }
  return options;
}

/** The source language actually used: the explicit one, else what Google detected. */
export function detectedLanguage(from: string, result: TranslateResult): string {
  if (from !== AUTO_DETECT) return from;
  return result.detectedFrom ?? AUTO_DETECT;
}

/**
 * A card's pair label. Under auto-detect the detected language is named once it
 * is known: "Detected (English) → Portuguese".
 */
export function cardPairLabel(from: string, to: string, detectedFrom?: string): string {
  if (from !== AUTO_DETECT) return languagePairLabel(from, to);
  return detectedFrom
    ? `Detected (${languageName(detectedFrom)}) → ${languageName(to)}`
    : `Detected → ${languageName(to)}`;
}

/**
 * What the screen body shows. A previous result stays visible while a new one
 * is in flight (typing feels responsive), so only a first load reads as
 * "loading" and only a first failure reads as "failed".
 */
export function viewPhase(text: string, run: TranslationRun): ViewPhase {
  if (!text.trim()) return 'idle';
  if (run.result?.translatedText.trim()) return 'ready';
  if (run.failure) return 'failed';
  if (run.loading) return 'loading';
  if (run.result) return 'empty';
  return 'idle';
}

/**
 * Builds one card per target that has something to show. Failed targets keep a
 * card so one bad language never blanks the page next to a working one.
 */
export function resultCards(targets: TargetRun[], from: string): ResultCard[] {
  const visible = targets.filter(
    (entry) => entry.run.result?.translatedText.trim() || entry.run.failure,
  );
  return visible.map((entry) => {
    const result = entry.run.result;
    const failure = entry.run.failure;
    const targetName = languageName(entry.target);
    return {
      key: entry.target,
      target: entry.target,
      targetName,
      text: result?.translatedText ?? '',
      pronunciation: result?.pronunciationText ?? '',
      pairLabel: cardPairLabel(from, entry.target, result?.detectedFrom),
      // Quick Translate shows two cards; only then disambiguate the copy action.
      copyLabel: visible.length > 1 ? `Copy Translation (${targetName})` : 'Copy Translation',
      failed: failure !== null,
      error: failure?.message ?? '',
      loading: entry.run.loading,
    };
  });
}

/**
 * The text a translation screen works on: what the user typed, falling back to
 * the clipboard (the Translate Clipboard command) until they type something.
 */
export function clipboardSource(
  query: string,
  clipboard: string,
): { text: string; fromClipboard: boolean } {
  if (query.trim()) return { text: query, fromClipboard: false };
  if (clipboard.trim()) return { text: clipboard, fromClipboard: true };
  return { text: '', fromClipboard: false };
}
