import type { IconName } from './icons';
import type { ScrollIntent } from './scroll';
import type { LanguagePair } from '../translation-model';

/** One entry of the in-page action palette (Ctrl+K) and the footer. */
export interface TranslateAction {
  id: string;
  title: string;
  icon: IconName;
  run: () => void | Promise<void>;
}

/**
 * The surface's contract with the shell chrome: the footer's primary action,
 * the Ctrl+K palette contents, the navigable cards and page-key scrolling.
 */
export interface ViewController {
  /** Footer context label (left side), e.g. the language pair. */
  title: string;
  /** Footer primary action label (right side), e.g. "Copy Translation". */
  primaryTitle: string;
  primary: () => void;
  /** Palette actions for the current selection (or the surface itself). */
  actions: TranslateAction[];
  /** Navigable cards for arrow-key selection. */
  rows?: WebRowRef[];
  selectedKey?: string | null;
  select?: (key: string | null) => void;
  /**
   * Page-key scrolling for the card column. The launcher search box holds focus
   * until the user clicks the page, so Chromium's focus-dependent defaults never
   * fire; the shell forwards the keys and the chrome routes them here.
   */
  scroll?: (intent: ScrollIntent) => boolean;
}

/** Minimal row shape the controller needs for keyboard navigation. */
export interface WebRowRef {
  key: string;
}

/** The pair the language bar shows; kept in sync with what actually runs. */
export type { LanguagePair };
