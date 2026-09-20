import { cx, h } from '../../ui/h';

export type StatusDotColor = 'success' | 'warning' | 'danger' | 'info';

export type StatusDotProps = {
  color?: StatusDotColor;
  pulse?: boolean;
  size?: number;
};

export function renderStatusDot({
  color = 'success',
  pulse = false,
  size = 8,
}: StatusDotProps): HTMLDivElement {
  return h('div', {
    class: cx('status-dot', `dot-${color}`, { pulse }),
    style: { '--dot-size': `${size}px` },
  });
}
