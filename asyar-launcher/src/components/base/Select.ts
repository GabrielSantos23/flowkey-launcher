import { cx, h, svg } from '../../ui/h';

export type SelectOption = { value: string; label: string };

export type SelectProps = {
  value?: string;
  options?: SelectOption[];
  disabled?: boolean;
  onchange?: (value: string) => void;
};

export function renderSelect({
  value = '',
  options = [],
  disabled = false,
  onchange,
}: SelectProps): HTMLDivElement {
  return h(
    'div',
    { class: cx('select-wrap', { disabled }) },
    h(
      'select',
      {
        class: 'select-el',
        attrs: { disabled },
        on: onchange
          ? {
              change: (e) => onchange((e.target as HTMLSelectElement).value),
            }
          : undefined,
      },
      options.map((opt) =>
        h('option', { attrs: { value: opt.value, selected: opt.value === value } }, opt.label),
      ),
    ),
    svg('svg', {
      class: 'select-caret',
      attrs: { viewBox: '0 0 10 6', fill: 'none', 'aria-hidden': true },
      children: svg('path', {
        attrs: {
          d: 'M1 1l4 4 4-4',
          stroke: 'currentColor',
          'stroke-width': '1.5',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        },
      }),
    }),
  );
}

// Legacy path — kept for import compatibility after the React migration.
import { Select } from '../react/Inputs';
export { Select };
export default Select;
