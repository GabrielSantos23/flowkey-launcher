import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CommandProps } from '@flowkey/react-ui';
import { List } from '@flowkey/react-ui';
import {
  AUTO_DETECT,
  isSameLanguage,
  languagePairLabel,
  languageName,
  readTranslatePreferences,
  targetLanguageFilters,
} from './preferences';
import {
  TranslationResultItems,
  emptyTextFailureTitle,
  failureTitle,
  resolvePair,
  useCopyAction,
  useDebouncedTranslation,
} from './translation-ui';

export function TranslateCommand({ query, filterValue, preferences, native }: CommandProps): ReactNode {
  const prefs = readTranslatePreferences(preferences);
  const filters = targetLanguageFilters();
  const [swap, setSwap] = useState<{ from: string; to: string } | null>(null);
  const copy = useCopyAction(native.call);

  // A new target picked in the dropdown supersedes any active swap.
  const previousFilter = useRef(filterValue);
  useEffect(() => {
    if (previousFilter.current !== filterValue) {
      previousFilter.current = filterValue;
      setSwap(null);
    }
  }, [filterValue]);

  const to = filterValue && filterValue !== AUTO_DETECT ? filterValue : prefs.lang1;
  const pair = resolvePair(prefs.langFrom, to, prefs.lang2, swap);

  const state = useDebouncedTranslation(native.call, query, pair.from, pair.to, false);

  if (!query.trim()) {
    return (
      <List filter={filters}>
        <List.EmptyView
          title="Type text to translate"
          description={`${languagePairLabel(pair.from, pair.to)} — pick a target language from the dropdown.`}
        />
      </List>
    );
  }

  if (state.loading) {
    return (
      <List filter={filters}>
        <List.EmptyView title="Translating…" />
      </List>
    );
  }

  if (state.failure) {
    return (
      <List filter={filters}>
        <List.EmptyView title={failureTitle(state.failure)} description={state.failure.message} />
      </List>
    );
  }

  const result = state.result;
  if (!result || result.translatedText.length === 0) {
    return (
      <List filter={filters}>
        <List.EmptyView
          title={emptyTextFailureTitle()}
          description="Google returned a valid response with no translation for this text."
        />
      </List>
    );
  }

  return (
    <List filter={filters}>
      <TranslationResultItems
        result={result}
        from={pair.from}
        to={pair.to}
        onCopy={copy}
        onSwap={() => {
          const currentTo = pair.to;
          const currentFrom = pair.from === AUTO_DETECT ? result.detectedFrom ?? prefs.lang1 : pair.from;
          if (!isSameLanguage(currentFrom, currentTo)) {
            setSwap({ from: currentTo, to: currentFrom });
          }
        }}
      />
    </List>
  );
}
