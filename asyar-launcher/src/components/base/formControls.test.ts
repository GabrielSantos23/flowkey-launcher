// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { inputClass } from './Input';
import { numericRows, textareaClass } from './Textarea';
import { selectSegment, segmentIsActive } from './SegmentedControl';
import { renderWarningBanner } from '../feedback/WarningBanner';
import { resolveFeedbackMessage } from '../feedback/ErrorState';

describe('inputClass', () => {
  it('applies the input class unless unstyled', () => {
    expect(inputClass()).toBe('input');
    expect(inputClass({ unstyled: true })).toBe('');
    expect(inputClass({ class: 'extra' })).toBe('input extra');
  });
});

describe('textareaClass', () => {
  it('mirrors the input class', () => {
    expect(textareaClass({ class: 'wide' })).toBe('input wide');
  });

  it('coerces rows to numbers', () => {
    expect(numericRows('4')).toBe(4);
    expect(numericRows(undefined)).toBeUndefined();
  });
});

describe('selectSegment', () => {
  it('returns the next value and fires change only on a real change', () => {
    const changes: string[] = [];
    expect(selectSegment('a', 'b', (v: string) => changes.push(v))).toBe('b');
    expect(selectSegment('b', 'b', (v: string) => changes.push(v))).toBe('b');
    expect(changes).toEqual(['b']);
  });

  it('reports active segments', () => {
    expect(segmentIsActive('a', 'a')).toBe(true);
    expect(segmentIsActive('a', 'b')).toBe(false);
  });
});

describe('renderWarningBanner', () => {
  it('renders icon, content, and optional actions', () => {
    const el = renderWarningBanner({
      children: 'Careful',
      actions: document.createElement('button'),
    });
    expect(el.className).toBe('warning-banner');
    expect(el.querySelector('.banner-icon')?.textContent).toBe('⚠️');
    expect(el.querySelector('.banner-content')?.textContent).toContain('Careful');
    expect(el.querySelector('.banner-actions button')).not.toBeNull();
  });
});

describe('resolveFeedbackMessage', () => {
  it('is empty without a status', () => {
    expect(resolveFeedbackMessage(null)).toBe('');
  });
});
