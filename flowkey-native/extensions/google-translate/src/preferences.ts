import { AUTO_DETECT, LANGUAGES, isSameLanguage, languageName } from './languages';

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
export function resolvePreferenceCode(dropdownValue: unknown, customValue: unknown, fallback: string): string {
  const custom = typeof customValue === 'string' ? customValue.trim().toLowerCase() : '';
  if (custom) return custom;
  if (typeof dropdownValue === 'string' && dropdownValue) return dropdownValue;
  return fallback;
}

export function readTranslatePreferences(preferences: Record<string, unknown>): TranslatePreferences {
  return {
    langFrom: resolvePreferenceCode(preferences.langFrom, preferences.langFromCustom, AUTO_DETECT),
    lang1: resolvePreferenceCode(preferences.lang1, preferences.lang1Custom, 'en'),
    lang2: resolvePreferenceCode(preferences.lang2, preferences.lang2Custom, 'pt'),
  };
}

/** Filter options for picking a target language ("To: English"). */
export function targetLanguageFilters(): { value: string; label: string }[] {
  return LANGUAGES.map((lang) => ({ value: lang.code, label: `To: ${lang.name}` }));
}

/** Filter options for picking a source language, Auto-Detect included. */
export function sourceLanguageFilters(): { value: string; label: string }[] {
  return [
    { value: AUTO_DETECT, label: 'From: Auto-Detect' },
    ...LANGUAGES.map((lang) => ({ value: lang.code, label: `From: ${lang.name}` })),
  ];
}

export function languagePairLabel(from: string, to: string): string {
  return `${languageName(from)} → ${languageName(to)}`;
}

export function subtitleForPair(from: string, to: string): string {
  const fromLabel = from === AUTO_DETECT ? 'Detected' : languageName(from);
  return `${fromLabel} → ${languageName(to)}`;
}

export { AUTO_DETECT, isSameLanguage, languageName };
