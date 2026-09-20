import { cx, h } from '../../ui/h';

export type SpinnerSize = 'inline' | 'sm' | 'md';

export type SpinnerProps = {
  size?: SpinnerSize;
  accent?: boolean;
  label?: string;
};

export function renderSpinner({
  size = 'md',
  accent = false,
  label,
}: SpinnerProps): HTMLSpanElement {
  return h('span', {
    class: cx('spinner', `spinner--${size}`, { accent }),
    attrs: {
      role: label ? 'status' : undefined,
      'aria-label': label,
      'aria-hidden': label ? undefined : 'true',
    },
  });
}
