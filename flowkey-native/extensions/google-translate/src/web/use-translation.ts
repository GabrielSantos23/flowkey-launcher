import { useEffect, useRef, useState } from 'react';
import { translate, type NativeCallFn, type TranslateResult } from '../api/client';
import {
  describeFailure,
  TRANSLATE_DEBOUNCE_MS,
  type TranslationFailure,
  type TranslationRun,
} from '../translation-model';

const IDLE: TranslationRun = { loading: false, failure: null, result: null };

/** One target's settled outcome, so a failure never masquerades as a result. */
type SettledTarget =
  { target: string; result: TranslateResult } | { target: string; failure: TranslationFailure };

async function runTarget(
  call: NativeCallFn,
  text: string,
  from: string,
  target: string,
): Promise<SettledTarget> {
  try {
    return { target, result: await translate({ call }, text, { from, to: target }) };
  } catch (caught) {
    return { target, failure: describeFailure(caught) };
  }
}

/**
 * One debounced translation run per target language. Every run keeps its own
 * result and failure, so a rate limit on one target never blanks the other.
 * A slow run that a newer keystroke superseded is dropped, not shown.
 */
export function useTranslations(
  call: NativeCallFn,
  text: string,
  from: string,
  targets: string[],
  enabled: boolean,
  /** Bumped by the Retry action to re-run the same text. */
  nonce = 0,
): Record<string, TranslationRun> {
  const key = targets.join('|');
  const [runs, setRuns] = useState<Record<string, TranslationRun>>({});
  const runIds = useRef<Record<string, number>>({});

  useEffect(() => {
    const trimmed = text.trim();
    const list = key ? key.split('|') : [];
    if (!enabled || !trimmed) {
      setRuns({});
      return;
    }
    // mark every target loading, keeping the previous result visible while typing
    setRuns((previous) => {
      const next: Record<string, TranslationRun> = {};
      for (const target of list) {
        const before = previous[target] ?? IDLE;
        next[target] = { loading: true, failure: null, result: before.result };
      }
      return next;
    });
    const ids = runIds.current;
    for (const target of list) {
      const id = (ids[target] ?? 0) + 1;
      ids[target] = id;
    }
    const timer = setTimeout(() => {
      void (async () => {
        const settled = await Promise.all(
          list.map((target) => runTarget(call, trimmed, from, target)),
        );
        setRuns((previous) => {
          const next: Record<string, TranslationRun> = {};
          for (const entry of settled) {
            if (ids[entry.target] !== runIds.current[entry.target]) continue; // superseded
            const before = previous[entry.target] ?? IDLE;
            next[entry.target] =
              'failure' in entry
                ? { loading: false, failure: entry.failure, result: before.result }
                : { loading: false, failure: null, result: entry.result };
          }
          return next;
        });
      })();
    }, TRANSLATE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [call, text, from, key, enabled, nonce]);

  return runs;
}

export interface ClipboardText {
  state: 'loading' | 'ready' | 'error';
  text: string;
}

/** Reads the clipboard text through the gated `clipboard.read` route. */
export function useClipboardText(
  call: NativeCallFn,
  reloadToken: number,
  enabled: boolean,
): ClipboardText {
  const [state, setState] = useState<ClipboardText>({ state: 'loading', text: '' });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState((previous) => ({ ...previous, state: 'loading' }));
    void (async () => {
      try {
        const result = await call<{ text?: string | null }>('clipboard.read');
        if (!alive) return;
        setState({ state: 'ready', text: typeof result.text === 'string' ? result.text : '' });
      } catch {
        if (alive) setState({ state: 'error', text: '' });
      }
    })();
    return () => {
      alive = false;
    };
  }, [call, reloadToken, enabled]);
  return state;
}
