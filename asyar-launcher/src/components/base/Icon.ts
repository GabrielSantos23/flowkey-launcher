import { icons } from '../../lib/icons';
import { h, svg } from '../../ui/h';

export type IconProps = {
  name: string;
  size?: number;
  class?: string;
  strokeWidth?: number;
};

export function renderIcon({
  name,
  size = 20,
  class: className = '',
  strokeWidth = 1.5,
}: IconProps): HTMLElement | SVGElement {
  if (import.meta.env.DEV && !icons[name]) {
    console.warn(`Icon: unrecognized icon name "${name}" — rendering a blank placeholder.`);
  }

  if (!icons[name]) {
    return h('span', {
      class: 'inline-block',
      style: { width: `${size}px`, height: `${size}px` },
    });
  }

  return svg('svg', {
    class: className,
    attrs: {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': strokeWidth,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    html: icons[name],
  });
}
