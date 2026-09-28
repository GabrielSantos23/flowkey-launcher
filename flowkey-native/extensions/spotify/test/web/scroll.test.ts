import { describe, expect, test } from 'bun:test';
import {
  applyScroll,
  AUTO_FOLLOW_RESUME_MS,
  LINE_STEP_PX,
  maxScrollTop,
  PAGE_STEP_RATIO,
  scrollBehaviorFor,
  scrollIntentForKey,
  scrollIntentForPageAction,
  scrollTargetFor,
  shouldAutoFollow,
  type ScrollMetrics,
} from '../../src/web/scroll';

const metrics = (overrides: Partial<ScrollMetrics> = {}): ScrollMetrics => ({
  scrollTop: 0,
  scrollHeight: 1_600,
  clientHeight: 400,
  ...overrides,
});

/** Minimal stand-in for a DOM scroller — no browser needed. */
class FakeScroller implements ScrollMetrics {
  scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly calls: { top: number; behavior: string }[] = [];

  constructor(overrides: Partial<ScrollMetrics> = {}) {
    this.scrollTop = overrides.scrollTop ?? 0;
    this.scrollHeight = overrides.scrollHeight ?? 1_600;
    this.clientHeight = overrides.clientHeight ?? 400;
  }

  scrollTo(options: { top: number; behavior?: 'smooth' | 'auto' }): void {
    this.calls.push({ top: options.top, behavior: options.behavior ?? 'auto' });
    this.scrollTop = options.top;
  }
}

describe('maxScrollTop', () => {
  test('is the overflow beyond the viewport', () => {
    expect(maxScrollTop(metrics())).toBe(1_200);
  });

  test('never goes negative for content that fits', () => {
    expect(maxScrollTop(metrics({ scrollHeight: 300 }))).toBe(0);
  });
});

describe('scrollTargetFor', () => {
  test('line steps move a fixed distance', () => {
    expect(scrollTargetFor(metrics({ scrollTop: 600 }), 'lineDown')).toBe(600 + LINE_STEP_PX);
    expect(scrollTargetFor(metrics({ scrollTop: 600 }), 'lineUp')).toBe(600 - LINE_STEP_PX);
  });

  test('page steps move most of the viewport', () => {
    const from = metrics({ scrollTop: 500 });
    expect(scrollTargetFor(from, 'pageDown')).toBe(500 + 400 * PAGE_STEP_RATIO);
    expect(scrollTargetFor(from, 'pageUp')).toBe(500 - 400 * PAGE_STEP_RATIO);
  });

  test('edge intents jump to the ends of the content', () => {
    expect(scrollTargetFor(metrics({ scrollTop: 700 }), 'top')).toBe(0);
    expect(scrollTargetFor(metrics({ scrollTop: 700 }), 'bottom')).toBe(1_200);
  });

  test('clamps to the scrollable range', () => {
    expect(scrollTargetFor(metrics({ scrollTop: 40 }), 'lineUp')).toBe(0);
    expect(scrollTargetFor(metrics({ scrollTop: 1_190 }), 'pageDown')).toBe(1_200);
    expect(scrollTargetFor(metrics({ scrollTop: 1_200 }), 'lineDown')).toBe(1_200);
  });

  test('a page step is a no-op on content that fits the viewport', () => {
    const short = metrics({ scrollHeight: 400, scrollTop: 0 });
    expect(scrollTargetFor(short, 'pageDown')).toBe(0);
    expect(scrollTargetFor(short, 'bottom')).toBe(0);
  });
});

describe('scrollIntentForKey', () => {
  test('maps arrows, page keys and home/end', () => {
    expect(scrollIntentForKey('ArrowDown')).toBe('lineDown');
    expect(scrollIntentForKey('ArrowUp')).toBe('lineUp');
    expect(scrollIntentForKey('PageDown')).toBe('pageDown');
    expect(scrollIntentForKey('PageUp')).toBe('pageUp');
    expect(scrollIntentForKey('Home')).toBe('top');
    expect(scrollIntentForKey('End')).toBe('bottom');
  });

  test('ignores keys the launcher chrome owns', () => {
    expect(scrollIntentForKey('Enter')).toBeNull();
    expect(scrollIntentForKey('Escape')).toBeNull();
    expect(scrollIntentForKey('Tab')).toBeNull();
  });
});

describe('scrollIntentForPageAction', () => {
  test('maps the actions the shell forwards from the search box', () => {
    expect(scrollIntentForPageAction('moveDown')).toBe('lineDown');
    expect(scrollIntentForPageAction('moveUp')).toBe('lineUp');
    expect(scrollIntentForPageAction('pageDown')).toBe('pageDown');
    expect(scrollIntentForPageAction('pageUp')).toBe('pageUp');
  });

  test('ignores non-scroll page actions', () => {
    expect(scrollIntentForPageAction('primary')).toBeNull();
    expect(scrollIntentForPageAction('goBack')).toBeNull();
  });
});

describe('scrollBehaviorFor', () => {
  test('line steps stay instant so repeated presses keep up', () => {
    expect(scrollBehaviorFor('lineUp')).toBe('auto');
    expect(scrollBehaviorFor('lineDown')).toBe('auto');
  });

  test('page and edge jumps animate', () => {
    expect(scrollBehaviorFor('pageUp')).toBe('smooth');
    expect(scrollBehaviorFor('pageDown')).toBe('smooth');
    expect(scrollBehaviorFor('top')).toBe('smooth');
    expect(scrollBehaviorFor('bottom')).toBe('smooth');
  });
});

describe('applyScroll', () => {
  test('moves the scroller and reports that it did', () => {
    const scroller = new FakeScroller({ scrollTop: 300 });

    expect(applyScroll(scroller, 'lineDown')).toBe(true);
    expect(scroller.scrollTop).toBe(300 + LINE_STEP_PX);
    expect(scroller.calls.at(-1)?.behavior).toBe('auto');
  });

  test('reports no movement at the edge of the content', () => {
    const top = new FakeScroller({ scrollTop: 0 });
    expect(applyScroll(top, 'lineUp')).toBe(false);
    expect(top.calls).toHaveLength(0);

    const end = new FakeScroller({ scrollTop: 1_200 });
    expect(applyScroll(end, 'lineDown')).toBe(false);
    expect(end.calls).toHaveLength(0);
  });

  test('content shorter than the viewport never scrolls', () => {
    const scroller = new FakeScroller({ scrollHeight: 300, clientHeight: 400 });
    expect(applyScroll(scroller, 'pageDown')).toBe(false);
    expect(applyScroll(scroller, 'bottom')).toBe(false);
  });
});

describe('shouldAutoFollow', () => {
  test('follows while no manual scroll is pending', () => {
    expect(shouldAutoFollow(0, 1_000)).toBe(true);
  });

  test('suspends the synced auto-scroll until the resume deadline', () => {
    const resumeAt = 10_000;
    expect(shouldAutoFollow(resumeAt, resumeAt - 1)).toBe(false);
    expect(shouldAutoFollow(resumeAt, resumeAt + AUTO_FOLLOW_RESUME_MS)).toBe(true);
  });
});
