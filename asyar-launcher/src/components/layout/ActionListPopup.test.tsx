// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import ActionListPopup from './ActionListPopup';
import { actionService } from '../../services/action/actionService';

vi.mock('../../lib/listScroll', () => ({
  scrollSelectedIntoView: vi.fn(),
  resetListScroll: vi.fn(),
}));

vi.mock('../../services/action/actionService', () => ({
  actionService: {
    executeAction: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../services/feedback/feedbackService', () => ({
  feedbackService: {
    confirmAlert: vi.fn().mockResolvedValue(true),
  },
}));

describe('ActionListPopup', () => {
  const actions = [
    {
      id: 'clipboard-history:paste-plain',
      label: 'Paste as Plain Text',
      icon: 'icon:clipboard',
      execute: vi.fn(),
    },
    {
      id: 'clipboard-history:toggle-favorite',
      label: 'Toggle Favorite',
      icon: 'icon:star',
      execute: vi.fn(),
    },
    {
      id: 'clipboard-history:save-as-snippet',
      label: 'Save as Snippet',
      icon: 'icon:scissors',
      execute: vi.fn(),
    },
    {
      id: 'clipboard-history:delete',
      label: 'Delete',
      icon: 'icon:trash',
      destructive: true,
      shortcut: 'Super+Backspace',
      execute: vi.fn(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all actions and search input with correct placeholder', () => {
    render(<ActionListPopup availableActions={actions} />);

    expect(screen.getByText('Paste as Plain Text')).toBeTruthy();
    expect(screen.getByText('Toggle Favorite')).toBeTruthy();
    expect(screen.getByText('Save as Snippet')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();

    const input = screen.getByPlaceholderText('Search for actions...');
    expect(input).toBeTruthy();
  });

  it('renders destructive action with danger styling', () => {
    const { container } = render(<ActionListPopup availableActions={actions} />);
    const deleteTitle = screen.getByText('Delete');
    expect(deleteTitle.className).toContain('text-[var(--accent-danger)]');
  });

  it('filters actions when searching', () => {
    render(<ActionListPopup availableActions={actions} />);
    const input = screen.getByPlaceholderText('Search for actions...');
    fireEvent.change(input, { target: { value: 'snippet' } });

    expect(screen.queryByText('Paste as Plain Text')).toBeNull();
    expect(screen.getByText('Save as Snippet')).toBeTruthy();
  });

  it('executes delete action on Cmd+Backspace', () => {
    const onclose = vi.fn();
    const { container } = render(<ActionListPopup availableActions={actions} onclose={onclose} />);

    fireEvent.keyDown(container.firstChild as HTMLElement, {
      key: 'Backspace',
      metaKey: true,
    });

    expect(actionService.executeAction).toHaveBeenCalledWith('clipboard-history:delete');
    expect(onclose).toHaveBeenCalled();
  });
});
