// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderBadge } from './Badge';
import { renderSpinner } from './Spinner';
import { renderStatusDot } from './StatusDot';
import { renderKeyboardHint } from './KeyboardHint';
import { renderInlineError } from '../feedback/InlineError';
import { renderLoadingState } from '../feedback/LoadingState';

describe('renderBadge', () => {
  it('applies variant, mono, and bordered classes', () => {
    const el = renderBadge({ text: 'Ready', variant: 'success', mono: true, bordered: true });
    expect(el.tagName).toBe('SPAN');
    expect(el.textContent).toBe('Ready');
    expect(el.className).toContain('badge');
    expect(el.className).toContain('badge-success');
    expect(el.className).toContain('mono');
    expect(el.className).toContain('bordered');
  });
});

describe('renderSpinner', () => {
  it('hides unlabeled spinners from assistive tech', () => {
    const el = renderSpinner({ size: 'sm', accent: true });
    expect(el.className).toContain('spinner--sm');
    expect(el.className).toContain('accent');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.getAttribute('role')).toBeNull();
  });

  it('exposes a status role when a label is provided', () => {
    const el = renderSpinner({ label: 'Loading' });
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-label')).toBe('Loading');
    expect(el.hasAttribute('aria-hidden')).toBe(false);
  });
});

describe('renderStatusDot', () => {
  it('sets colour class and CSS size variable', () => {
    const el = renderStatusDot({ color: 'danger', pulse: true, size: 10 });
    expect(el.className).toContain('dot-danger');
    expect(el.className).toContain('pulse');
    expect(el.style.getPropertyValue('--dot-size')).toBe('10px');
  });
});

describe('renderKeyboardHint', () => {
  it('renders each key and an optional action label', () => {
    const el = renderKeyboardHint({ keys: ['⌘', 'K'], action: 'Actions' });
    const keys = [...el.querySelectorAll('kbd')].map((node) => node.textContent);
    expect(keys).toEqual(['⌘', 'K']);
    expect(el.querySelector('.action')?.textContent).toBe('Actions');
  });
});

describe('renderInlineError', () => {
  it('renders the message', () => {
    expect(renderInlineError({ message: 'Required' }).textContent).toBe('Required');
  });
});

describe('renderLoadingState', () => {
  it('shows an accent spinner beside the message', () => {
    const el = renderLoadingState({ message: 'Loading notes' });
    expect(el.querySelector('.spinner.accent')).not.toBeNull();
    expect(el.querySelector('.loading-text')?.textContent).toBe('Loading notes');
  });
});
