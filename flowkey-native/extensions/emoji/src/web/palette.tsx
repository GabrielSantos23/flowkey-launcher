import { createElement, useEffect, type ReactNode } from 'react';
import type { EmojiAction } from './context';
import { Icon } from './icons';

/**
 * The in-page action palette (the Ctrl+K panel): a floating panel with an
 * action filter field and action rows. Filtering and keyboard handling live in
 * the app shell — this component only renders.
 */
export function ActionPalette(props: {
  filter: string;
  onFilterChange: (filter: string) => void;
  actions: EmojiAction[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRun: (action: EmojiAction) => void;
  onClose: () => void;
}): ReactNode {
  // keep the highlighted action visible while arrowing through the list
  useEffect(() => {
    document.querySelector('.em-palette-row-selected')?.scrollIntoView({ block: 'nearest' });
  }, [props.selectedId]);

  return createElement(
    'div',
    {
      className: 'em-palette-backdrop',
      onMouseDown: (event: Event) => {
        if (event.target === event.currentTarget) props.onClose();
      },
    },
    createElement(
      'div',
      { className: 'em-palette' },
      createElement(
        'div',
        { className: 'em-palette-search' },
        createElement(Icon, { name: 'search', size: 14 }),
        createElement('input', {
          autoFocus: true,
          value: props.filter,
          placeholder: 'Search for actions…',
          spellCheck: false,
          onChange: (event: Event) => {
            props.onFilterChange((event.target as HTMLInputElement).value);
          },
        }),
      ),
      createElement(
        'div',
        { className: 'em-palette-rows' },
        props.actions.length === 0
          ? createElement('div', { className: 'em-palette-empty' }, 'No matching actions')
          : props.actions.map((action) =>
              createElement(
                'div',
                {
                  key: action.id,
                  className:
                    action.id === props.selectedId
                      ? 'em-palette-row em-palette-row-selected'
                      : 'em-palette-row',
                  onMouseEnter: () => props.onSelect(action.id),
                  onClick: () => props.onRun(action),
                },
                createElement(
                  'span',
                  { className: 'em-palette-row-icon' },
                  createElement(Icon, { name: action.icon, size: 15 }),
                ),
                createElement('span', { className: 'em-palette-row-title' }, action.title),
              ),
            ),
      ),
    ),
  );
}
