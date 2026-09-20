// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import SearchBarAccessoryDropdown from './SearchBarAccessoryDropdown';

describe('SearchBarAccessoryDropdown', () => {
  const options = [
    { value: 'all', title: 'All Items' },
    { value: 'active', title: 'Active Items' },
    { value: 'archived', title: 'Archived Items' },
  ];

  async function renderDropdown(props = {}) {
    const onChange = vi.fn();
    const onclose = vi.fn();
    const view = render(
      <SearchBarAccessoryDropdown
        options={options}
        value="all"
        onChange={onChange}
        onclose={onclose}
        {...props}
      />,
    );
    const button = view.container.querySelector<HTMLButtonElement>('.accessory-button')!;
    return { view, button, onChange, onclose };
  }

  it('renders dropdown button with selected option title', async () => {
    const { button } = await renderDropdown();
    expect(button).not.toBeNull();
    expect(button.textContent).toContain('All Items');
  });
});
