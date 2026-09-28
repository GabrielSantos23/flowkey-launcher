import { createElement, useEffect, useState, type ReactNode } from 'react';
import type { SpotifyClient } from '../api/client';
import { loadArtwork } from '../store';
import { Icon, type IconName } from './icons';

/** Shared chrome pieces for the web screens: top bar, footer, rows, artwork. */

export const SPOTIFY_GREEN = '#1DB954';

export function EmptyView(props: {
  title: string;
  description?: string;
  icon?: IconName;
}): ReactNode {
  return createElement(
    'div',
    { className: 'sp-empty' },
    props.icon ? createElement(Icon, { name: props.icon, size: 28 }) : null,
    createElement('div', { className: 'sp-empty-title' }, props.title),
    props.description
      ? createElement('div', { className: 'sp-empty-description' }, props.description)
      : null,
  );
}

/**
 * Resolves remote artwork URLs through the gated `image.fetch` route (cached
 * in the store module) and renders the local file URI.
 */
export function useArtwork(
  client: SpotifyClient,
  urls: (string | undefined)[],
): Record<string, string> {
  const key = urls.filter(Boolean).join('|');
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const url of key.split('|')) {
        if (!url) continue;
        const uri = await loadArtwork(client, url);
        if (alive && uri) {
          setMap((previous) => (previous[url] === uri ? previous : { ...previous, [url]: uri }));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [client, key]);
  return map;
}

export function Art(props: { src?: string; circle?: boolean; large?: boolean }): ReactNode {
  const className = ['sp-art', props.circle ? 'sp-art-circle' : '', props.large ? 'sp-art-lg' : '']
    .filter(Boolean)
    .join(' ');
  if (!props.src) {
    return createElement(
      'span',
      { className: `${className} sp-art-fallback` },
      createElement(Icon, { name: props.circle ? 'user' : 'music', size: props.large ? 16 : 14 }),
    );
  }
  return createElement('img', {
    className,
    src: props.src,
    alt: '',
    draggable: false,
  });
}
