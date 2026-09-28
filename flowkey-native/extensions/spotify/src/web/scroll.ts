/**
 * Keyboard scrolling for web screens whose content overflows the viewport
 * (lyrics). Pure math plus a thin DOM adapter so the routing stays testable
 * without a browser: the app chrome maps keys and shell-forwarded page actions
 * to a {@link ScrollIntent}, and the active screen scrolls its own region.
 */

/** Scroll directions the app chrome can ask a screen for. */
export type ScrollIntent = 'lineUp' | 'lineDown' | 'pageUp' | 'pageDown' | 'top' | 'bottom';

/** The geometry a scroll decision needs — the subset of a DOM element it reads. */
export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** The subset of `HTMLElement` this module drives. */
export interface ScrollableElement extends ScrollMetrics {
  scrollTo(options: { top: number; behavior?: 'smooth' | 'auto' }): void;
}

/** One arrow press covers roughly three lyric lines at the page's line height. */
export const LINE_STEP_PX = 120;

/** A page key moves most of the viewport, leaving a line of context behind. */
export const PAGE_STEP_RATIO = 0.9;

/** How long manual scrolling suspends the synced auto-follow. */
export const AUTO_FOLLOW_RESUME_MS = 6_000;

export function maxScrollTop(metrics: ScrollMetrics): number {
  return Math.max(0, metrics.scrollHeight - metrics.clientHeight);
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}

/** The scroll offset an intent moves to, clamped to the scrollable range. */
export function scrollTargetFor(metrics: ScrollMetrics, intent: ScrollIntent): number {
  const max = maxScrollTop(metrics);
  const page = metrics.clientHeight * PAGE_STEP_RATIO;
  switch (intent) {
    case 'lineUp':
      return clamp(metrics.scrollTop - LINE_STEP_PX, max);
    case 'lineDown':
      return clamp(metrics.scrollTop + LINE_STEP_PX, max);
    case 'pageUp':
      return clamp(metrics.scrollTop - page, max);
    case 'pageDown':
      return clamp(metrics.scrollTop + page, max);
    case 'top':
      return 0;
    case 'bottom':
      return max;
  }
}

/** Line steps stay instant so held-down arrows keep up; jumps animate. */
export function scrollBehaviorFor(intent: ScrollIntent): 'smooth' | 'auto' {
  return intent === 'lineUp' || intent === 'lineDown' ? 'auto' : 'smooth';
}

/** Maps a key the page itself sees to a scroll intent; null for other keys. */
export function scrollIntentForKey(key: string): ScrollIntent | null {
  switch (key) {
    case 'ArrowDown':
      return 'lineDown';
    case 'ArrowUp':
      return 'lineUp';
    case 'PageDown':
      return 'pageDown';
    case 'PageUp':
      return 'pageUp';
    case 'Home':
      return 'top';
    case 'End':
      return 'bottom';
    default:
      return null;
  }
}

/**
 * Maps a shell-forwarded `pageAction` to a scroll intent. The launcher search
 * box keeps focus while a web command is open, so up/down reach the page as
 * `moveUp`/`moveDown` and the page keys as `pageUp`/`pageDown`; those actions
 * drive row selection on list screens and scrolling everywhere else.
 */
export function scrollIntentForPageAction(action: string): ScrollIntent | null {
  switch (action) {
    case 'moveDown':
      return 'lineDown';
    case 'moveUp':
      return 'lineUp';
    case 'pageDown':
      return 'pageDown';
    case 'pageUp':
      return 'pageUp';
    default:
      return null;
  }
}

/** Applies an intent to a live scroller; false when nothing could move. */
export function applyScroll(element: ScrollableElement, intent: ScrollIntent): boolean {
  const target = scrollTargetFor(element, intent);
  if (target === element.scrollTop) {
    return false;
  }
  element.scrollTo({ top: target, behavior: scrollBehaviorFor(intent) });
  return true;
}

/** True once a manual scroll's resume deadline has passed. */
export function shouldAutoFollow(resumeAtMs: number, nowMs: number): boolean {
  return nowMs >= resumeAtMs;
}
