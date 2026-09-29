import { createElement, type ReactNode } from 'react';

export type IconName =
  | 'clipboard'
  | 'file-text'
  | 'link'
  | 'at-sign'
  | 'file'
  | 'image'
  | 'square'
  | 'copy'
  | 'pencil'
  | 'trash-2'
  | 'clipboard-paste'
  | 'alert';

const PATHS: Record<IconName, ReactNode> = {
  clipboard: createElement('g', null, [
    createElement('rect', { x: 8, y: 2, width: 8, height: 4, rx: 1 }),
    createElement('path', {
      d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
    }),
  ]),
  'file-text': createElement('g', null, [
    createElement('path', {
      d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
    }),
    createElement('path', { d: 'M14 2v6h6' }),
    createElement('path', { d: 'M16 13H8' }),
    createElement('path', { d: 'M16 17H8' }),
    createElement('path', { d: 'M10 9H8' }),
  ]),
  link: createElement('g', null, [
    createElement('path', {
      d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
    }),
    createElement('path', {
      d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    }),
  ]),
  'at-sign': createElement('g', null, [
    createElement('circle', { cx: 12, cy: 12, r: 4 }),
    createElement('path', { d: 'M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8' }),
  ]),
  file: createElement('g', null, [
    createElement('path', {
      d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z',
    }),
    createElement('path', { d: 'M14 2v5h5' }),
  ]),
  image: createElement('g', null, [
    createElement('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }),
    createElement('circle', { cx: 9, cy: 9, r: 2 }),
    createElement('path', { d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' }),
  ]),
  square: createElement('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }),
  copy: createElement('g', null, [
    createElement('rect', { x: 9, y: 9, width: 12, height: 12, rx: 2 }),
    createElement('path', { d: 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1' }),
  ]),
  pencil: createElement('g', null, [
    createElement('path', { d: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z' }),
    createElement('path', { d: 'm15 5 4 4' }),
  ]),
  'trash-2': createElement('g', null, [
    createElement('path', { d: 'M3 6h18' }),
    createElement('path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' }),
    createElement('path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }),
    createElement('path', { d: 'M10 11v6' }),
    createElement('path', { d: 'M14 11v6' }),
  ]),
  'clipboard-paste': createElement('g', null, [
    createElement('rect', { x: 8, y: 2, width: 8, height: 4, rx: 1 }),
    createElement('path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5v-5' }),
    createElement('path', { d: 'M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-5' }),
    createElement('rect', { x: 12, y: 15, width: 7, height: 7, rx: 1 }),
  ]),
  alert: createElement('g', null, [
    createElement('circle', { cx: 12, cy: 12, r: 9 }),
    createElement('path', { d: 'M12 8v4.5' }),
    createElement('path', { d: 'M12 16h.01' }),
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
