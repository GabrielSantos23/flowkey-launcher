export const AUTO_DETECT = 'auto';

export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'ru', name: 'Russian' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'tr', name: 'Turkish' },
  { code: 'ar', name: 'Arabic' },
  { code: 'he', name: 'Hebrew' },
  { code: 'fa', name: 'Persian' },
  { code: 'hi', name: 'Hindi' },
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  { code: 'zh-TW', name: 'Chinese (Traditional)' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'id', name: 'Indonesian' },
  { code: 'sv', name: 'Swedish' },
  { code: 'el', name: 'Greek' },
  { code: 'cs', name: 'Czech' },
  { code: 'ro', name: 'Romanian' },
];

const NAMES_BY_CODE = new Map(LANGUAGES.map((lang) => [lang.code.toLowerCase(), lang.name]));

export function languageName(code: string): string {
  if (code === AUTO_DETECT) return 'Auto-Detect';
  return NAMES_BY_CODE.get(code.toLowerCase()) ?? code.toUpperCase();
}

export function isSameLanguage(a: string, b: string): boolean {
  if (!a || !b) return false;
  const baseA = a.toLowerCase().split('-')[0];
  const baseB = b.toLowerCase().split('-')[0];
  return baseA === baseB;
}
