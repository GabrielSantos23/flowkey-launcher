import React, { useEffect, useState } from 'react';
import { EmptyState, Icon, ListItem, Spinner } from '../../components';
import { logService } from '../../services/log/logService';
import * as api from './spotifyApi';
import SetupCard from './SetupCard';
import { token } from './token';
import { useSpotifySetup } from './useSpotifySetup';

export default function LibraryView() {
  const setup = useSpotifySetup();
  const [playlists, setPlaylists] = useState<api.SpotifyPlaylist[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!setup.ready) return;
    void (async () => {
      setError(null);
      try {
        setPlaylists(await api.getMyPlaylists(await token()));
      } catch (err) {
        logService.error(`[Spotify] library load failed: ${err}`);
        setError(String(err));
        setPlaylists([]);
      }
    })();
  }, [setup.ready]);

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
      <div className="px-[var(--space-3)] py-[var(--space-2)] shrink-0">
        <span className="section-header">Your playlists</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-[var(--space-2)] pb-[var(--space-2)]">
        {playlists === null ? (
          <Spinner />
        ) : error ? (
          <EmptyState message="Could not load your library" description={error} />
        ) : playlists.length === 0 ? (
          <EmptyState compact message="No playlists yet" />
        ) : (
          playlists.map((playlist) => (
            <ListItem
              key={playlist.id}
              leading={
                playlist.images?.[0]?.url ? (
                  <img
                    src={playlist.images[0].url}
                    alt=""
                    className="w-[var(--size-lg)] h-[var(--size-lg)] rounded-[var(--radius-sm)] object-cover shrink-0"
                  />
                ) : (
                  <div className="w-[var(--size-lg)] h-[var(--size-lg)] rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--text-tertiary)] shrink-0">
                    <Icon name="bookmark" size={16} />
                  </div>
                )
              }
              title={playlist.name}
              subtitle={`${playlist.tracks?.total ?? 0} tracks${
                playlist.owner?.display_name ? ` · ${playlist.owner.display_name}` : ''
              }`}
              trailing={
                <button
                  type="button"
                  aria-label="Play playlist"
                  className="bg-transparent border-0 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  onClick={() => {
                    void (async () => {
                      await api.play(await token(), { contextUri: playlist.uri });
                    })();
                  }}
                >
                  <Icon name="power" size={16} />
                </button>
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
