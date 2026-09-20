// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { cx, h, svg } from './h';

describe('cx', () => {
  it('joins truthy class names and skips empty values', () => {
    expect(cx('badge', false && 'hidden', undefined, 'badge-info')).toBe('badge badge-info');
  });

  it('includes object keys whose values are true', () => {
    expect(cx({ mono: true, bordered: false, 'badge-default': true })).toBe('mono badge-default');
  });
});

describe('h', () => {
  it('creates an element with classes, text children, and click handlers', () => {
    const onclick = vi.fn();
    const el = h('button', { class: 'btn', on: { click: onclick } }, 'Save');

    expect(el.tagName).toBe('BUTTON');
    expect(el.className).toBe('btn');
    expect(el.textContent).toBe('Save');

    el.click();
    expect(onclick).toHaveBeenCalledOnce();
  });

  it('sets boolean attributes and skips false ones', () => {
    const el = h('input', { attrs: { disabled: true, checked: false, type: 'checkbox' } });
    expect(el.getAttribute('disabled')).toBe('');
    expect(el.hasAttribute('checked')).toBe(false);
    expect(el.getAttribute('type')).toBe('checkbox');
  });
});

describe('svg', () => {
  it('creates an svg node in the svg namespace', () => {
    const el = svg('svg', { attrs: { viewBox: '0 0 24 24' } });
    expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(el.getAttribute('viewBox')).toBe('0 0 24 24');
  });
});
