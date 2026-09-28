import { describe, expect, test } from 'bun:test';
import {
  maxScrollTop,
  scrollIntentForKey,
  scrollIntentForPageAction,
  scrollTopFor,
  PAGE_STEP_RATIO,
} from '../src/web/scroll';

const metrics = { clientHeight: 400, scrollHeight: 1000 };
const step = Math.round(400 * PAGE_STEP_RATIO);

describe('scroll intent mapping', () => {
  test('owns the page keys and leaves the arrow keys to card selection', () => {
    expect(scrollIntentForKey('PageUp')).toBe('pageUp');
    expect(scrollIntentForKey('PageDown')).toBe('pageDown');
    expect(scrollIntentForKey('Home')).toBe('home');
    expect(scrollIntentForKey('End')).toBe('end');
    expect(scrollIntentForKey('ArrowDown')).toBeNull();
    expect(scrollIntentForKey('Enter')).toBeNull();
  });

  test('maps the shell-forwarded page actions', () => {
    expect(scrollIntentForPageAction('pageDown')).toBe('pageDown');
    expect(scrollIntentForPageAction('pageUp')).toBe('pageUp');
    expect(scrollIntentForPageAction('home')).toBe('home');
    expect(scrollIntentForPageAction('end')).toBe('end');
    expect(scrollIntentForPageAction('moveDown')).toBeNull();
    expect(scrollIntentForPageAction('primary')).toBeNull();
  });
});

describe('scrollTopFor', () => {
  test('pages by most of the viewport', () => {
    expect(scrollTopFor('pageDown', { ...metrics, scrollTop: 0 })).toBe(step);
    expect(scrollTopFor('pageUp', { ...metrics, scrollTop: step + 10 })).toBe(10);
  });

  test('clamps to the scrollable range', () => {
    expect(maxScrollTop(metrics.clientHeight, metrics.scrollHeight)).toBe(600);
    expect(scrollTopFor('pageDown', { ...metrics, scrollTop: 590 })).toBe(600);
    expect(scrollTopFor('pageUp', { ...metrics, scrollTop: 10 })).toBe(0);
    expect(scrollTopFor('end', { ...metrics, scrollTop: 0 })).toBe(600);
    expect(scrollTopFor('home', { ...metrics, scrollTop: 400 })).toBe(0);
  });

  test('never scrolls a page that fits', () => {
    const short = { clientHeight: 400, scrollHeight: 200 };
    expect(maxScrollTop(short.clientHeight, short.scrollHeight)).toBe(0);
    expect(scrollTopFor('pageDown', { ...short, scrollTop: 0 })).toBe(0);
    expect(scrollTopFor('end', { ...short, scrollTop: 0 })).toBe(0);
  });

  test('keeps a usable step for a very short viewport', () => {
    expect(scrollTopFor('pageDown', { clientHeight: 10, scrollHeight: 500, scrollTop: 0 })).toBe(
      80,
    );
  });
});
