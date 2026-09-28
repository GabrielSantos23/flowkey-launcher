import { createElement, type ReactNode } from 'react';

export type IconName =
  | 'languages'
  | 'swap'
  | 'copy'
  | 'check'
  | 'clipboard'
  | 'search'
  | 'alert'
  | 'type'
  | 'volume-off'
  | 'refresh'
  | 'chevron-down';

const PATHS: Record<IconName, ReactNode> = {
  languages: createElement('g', null, [
    createElement('path', { d: 'M3 5h10M9 3v2c0 4.5-2.6 8-6 10' }),
    createElement('path', { d: 'M5 9c1.6 2.6 3.9 4.6 6.5 5.7' }),
    createElement('path', { d: 'm13 21 4.5-11L22 21' }),
    createElement('path', { d: 'M14.6 17h5.8' }),
  ]),
  swap: createElement('g', null, [
    createElement('path', { d: 'M7 4 3 8l4 4' }),
    createElement('path', { d: 'M3 8h13a4 4 0 0 1 0 8h-1' }),
    createElement('path', { d: 'm17 20 4-4-4-4' }),
  ]),
  copy: createElement('g', null, [
    createElement('rect', { x: 9, y: 9, width: 12, height: 12, rx: 2 }),
    createElement('path', { d: 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1' }),
  ]),
  check: createElement('path', { d: 'm5 13 4 4L19 7' }),
  clipboard: createElement('g', null, [
    createElement('path', { d: 'M9 4h6v3H9z' }),
    createElement('path', {
      d: 'M15 5.5h3a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1h3',
    }),
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
  type: createElement('g', null, [
    createElement('path', { d: 'M5 7V5h14v2' }),
    createElement('path', { d: 'M12 5v14' }),
    createElement('path', { d: 'M9 19h6' }),
  ]),
  'volume-off': createElement('g', null, [
    createElement('path', { d: 'M11 5 6.5 9H3v6h3.5L11 19z' }),
    createElement('path', { d: 'm16 9 5 5' }),
    createElement('path', { d: 'm21 9-5 5' }),
  ]),
  refresh: createElement('g', null, [
    createElement('path', { d: 'M20 11a8 8 0 1 0-1.3 5.5' }),
    createElement('path', { d: 'M20 4v7h-7' }),
  ]),
  'chevron-down': createElement('path', { d: 'm6 9 6 6 6-6' }),
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
