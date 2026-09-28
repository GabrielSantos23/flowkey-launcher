import { AUTO_DETECT, languageName } from './languages';

export interface TranslatePreferences {
  langFrom: string;
  lang1: string;
  lang2: string;
}

/**
 * Resolves a language pair from preferences: the free-text "custom code"
 * fields win over the curated dropdown when non-empty, so users can target
 * any Google Translate language even though the dropdown list is curated.
 */
export function resolvePreferenceCode(
  dropdownValue: unknown,
  customValue: unknown,
  fallback: string,
): string {
  const custom = typeof customValue === 'string' ? customValue.trim().toLowerCase() : '';
  if (custom) return custom;
  if (typeof dropdownValue === 'string' && dropdownValue) return dropdownValue;
  return fallback;
}

export function readTranslatePreferences(
  preferences: Record<string, unknown>,
): TranslatePreferences {
  return {
    langFrom: resolvePreferenceCode(preferences.langFrom, preferences.langFromCustom, AUTO_DETECT),
    lang1: resolvePreferenceCode(preferences.lang1, preferences.lang1Custom, 'en'),
    lang2: resolvePreferenceCode(preferences.lang2, preferences.lang2Custom, 'pt'),
  };
}

export function languagePairLabel(from: string, to: string): string {
  return `${languageName(from)} → ${languageName(to)}`;
}
