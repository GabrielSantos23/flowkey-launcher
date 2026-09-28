import type { IconName } from './icons';
import type { ScrollIntent } from './scroll';

/** One entry of the action palette (Ctrl+K) and the footer's primary action. */
export interface EmojiAction {
  id: string;
  title: string;
  icon: IconName;
  run: () => void | Promise<void>;
}

/**
 * The surface's contract with the shell chrome: the footer labels, the
 * page-key scrolling, and what the primary action and the palette run.
 */
export interface ViewController {
  /** Footer primary action label, e.g. "Paste". */
  primaryTitle: string;
  primary: () => void;
  /** Palette actions for the current selection (or the surface itself). */
  actions: EmojiAction[];
  /** Page-key scrolling for the grid column. */
  scroll: (intent: ScrollIntent) => boolean;
  /** Moves the selection through the grid; false when the edge is reached. */
  move: (columnDelta: number, rowDelta: number) => boolean;
}
