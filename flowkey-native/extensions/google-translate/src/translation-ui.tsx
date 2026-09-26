import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CommandProps } from '@flowkey-cli/react-ui';
import { Action, ActionPanel, List } from '@flowkey-cli/react-ui';
import {
  TranslateError,
  describeTranslateError,
  translate,
  type NativeCallFn,
  type TranslateResult,
} from './api/client';
import { AUTO_DETECT, isSameLanguage, languagePairLabel, languageName, targetLanguageFilters } from './preferences';

const TRANSLATE_DEBOUNCE_MS = 500;

export type TranslationFailure =
  | { kind: 'unavailable'; message: string }
  | { kind: 'rateLimited'; message: string };

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

export interface TranslationState {
  loading: boolean;
  failure: TranslationFailure | null;
  result: TranslateResult | null;
}

/** Effect hook: debounced translation of `text`, aborted with `signal`-like semantics per run. */
export function useDebouncedTranslation(
  call: NativeCallFn,
  text: string,
  from: string,
  to: string,
  disabled: boolean,
): TranslationState {
  const [state, setState] = useState<TranslationState>({ loading: false, failure: null, result: null });
  const runId = useRef(0);

  useEffect(() => {
    const trimmed = text.trim();
    if (disabled || !trimmed) {
      setState({ loading: false, failure: null, result: null });
      return;
    }
    const id = ++runId.current;
    setState((previous) => ({ loading: true, failure: null, result: previous.result }));
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await translate({ call }, trimmed, { from, to });
          if (runId.current !== id) return;
          setState({ loading: false, failure: null, result });
        } catch (caught) {
          if (runId.current !== id) return;
          setState({ loading: false, failure: describeFailure(caught), result: null });
        }
      })();
    }, TRANSLATE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [call, text, from, to, disabled]);

  return state;
}

export function TranslationResultItems(props: {
  result: TranslateResult;
  from: string;
  to: string;
  onCopy: (text: string, label: string) => void;
  onSwap?: () => void;
  children?: ReactNode;
}): ReactNode {
  const { result, from, to, onCopy, onSwap, children } = props;
  const detected = from === AUTO_DETECT ? result.detectedFrom ?? AUTO_DETECT : from;
  const actions = (value: string, copyLabel: string): ReactNode => (
    <ActionPanel>
      <Action title={copyLabel} primary onAction={() => onCopy(value, copyLabel)} />
      {onSwap ? <Action title={`Swap (${languagePairLabel(to, detected)})`} onAction={onSwap} /> : null}
      {children}
    </ActionPanel>
  );
  return (
    <>
      <List.Item
        id="translation"
        title={result.translatedText}
        subtitle={languagePairLabel(detected, result.langTo)}
        actions={actions(result.translatedText, 'Copy Translation')}
      />
      {result.pronunciationText ? (
        <List.Item
          id="pronunciation"
          title={result.pronunciationText}
          subtitle={languagePairLabel(detected, result.langTo)}
          actions={actions(result.pronunciationText, 'Copy Pronunciation')}
        />
      ) : null}
    </>
  );
}

/**
 * Resolves the effective from/to pair, honoring the swap override and the
 * primary/secondary target fallback: when the source and the primary target
 * are the same language, the secondary target takes over (Raycast parity).
 */
export function resolvePair(
  from: string,
  primary: string,
  secondary: string,
  swap: { from: string; to: string } | null,
  detectedFrom?: string,
): { from: string; to: string } {
  if (swap) return swap;
  let to = primary;
  if (from !== AUTO_DETECT && isSameLanguage(from, to) && secondary && !isSameLanguage(from, secondary)) {
    to = secondary;
  }
  return { from, to };
}

export function useCopyAction(nativeCall: NativeCallFn): (text: string, label: string) => void {
  return (text, label) => {
    void nativeCall('clipboard.write', { text }).catch(() => undefined);
    void label;
  };
}
