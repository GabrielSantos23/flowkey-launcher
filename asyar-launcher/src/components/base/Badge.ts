import { cx, h, type Child } from '../../ui/h';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

export type BadgeProps = {
  text: string;
  variant?: BadgeVariant;
  mono?: boolean;
  bordered?: boolean;
};

export function renderBadge({
  text,
  variant = 'default',
  mono = false,
  bordered = false,
}: BadgeProps): HTMLSpanElement {
  return h(
    'span',
    {
      class: cx('badge', `badge-${variant}`, { mono, bordered }),
    },
    text,
  );
}

export type { Child };
