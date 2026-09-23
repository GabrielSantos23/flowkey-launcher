import { useState, type ReactNode } from 'react';
import type { CommandProps } from '@flowkey/react-ui';
import { Action, ActionPanel, List } from '@flowkey/react-ui';
import { TranslateError, type TranslateResult } from './api/client';
import {
  AUTO_DETECT,
  languageName,
  readTranslatePreferences,
  sourceLanguageFilters,
  subtitleForPair,
} from './preferences';
import { failureTitle, resolvePair, useCopyAction, useDebouncedTranslation } from './translation-ui';

export function QuickTranslateCommand({ query, filterValue, preferences, native }: CommandProps): ReactNode {
  const prefs = readTranslatePreferences(preferences);
  const filters = sourceLanguageFilters();
  const copy = useCopyAction(native.call);

  const from = filterValue ?? AUTO_DETECT;
  const targets = [prefs.lang1, prefs.lang2].filter(
    (target, index, all) => target && all.indexOf(target) === index,
  );

  // One debounced run per target; each result carries its own failure so a
  // rate limit on one target does not blank the others.
  const primary = useDebouncedTranslation(native.call, query, from, targets[0] ?? 'en', false);
  const secondary = useDebouncedTranslation(
    native.call,
    query,
    from,
    targets[1] ?? targets[0] ?? 'en',
    targets.length < 2,
  );
  const states = [primary, secondary].slice(0, targets.length);

  if (!query.trim()) {
    return (
      <List filter={filters}>
        <List.EmptyView
          title="Type text to translate"
          description={`Translates to ${targets.map((target) => languageName(target)).join(' and ')} — pick a source language from the dropdown.`}
        />
      </List>
    );
  }

  if (states.every((state) => state.loading)) {
    return (
      <List filter={filters}>
        <List.EmptyView title="Translating…" />
      </List>
    );
  }

  const rows: { target: string; result: TranslateResult | null; failureMessage: string | null }[] = states.map(
    (state, index) => ({
      target: targets[index] ?? 'en',
      result: state.result && state.result.translatedText ? state.result : null,
      failureMessage: state.failure ? state.failure.message : null,
    }),
  );

  const allFailed = rows.every((row) => row.failureMessage);
  if (allFailed) {
    const firstFailure = states.find((state) => state.failure)?.failure;
    return (
      <List filter={filters}>
        <List.EmptyView
          title={failureTitle(firstFailure ?? { kind: 'unavailable', message: 'Translation failed.' })}
          description={rows[0]?.failureMessage ?? undefined}
        />
      </List>
    );
  }

  const hasAnyResult = rows.some((row) => row.result);
  if (!hasAnyResult) {
    return (
      <List filter={filters}>
        <List.EmptyView
          title="No translation returned"
          description="Google returned a valid response with no translation for this text."
        />
      </List>
    );
  }

  return (
    <List filter={filters}>
      {rows.map((row) => {
        if (row.failureMessage) {
          return (
            <List.Item
              key={`error:${row.target}`}
              id={`error:${row.target}`}
              title={`Could not translate to ${languageName(row.target)}`}
              subtitle={row.failureMessage}
              icon={{ lucide: 'alert-circle', color: '#EF4444' }}
            />
          );
        }
        const result = row.result;
        if (!result) return null;
        const detected = from === AUTO_DETECT ? result.detectedFrom ?? AUTO_DETECT : from;
        return (
          <List.Item
            key={row.target}
            id={`translation:${row.target}`}
            title={result.translatedText}
            subtitle={subtitleForPair(detected, result.langTo)}
            icon={{ lucide: 'languages' }}
            detail={
              result.pronunciationText ? (
                <List.Item.Detail preview={`${result.translatedText}\n\n${result.pronunciationText}`} />
              ) : (
                <List.Item.Detail preview={result.translatedText} />
              )
            }
            actions={
              <ActionPanel>
                <Action
                  title="Copy Translation"
                  primary
                  onAction={() => copy(result.translatedText, 'Copy Translation')}
                />
                {result.pronunciationText ? (
                  <Action
                    title="Copy Pronunciation"
                    onAction={() => copy(result.pronunciationText ?? '', 'Copy Pronunciation')}
                  />
                ) : null}
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
