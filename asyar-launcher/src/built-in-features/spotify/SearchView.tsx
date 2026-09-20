import React, { useEffect, useRef, useState } from 'react';
import { EmptyState, Icon, Input, ListItem, Spinner } from '../../components';
import { logService } from '../../services/log/logService';
import { artistNames } from './helpers/format';
import * as api from './spotifyApi';
import { token } from './token';
import SetupCard from './SetupCard';
import { useSpotifySetup } from './useSpotifySetup';

const DEBOUNCE_MS = 350;

type SearchType = 'track' | 'artist' | 'album' | 'playlist';

const TYPES: { id: SearchType; label: string }[] = [
  { id: 'track', label: 'Songs' },
  { id: 'artist', label: 'Artists' },
  { id: 'album', label: 'Albums' },
  { id: 'playlist', label: 'Playlists' },
];

export default function SearchView() {
  const setup = useSpotifySetup();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<SearchType>('track');
  const [results, setResults] = useState<api.SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setSearchError(null);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const accessToken = await token();
          const results = await api.search(accessToken, query.trim(), [type]);
          setResults(results);
        } catch (err) {
          logService.error(`[Spotify] search failed: ${err}`);
          setSearchError(String(err));
          setResults(null);
        } finally {
          setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, type]);

  const items =
    results?.[
      type === 'track'
        ? 'tracks'
        : type === 'artist'
          ? 'artists'
          : type === 'album'
            ? 'albums'
            : 'playlists'
    ]?.items ?? [];

  if (!setup.checked) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!setup.ready) {
    return (
      <SetupCard
        hasClientId={setup.hasClientId}
        authorizeError={setup.authorizeError}
        authorizing={setup.authorizing}
        onAuthorize={() => void setup.authorize()}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-[var(--space-3)] py-[var(--space-2)] flex items-center gap-[var(--space-2)] shrink-0">
        {TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`text-xs px-2 py-1 rounded-[var(--radius-sm)] border-0 cursor-pointer ${
              type === t.id
                ? 'bg-[var(--bg-selected)] text-[var(--text-primary)]'
                : 'bg-transparent text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]'
            }`}
            onClick={() => setType(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="px-[var(--space-3)] pb-[var(--space-2)] shrink-0">
        <Input
          value={query}
          placeholder={`Search ${type}s on Spotify…`}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-[var(--space-2)] pb-[var(--space-2)]">
        {loading ? (
          <Spinner />
        ) : searchError ? (
          <EmptyState message="Search failed" description={searchError} />
        ) : !query.trim() ? (
          <EmptyState compact message="Type to search Spotify" />
        ) : items.length === 0 ? (
          <EmptyState compact message={`Nothing matched "${query}"`} />
        ) : (
          items.map((item: any, index: number) => (
            <ListItem
              key={item.id ?? index}
              leading={
                item.images?.[0]?.url || item.album?.images?.[0]?.url ? (
                  <img
                    src={item.album?.images?.[0]?.url ?? item.images?.[0]?.url}
                    alt=""
                    className="w-[var(--size-lg)] h-[var(--size-lg)] rounded-[var(--radius-sm)] object-cover shrink-0"
                  />
                ) : undefined
              }
              title={item.name}
              subtitle={
                item.artists
                  ? artistNames(item.artists)
                  : item.owner?.display_name
                    ? `by ${item.owner.display_name}`
                    : undefined
              }
              trailing={
                item.uri ? (
                  <button
                    type="button"
                    aria-label="Play"
                    className="bg-transparent border-0 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    onClick={() => {
                      void (async () => {
                        const t = await token();
                        await api.play(t, {
                          contextUri: type !== 'track' ? item.uri : undefined,
                          uris: type === 'track' ? [item.uri] : undefined,
                        });
                      })();
                    }}
                  >
                    <Icon name="power" size={16} />
                  </button>
                ) : null
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
