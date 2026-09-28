/**
 * Keyboard scrolling for the translation surface. The cards live in a single
 * scrollable column, but the launcher's search box holds focus until the user
 * clicks the page, so the shell forwards the page keys and the page routes
 * them here instead of leaving them to Chromium's focus-dependent defaults.
 */

/** The scroll keys the surface owns; arrows move the card selection instead. */
export type ScrollIntent = 'pageUp' | 'pageDown' | 'home' | 'end';

export const PAGE_STEP_RATIO = 0.9;

export function scrollIntentForKey(key: string): ScrollIntent | null {
  switch (key) {
    case 'PageUp':
      return 'pageUp';
    case 'PageDown':
      return 'pageDown';
    case 'Home':
      return 'home';
    case 'End':
      return 'end';
    default:
      return null;
  }
}

/** Maps the shell-forwarded page actions onto scroll intents. */
export function scrollIntentForPageAction(action: string): ScrollIntent | null {
  switch (action) {
    case 'pageUp':
      return 'pageUp';
    case 'pageDown':
      return 'pageDown';
    case 'home':
      return 'home';
    case 'end':
      return 'end';
    default:
      return null;
  }
}

export function maxScrollTop(clientHeight: number, scrollHeight: number): number {
  return Math.max(0, scrollHeight - clientHeight);
}

/** The scrollTop an intent lands on, clamped to the scrollable range. */
export function scrollTopFor(
  intent: ScrollIntent,
  current: { scrollTop: number; clientHeight: number; scrollHeight: number },
): number {
  const { scrollTop, clientHeight, scrollHeight } = current;
  const max = maxScrollTop(clientHeight, scrollHeight);
  const step = Math.max(80, Math.round(clientHeight * PAGE_STEP_RATIO));
  switch (intent) {
    case 'pageUp':
      return Math.max(0, Math.min(max, scrollTop - step));
    case 'pageDown':
      return Math.max(0, Math.min(max, scrollTop + step));
    case 'home':
      return 0;
    case 'end':
      return max;
  }
}
