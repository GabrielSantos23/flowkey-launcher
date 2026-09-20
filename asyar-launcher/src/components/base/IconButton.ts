import { cx, h, type Child } from '../../ui/h';

export type IconButtonProps = {
  onclick?: (e: MouseEvent) => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  tabindex?: number;
  class?: string;
  variant?: 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children?: Child;
};

export function iconButtonClass({
  variant = 'ghost',
  size = 'md',
  class: className = '',
}: Pick<IconButtonProps, 'variant' | 'size' | 'class'>): string {
  return cx('icon-button', `size-${size}`, `variant-${variant}`, className);
}

export function renderIconButton({
  onclick,
  disabled = false,
  title,
  ariaLabel,
  tabindex,
  class: className = '',
  variant = 'ghost',
  size = 'md',
  children,
}: IconButtonProps): HTMLButtonElement {
  return h(
    'button',
    {
      class: iconButtonClass({ variant, size, class: className }),
      attrs: {
        type: 'button',
        disabled,
        title,
        'aria-label': ariaLabel,
        tabindex,
      },
      on: onclick ? { click: onclick as EventListener } : undefined,
    },
    children,
  );
}
