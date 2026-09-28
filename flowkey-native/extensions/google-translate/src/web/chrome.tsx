import { createElement, type ReactNode } from 'react';
import type { ResultCard, TranslationFailure } from '../translation-model';
import { failureTitle } from '../translation-model';
import { Icon, type IconName } from './icons';

/** Shared chrome pieces: result rows, empty states and the status line. */

export function EmptyView(props: {
  title: string;
  description?: string;
  icon?: IconName;
  tone?: 'error';
}): ReactNode {
  return createElement(
    'div',
    { className: props.tone === 'error' ? 'gt-empty gt-empty-error' : 'gt-empty' },
    createElement(Icon, {
      name: props.tone === 'error' ? 'alert' : (props.icon ?? 'languages'),
      size: 26,
    }),
    createElement('div', { className: 'gt-empty-title' }, props.title),
    props.description
      ? createElement('div', { className: 'gt-empty-description' }, props.description)
      : null,
  );
}

/**
 * One result row: the translation on the left, its language pair muted on the
 * right — the same shape as every other list row in the launcher.
 */
export function TranslationRow(props: {
  text: string;
  subtitle: string;
  selected: boolean;
  onSelect: () => void;
  tone?: 'error' | 'muted';
}): ReactNode {
  return createElement(
    'div',
    {
      className: [
        'gt-row',
        props.selected ? 'gt-row-selected' : '',
        props.tone === 'error' ? 'gt-row-error' : '',
        props.tone === 'muted' ? 'gt-row-muted' : '',
      ]
        .filter(Boolean)
        .join(' '),
      title: props.text,
      onClick: props.onSelect,
    },
    createElement('span', { className: 'gt-row-text' }, props.text),
    createElement('span', { className: 'gt-row-subtitle' }, props.subtitle),
  );
}

/** The source text (what the user typed, or what the clipboard held). */
export function SourceRow(props: {
  text: string;
  fromClipboard: boolean;
  selected: boolean;
  onSelect: () => void;
}): ReactNode {
  return createElement(TranslationRow, {
    text: props.text,
    subtitle: props.fromClipboard ? 'From Clipboard' : 'Original',
    selected: props.selected,
    onSelect: props.onSelect,
    tone: 'muted',
  });
}

/** A failed target keeps its row so one bad language never blanks the page. */
export function FailureRow(props: {
  card: ResultCard;
  failure: TranslationFailure | null;
  selected: boolean;
  onSelect: () => void;
}): ReactNode {
  return createElement(TranslationRow, {
    text: failureTitle(props.failure ?? { kind: 'unavailable', message: props.card.error }),
    subtitle: props.card.pairLabel,
    selected: props.selected,
    onSelect: props.onSelect,
    tone: 'error',
  });
}

/** The thin status line: a spinner while translating, transient copy errors. */
export function StatusLine(props: { text: string; busy?: boolean; error?: boolean }): ReactNode {
  if (!props.text) return null;
  return createElement(
    'div',
    { className: props.error ? 'gt-status gt-status-error' : 'gt-status' },
    props.busy ? createElement('span', { className: 'gt-spinner' }) : null,
    createElement('span', null, props.text),
  );
}
