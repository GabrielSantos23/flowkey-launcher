import { createElement, type ReactNode } from 'react';

/**
 * Minimal stroke icon set for the web screens (lucide-shaped paths, 24px
 * viewBox). The tree renderer resolves lucide names natively; the web page
 * owns its own copies so it never depends on the reconciler.
 */

export type IconName =
  | 'arrow-left'
  | 'search'
  | 'chevron-down'
  | 'play'
  | 'pause'
  | 'skip-back'
  | 'skip-forward'
  | 'shuffle'
  | 'repeat'
  | 'repeat-1'
  | 'heart'
  | 'heart-off'
  | 'volume'
  | 'volume-x'
  | 'link'
  | 'list-music'
  | 'disc'
  | 'radio'
  | 'plus'
  | 'minus'
  | 'check'
  | 'music'
  | 'speaker'
  | 'user'
  | 'clock';

const PATHS: Record<IconName, ReactNode> = {
  'arrow-left': createElement('path', { d: 'M19 12H5M12 19l-7-7 7-7' }),
  search: createElement('g', null, [
    createElement('circle', { cx: 11, cy: 11, r: 7 }),
    createElement('path', { d: 'm20 20-3.4-3.4' }),
  ]),
  'chevron-down': createElement('path', { d: 'm6 9 6 6 6-6' }),
  play: createElement('path', { d: 'M7 5v14l12-7z', fill: 'currentColor', stroke: 'none' }),
  pause: createElement('g', { fill: 'currentColor', stroke: 'none' }, [
    createElement('rect', { x: 6, y: 5, width: 4, height: 14, rx: 1 }),
    createElement('rect', { x: 14, y: 5, width: 4, height: 14, rx: 1 }),
  ]),
  'skip-back': createElement('g', { fill: 'currentColor', stroke: 'none' }, [
    createElement('path', { d: 'M6 5v14a1 1 0 0 0 2 0V5a1 1 0 0 0-2 0z' }),
    createElement('path', {
      d: 'M19 5.9v12.2a1 1 0 0 1-1.6.8L9 13a1.2 1.2 0 0 1 0-2l8.4-5.9a1 1 0 0 1 1.6.8z',
    }),
  ]),
  'skip-forward': createElement('g', { fill: 'currentColor', stroke: 'none' }, [
    createElement('path', { d: 'M18 5v14a1 1 0 0 1-2 0V5a1 1 0 0 1 2 0z' }),
    createElement('path', {
      d: 'M5 5.9v12.2a1 1 0 0 0 1.6.8L15 13a1.2 1.2 0 0 0 0-2L6.6 5.1A1 1 0 0 0 5 5.9z',
    }),
  ]),
  shuffle: createElement('g', null, [
    createElement('path', { d: 'M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22' }),
    createElement('path', { d: 'm18 2 4 4-4 4' }),
    createElement('path', { d: 'M2 6h1.9c1.5 0 2.9.9 3.6 2.2' }),
    createElement('path', { d: 'M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8' }),
    createElement('path', { d: 'm18 14 4 4-4 4' }),
  ]),
  repeat: createElement('g', null, [
    createElement('path', { d: 'm17 2 4 4-4 4' }),
    createElement('path', { d: 'M3 11v-1a4 4 0 0 1 4-4h14' }),
    createElement('path', { d: 'm7 22-4-4 4-4' }),
    createElement('path', { d: 'M21 13v1a4 4 0 0 1-4 4H3' }),
  ]),
  'repeat-1': createElement('g', null, [
    createElement('path', { d: 'm17 2 4 4-4 4' }),
    createElement('path', { d: 'M3 11v-1a4 4 0 0 1 4-4h14' }),
    createElement('path', { d: 'm7 22-4-4 4-4' }),
    createElement('path', { d: 'M21 13v1a4 4 0 0 1-4 4H3' }),
    createElement('path', { d: 'M11 10h1v4', fill: 'currentColor', stroke: 'none' }),
  ]),
  heart: createElement('path', {
    d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z',
  }),
  'heart-off': createElement('g', null, [
    createElement('path', { d: 'M19.5 12.57 12 20l-7-7c-.87-.87-2-2.34-2-4.5' }),
    createElement('path', { d: 'M19.5 12.57 19 13' }),
    createElement('path', { d: 'M3.42 3.42a5.5 5.5 0 0 1 7.58.9 5.5 5.5 0 0 1 7.58 7.58' }),
  ]),
  volume: createElement('g', null, [
    createElement('path', {
      d: 'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z',
    }),
    createElement('path', { d: 'M16 9a5 5 0 0 1 0 6' }),
    createElement('path', { d: 'M19.364 18.364a9 9 0 0 0 0-12.728' }),
  ]),
  'volume-x': createElement('g', null, [
    createElement('path', {
      d: 'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z',
    }),
    createElement('path', { d: 'm22 9-6 6' }),
    createElement('path', { d: 'm16 9 6 6' }),
  ]),
  link: createElement('g', null, [
    createElement('path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }),
    createElement('path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }),
  ]),
  'list-music': createElement('g', null, [
    createElement('path', { d: 'M21 15V6' }),
    createElement('path', { d: 'M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' }),
    createElement('path', { d: 'M12 12H3' }),
    createElement('path', { d: 'M16 6H3' }),
    createElement('path', { d: 'M12 18H3' }),
  ]),
  disc: createElement('g', null, [
    createElement('circle', { cx: 12, cy: 12, r: 10 }),
    createElement('circle', { cx: 12, cy: 12, r: 2 }),
  ]),
  radio: createElement('g', null, [
    createElement('circle', { cx: 12, cy: 12, r: 2 }),
    createElement('path', { d: 'M4.93 19.07a10 10 0 0 1 0-14.14' }),
    createElement('path', { d: 'M7.76 16.24a6 6 0 0 1 0-8.49' }),
    createElement('path', { d: 'M16.24 7.76a6 6 0 0 1 0 8.49' }),
    createElement('path', { d: 'M19.07 4.93a10 10 0 0 1 0 14.14' }),
  ]),
  plus: createElement('g', null, [
    createElement('path', { d: 'M5 12h14' }),
    createElement('path', { d: 'M12 5v14' }),
  ]),
  minus: createElement('path', { d: 'M5 12h14' }),
  check: createElement('path', { d: 'M20 6 9 17l-5-5' }),
  music: createElement('g', null, [
    createElement('path', { d: 'M9 18V5l12-2v13' }),
    createElement('circle', { cx: 6, cy: 18, r: 3 }),
    createElement('circle', { cx: 18, cy: 16, r: 3 }),
  ]),
  speaker: createElement('g', null, [
    createElement('rect', { x: 7, y: 3, width: 10, height: 18, rx: 2 }),
    createElement('circle', { cx: 12, cy: 14, r: 3 }),
    createElement('circle', { cx: 12, cy: 7, r: 1, fill: 'currentColor', stroke: 'none' }),
  ]),
  user: createElement('g', null, [
    createElement('circle', { cx: 12, cy: 8, r: 4 }),
    createElement('path', { d: 'M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5' }),
  ]),
  clock: createElement('g', null, [
    createElement('circle', { cx: 12, cy: 12, r: 9 }),
    createElement('path', { d: 'M12 7v5l3 2' }),
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

/** The Spotify brand badge from the reference footers. */
export function SpotifyBadge(): ReactNode {
  return createElement(
    'span',
    { className: 'sp-badge' },
    createElement(Icon, { name: 'music', size: 11 }),
  );
}
