import { cx, h, type Child } from '../../ui/h';

export type ButtonProps = {
  type?: 'button' | 'submit';
  disabled?: boolean;
  fullWidth?: boolean;
  class?: string;
  onclick?: (e: MouseEvent) => void;
  children?: Child;
};

export function buttonClass({
  fullWidth = false,
  class: className = '',
}: Pick<ButtonProps, 'fullWidth' | 'class'>): string {
  return cx('btn', className, { 'btn-full': fullWidth });
}

export function renderButton({
  type = 'button',
  disabled = false,
  fullWidth = false,
  class: className = '',
  onclick,
  children,
}: ButtonProps): HTMLButtonElement {
  return h(
    'button',
    {
      class: buttonClass({ fullWidth, class: className }),
      attrs: { type, disabled },
      on: onclick ? { click: onclick as EventListener } : undefined,
    },
    h('span', { class: 'result-title' }, children),
  );
}
