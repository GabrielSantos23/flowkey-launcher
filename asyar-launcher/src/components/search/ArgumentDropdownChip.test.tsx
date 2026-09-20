// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import type { CommandArgument } from 'asyar-sdk/contracts';

import ArgumentDropdownChip from './ArgumentDropdownChip';

const ARG: CommandArgument = {
  name: 'scope',
  type: 'dropdown',
  placeholder: 'Scope',
  data: [
    { value: 'active', title: 'Active' },
    { value: 'all', title: 'All' },
    { value: 'archived', title: 'Archived' },
  ],
};

async function renderChip(props: { value?: string; touched?: boolean; readonly?: boolean } = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onReset: vi.fn(),
    onKeydown: vi.fn(),
    onInput: vi.fn(),
  };
  const view = render(
    <ArgumentDropdownChip
      arg={ARG}
      value={props.value ?? 'active'}
      touched={props.touched ?? false}
      focused={true}
      readonly={props.readonly ?? false}
      {...handlers}
    />,
  );
  await new Promise((r) => setTimeout(r, 0));
  const trigger = view.container.querySelector<HTMLButtonElement>('.arg-trigger')!;
  const optionTitles = () =>
    Array.from(view.container.querySelectorAll('.arg-popover-list .result-title')).map((el) =>
      el.textContent?.trim(),
    );
  const filter = () => view.container.querySelector<HTMLInputElement>('.arg-popover-search input');
  const highlighted = () =>
    view.container.querySelector('.selected-result .result-title')?.textContent?.trim();
  return { ...handlers, view, trigger, optionTitles, filter, highlighted };
}

describe('ArgumentDropdownChip', () => {
  it('shows the seeded option greyed until the user picks something', async () => {
    const untouched = await renderChip();
    expect(untouched.trigger.textContent).toContain('Active');
    expect(untouched.trigger.classList.contains('arg-trigger--touched')).toBe(false);

    const picked = await renderChip({ touched: true });
    expect(picked.trigger.classList.contains('arg-trigger--touched')).toBe(true);
  });

  it('falls back to the placeholder when nothing is seeded', async () => {
    const { trigger } = await renderChip({ value: '' });
    expect(trigger.textContent).toContain('Scope');
  });

  it('neither end of the closed list wraps', async () => {
    const top = await renderChip();
    await fireEvent.keyDown(top.trigger, { key: 'ArrowUp' });
    expect(top.onReset).not.toHaveBeenCalled();
    expect(top.onSelect).not.toHaveBeenCalled();

    const bottom = await renderChip({ value: 'archived', touched: true });
    await fireEvent.keyDown(bottom.trigger, { key: 'ArrowDown' });
    expect(bottom.onSelect).not.toHaveBeenCalled();
  });
});
