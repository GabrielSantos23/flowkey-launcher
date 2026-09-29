/**
 * Keyboard scrolling for the picker. The search box and the category dropdown
 * are shell chrome, so the page never holds focus while the user types; the
 * shell forwards the page keys as page actions and the surface routes them here
 * instead of leaving them to Chromium's focus-dependent defaults.
 */

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

/** The scrollTop an intent lands on, clamped to the scrollable range. */
export function scrollTopFor(
  intent: ScrollIntent,
  current: { scrollTop: number; clientHeight: number; scrollHeight: number },
): number {
  const { scrollTop, clientHeight, scrollHeight } = current;
  const max = Math.max(0, scrollHeight - clientHeight);
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
