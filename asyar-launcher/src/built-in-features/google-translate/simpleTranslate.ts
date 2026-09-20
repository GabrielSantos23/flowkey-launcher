import { tokenGenerator } from './tokenGenerator';
import { getISOCode } from './languages';
import { fetchUrl } from '../../lib/ipc/commands';

export const AUTO_DETECT = 'auto';

export interface LanguageCodeSet {
  langFrom: string;
  langTo: string[];
}

export interface SimpleTranslateResult {
  originalText: string;
  translatedText: string;
  pronunciationText?: string;
  langFrom: string;
  langTo: string;
}

export class TranslateError extends Error {}

function isSameLanguage(lang1: string, lang2: string): boolean {
  if (!lang1 || !lang2) return false;
  const l1 = lang1.toLowerCase();
  const l2 = lang2.toLowerCase();
  if (l1 === l2) return true;
  return l1.split('-')[0] === l2.split('-')[0];
}

const extractPronounceTextFromRaw = (raw: any): string | undefined => {
  return raw?.[0]?.[1]?.[2] || undefined;
};

export async function rawGoogleTranslate(
  text: string,
  from: string,
  to: string,
  customFetch?: typeof fetch,
): Promise<{ text: string; raw: any; detectedFrom: string }> {
  const fromCode = getISOCode(from) || 'auto';
  const toCode = getISOCode(to) || 'en';

  const token = await tokenGenerator(text, customFetch);
  const baseUrl = 'https://translate.google.com/translate_a/single';

  const params = new URLSearchParams({
    client: 'dict-chrome-ex',
    sl: fromCode,
    tl: toCode,
    hl: toCode,
    ie: 'UTF-8',
    oe: 'UTF-8',
    otf: '1',
    ssel: '0',
    tsel: '0',
    kc: '7',
    q: text,
  });

  const dtList = ['at', 'bd', 'ex', 'ld', 'md', 'qca', 'rw', 'rm', 'ss', 't'];
  for (const dt of dtList) {
    params.append('dt', dt);
  }
  if (token.value) {
    params.append(token.name, token.value);
  }

  let requestUrl = `${baseUrl}?${params.toString()}`;
  let method: 'GET' | 'POST' = 'GET';
  let body: string | undefined;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  if (requestUrl.length > 2048) {
    params.delete('q');
    requestUrl = `${baseUrl}?${params.toString()}`;
    method = 'POST';
    body = new URLSearchParams({ q: text }).toString();
    headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
  }

  let json: any;
  let isOk = false;
  let status = 200;

  if (customFetch) {
    const res = await customFetch(requestUrl, { method, headers, body });
    isOk = res.ok;
    status = res.status;
    if (isOk) {
      json = await res.json();
    }
  } else {
    try {
      const res = await fetchUrl({
        url: requestUrl,
        method,
        headers,
        body,
        callerExtensionId: 'google-translate',
      });
      if (res) {
        isOk = res.ok;
        status = res.status;
        if (isOk) {
          json = JSON.parse(res.body);
        }
      } else {
        const fallbackRes = await fetch(requestUrl, { method, headers, body });
        isOk = fallbackRes.ok;
        status = fallbackRes.status;
        if (isOk) {
          json = await fallbackRes.json();
        }
      }
    } catch {
      const fallbackRes = await fetch(requestUrl, { method, headers, body });
      isOk = fallbackRes.ok;
      status = fallbackRes.status;
      if (isOk) {
        json = await fallbackRes.json();
      }
    }
  }

  if (!isOk) {
    if (status === 429) {
      throw new TranslateError('Too many requests. Please try again later.');
    }
    throw new TranslateError(`Translation request failed with status ${status}`);
  }

  let translatedText = '';
  if (Array.isArray(json?.[0])) {
    for (const segment of json[0]) {
      if (segment && segment[0]) {
        translatedText += segment[0];
      }
    }
  }

  const detectedFrom = json?.[2] || fromCode;
  return {
    text: translatedText,
    raw: json,
    detectedFrom,
  };
}

