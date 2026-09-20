/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

const { scrollMock } = vi.hoisted(() => ({
  scrollMock: vi.fn(),
}));

vi.mock('../../lib/listScroll', () => ({
  scrollSelectedIntoView: (...args: unknown[]) => scrollMock(...args),
  resetListScroll: vi.fn(),
}));

import DefaultView from './DefaultView';
import { helpViewState } from './helpState';

function flushFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe('Help DefaultView keyboard scroll', () => {
  beforeEach(() => {
    scrollMock.mockClear();
    helpViewState.reset();
  });

  afterEach(() => {
    helpViewState.reset();
  });

  it('marks topic rows with data-index for scroll targeting', () => {
    const { container } = render(<DefaultView />);
    const rows = container.querySelectorAll('[data-index]');
    expect(rows.length).toBe(helpViewState.filtered.length);
    expect(rows[0]?.getAttribute('data-index')).toBe('0');
    if (rows.length > 1) {
      expect(rows[1]?.getAttribute('data-index')).toBe('1');
    }
  });

  it('scrolls the selected topic into view when the selection moves', async () => {
    const { rerender } = render(<DefaultView />);
    await flushFrame();
    scrollMock.mockClear();

    act(() => {
      helpViewState.move(1);
    });
    rerender(<DefaultView />);
    await flushFrame();

    expect(scrollMock).toHaveBeenCalled();
    const lastCall = scrollMock.mock.calls.at(-1);
    expect(lastCall?.[1]).toBe(1);
    expect(lastCall?.[0]).toBeInstanceOf(HTMLElement);
  });
});
