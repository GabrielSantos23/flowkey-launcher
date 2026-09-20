import { cx, h, svg } from '../../ui/h';

export type CheckboxProps = {
  checked?: boolean;
  disabled?: boolean;
  onchange?: (checked: boolean) => void;
};

export function renderCheckbox({
  checked = false,
  disabled = false,
  onchange,
}: CheckboxProps): HTMLLabelElement {
  return h(
    'label',
    { class: cx('checkbox-wrapper', { disabled }) },
    h('input', {
      class: 'sr-only',
      attrs: { type: 'checkbox', checked, disabled },
      on: onchange
        ? {
            change: (e) => onchange((e.target as HTMLInputElement).checked),
          }
        : undefined,
    }),
    h(
      'span',
      { class: cx('checkbox-box', { checked }) },
      checked
        ? svg('svg', {
            class: 'checkmark',
            attrs: {
              viewBox: '0 0 10 8',
              fill: 'none',
              xmlns: 'http://www.w3.org/2000/svg',
            },
            children: svg('path', {
              attrs: {
                d: 'M1 4L3.8 7L9 1',
                stroke: 'currentColor',
                'stroke-width': '1.6',
                'stroke-linecap': 'round',
                'stroke-linejoin': 'round',
              },
            }),
          })
        : null,
    ),
  );
}
