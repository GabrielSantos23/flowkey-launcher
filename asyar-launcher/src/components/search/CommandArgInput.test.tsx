// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import type { CommandArgument } from 'asyar-sdk/contracts';

import CommandArgInput from './CommandArgInput';

const ARG: CommandArgument = { name: 'who', type: 'text', placeholder: 'Who to greet' };

async function renderChip(
  props: {
    arg?: CommandArgument;
    value?: string;
    readonly?: boolean;
    focused?: boolean;
  } = {},
) {
  const view = render(
    <CommandArgInput
      arg={props.arg ?? ARG}
      value={props.value ?? ''}
      focused={props.focused ?? false}
      readonly={props.readonly ?? false}
      onInput={vi.fn()}
      onKeydown={vi.fn()}
    />,
  );
  await new Promise((r) => setTimeout(r, 0));
  return view;
}

describe('CommandArgInput', () => {
  describe('the hint chip', () => {
    it('renders the hint as text, not as an input', async () => {
      const view = await renderChip({ readonly: true });
      expect(view.container.querySelector('input')).toBeNull();
      expect(view.container.querySelector('.arg-ghost-text')?.textContent).toBe('Who to greet');
    });

    it('shows a resumed value in place of the hint', async () => {
      const view = await renderChip({ readonly: true, value: 'Wayne' });
      const ghost = view.container.querySelector('.arg-ghost-text');
      expect(ghost?.textContent).toBe('Wayne');
      expect(ghost?.classList.contains('arg-ghost-text--hint')).toBe(false);
    });

    it('masks a password rather than previewing it', async () => {
      const view = await renderChip({
        arg: { name: 'token', type: 'password', placeholder: 'API key' },
        readonly: true,
        value: 'hunter2',
      });
      expect(view.container.querySelector('.arg-ghost-text')?.textContent).toBe('•••••••');
    });

    it('falls back to the argument name when no placeholder is declared', async () => {
      const view = await renderChip({ arg: { name: 'who', type: 'text' }, readonly: true });
      expect(view.container.querySelector('.arg-ghost-text')?.textContent).toBe('who');
    });
  });

  it('is a real input once argument mode owns it', async () => {
    const view = await renderChip();
    const input = view.container.querySelector<HTMLInputElement>('input.arg-input');
    expect(input).not.toBeNull();
    expect(input!.placeholder).toBe('Who to greet');
    expect(view.container.querySelector('.arg-ghost-text')).toBeNull();
  });
});