export async function simpleTranslate(
  text: string,
  options: LanguageCodeSet,
  fetchFn?: typeof fetch,
): Promise<SimpleTranslateResult> {
  if (!text || !text.trim()) {
    return {
      originalText: text,
      translatedText: '',
      pronunciationText: undefined,
      langFrom: options.langFrom,
      langTo: options.langTo[0] || 'en',
    };
  }

  let targetLang = options.langTo[0] || 'en';

  if (
    options.langFrom !== AUTO_DETECT &&
    isSameLanguage(options.langFrom, targetLang) &&
    options.langTo.length > 1
  ) {
    targetLang = options.langTo[1];
  }

  let res = await rawGoogleTranslate(text, options.langFrom, targetLang, fetchFn);
  let detectedLangFrom = res.detectedFrom;

  if (
    options.langFrom === AUTO_DETECT &&
    isSameLanguage(detectedLangFrom, targetLang) &&
    options.langTo.length > 1
  ) {
    targetLang = options.langTo[1];
    res = await rawGoogleTranslate(text, detectedLangFrom, targetLang, fetchFn);
    detectedLangFrom = res.detectedFrom;
  }

  return {
    originalText: text,
    translatedText: res.text,
    pronunciationText: extractPronounceTextFromRaw(res.raw),
    langFrom: detectedLangFrom,
    langTo: targetLang,
  };
}

export async function doubleWayTranslate(
  text: string,
  options: LanguageCodeSet,
  fetchFn?: typeof fetch,
): Promise<SimpleTranslateResult[]> {
  if (!text || !text.trim()) {
    return [];
  }

  if (options.langFrom === AUTO_DETECT) {
    const translated1 = await simpleTranslate(text, options, fetchFn);
    if (translated1?.langFrom) {
      const returnTarget = isSameLanguage(translated1.langFrom, translated1.langTo)
        ? options.langTo.length > 1
          ? options.langTo[1]
          : 'en'
        : translated1.langFrom;

      const translated2 = await simpleTranslate(
        translated1.translatedText,
        {
          langFrom: translated1.langTo,
          langTo: [returnTarget],
        },
        fetchFn,
      );

      return [translated1, translated2];
    }
    return [translated1];
  } else {
    let targetLang = options.langTo[0] || 'en';
    if (isSameLanguage(options.langFrom, targetLang) && options.langTo.length > 1) {
      targetLang = options.langTo[1];
    }

    const [t1, t2] = await Promise.all([
      simpleTranslate(
        text,
        {
          langFrom: options.langFrom,
          langTo: [targetLang],
        },
        fetchFn,
      ),
      simpleTranslate(
        text,
        {
          langFrom: targetLang,
          langTo: [options.langFrom],
        },
        fetchFn,
      ),
    ]);

    return [t1, t2];
  }
}

export async function multiTranslate(
  text: string,
  options: LanguageCodeSet,
  fetchFn?: typeof fetch,
): Promise<SimpleTranslateResult[]> {
  if (!text || !text.trim()) return [];

  const results = await Promise.all(
    options.langTo.map((langTo) =>
      simpleTranslate(
        text,
        {
          langFrom: options.langFrom,
          langTo: [langTo],
        },
        fetchFn,
      ),
    ),
  );

  return results.filter(Boolean);
}

export function playTTS(text: string, langTo: string): void {
  if (!text || !text.trim()) return;

  const audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
    text,
  )}&tl=${encodeURIComponent(langTo)}&total=1&idx=0&textlen=${text.length}&client=tw-ob&prev=input`;

  try {
    const audio = new Audio(audioUrl);
    audio.play().catch(() => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = langTo;
        window.speechSynthesis.speak(utterance);
      }
    });
  } catch {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = langTo;
      window.speechSynthesis.speak(utterance);
    }
  }
}

export function getGoogleTranslateWebUrl(text: string, langFrom: string, langTo: string): string {
  return `https://translate.google.com/?sl=${encodeURIComponent(
    langFrom,
  )}&tl=${encodeURIComponent(langTo)}&text=${encodeURIComponent(text)}&op=translate`;
}
