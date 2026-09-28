import { createElement, type ReactNode } from 'react';

export type IconName =
  'copy' | 'clipboard-paste' | 'type' | 'search' | 'alert' | 'star' | 'star-off';

const PATHS: Record<IconName, ReactNode> = {
  copy: createElement('g', null, [
    createElement('rect', { x: 9, y: 9, width: 12, height: 12, rx: 2 }),
    createElement('path', { d: 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1' }),
  ]),
  'clipboard-paste': createElement('g', null, [
    createElement('path', { d: 'M9 4h6v3H9z' }),
    createElement('path', {
      d: 'M15 5.5h3a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1h3',
    }),
  ]),
  type: createElement('g', null, [
    createElement('path', { d: 'M5 7V5h14v2' }),
    createElement('path', { d: 'M12 5v14' }),
    createElement('path', { d: 'M9 19h6' }),
  ]),
  search: createElement('g', null, [
    createElement('circle', { cx: 11, cy: 11, r: 7 }),
    createElement('path', { d: 'm20 20-3.4-3.4' }),
  ]),
  alert: createElement('g', null, [
    createElement('circle', { cx: 12, cy: 12, r: 9 }),
    createElement('path', { d: 'M12 8v4.5' }),
    createElement('path', { d: 'M12 16h.01' }),
  ]),
  star: createElement('path', {
    d: 'm12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z',
  }),
  'star-off': createElement('g', null, [
    createElement('path', {
      d: 'm12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z',
    }),
    createElement('path', { d: 'm4 4 16 16' }),
  ]),
};

export function Icon(props: { name: IconName; size?: number; className?: string }): ReactNode {
  return createElement(
    'svg',
    {
      className: props.className,
      width: props.size ?? 16,
      height: props.size ?? 16,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    PATHS[props.name],
  );
}
