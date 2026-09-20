import { cx, h, type Child } from '../../ui/h';

export type IconBoxProps = {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  rounded?: 'sm' | 'md' | 'lg' | 'full';
  children?: Child;
};

export function iconBoxClass({
  size = 'md',
  rounded = 'md',
}: Pick<IconBoxProps, 'size' | 'rounded'>): string {
  return cx('icon-box', `size-${size}`, `rounded-${rounded}`);
}

export function renderIconBox({
  size = 'md',
  rounded = 'md',
  children,
}: IconBoxProps): HTMLDivElement {
  return h('div', { class: iconBoxClass({ size, rounded }) }, children);
}
