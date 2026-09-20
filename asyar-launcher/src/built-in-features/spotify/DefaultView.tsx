import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState, Icon, IconButton, Spinner } from '../../components';
import extensionManager from '../../services/extension/extensionManager';
import { logService } from '../../services/log/logService';
import { artistNames, formatDuration } from './helpers/format';
import * as api from './spotifyApi';
import { spotifyAuth } from './spotifyAuth';
import { token } from './token';
import SetupCard from './SetupCard';
import { useSpotifySetup } from './useSpotifySetup';
import type { SpotifyPlaybackState } from './spotifyApi';

const POLL_MS = 5000;

export default function DefaultView() {
  const setup = useSpotifySetup();
  const [state, setState] = useState<SpotifyPlaybackState | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const accessToken = await spotifyAuth.getValidToken();
    if (!accessToken) return;
    try {
      const playback = await api.getPlaybackState(accessToken);
      if (!mounted.current) return;
      setState(playback);
    } catch (err) {
      logService.warn(`[Spotify] playback refresh failed: ${err}`);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!setup.ready) {
      setLoading(false);
      return;
    }
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, [setup.ready, refresh]);

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

  const track = state?.item ?? null;
  const detailRows: { label: string; value: string }[] = track
    ? [
        { label: 'Track', value: track.name },
        { label: 'Duration', value: formatDuration(track.duration_ms) },
        { label: 'Artists', value: artistNames(track.artists) },
        { label: 'Album', value: track.album.name },
      ]
    : [];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-[var(--space-3)] pt-[var(--space-2)] shrink-0">
        <IconButton onClick={() => extensionManager.goBack()} ariaLabel="Back">
          <span className="inline-flex" style={{ transform: 'rotate(180deg)' }}>
            <Icon name="refresh" size={16} />
          </span>
        </IconButton>
      </div>

      <div className="flex-1 min-h-0 flex gap-[var(--space-5)] p-[var(--space-5)] pt-[var(--space-2)]">
        {loading && !state ? (
          <div className="flex-1 flex items-center justify-center">
            <Spinner />
          </div>
        ) : !track ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState message="Nothing is playing on Spotify" />
          </div>
        ) : (
          <>
            <div className="flex-1 flex flex-col min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] m-0 truncate">
                {track.name}
              </h1>
              <p className="m-0 text-sm text-[var(--text-secondary)] truncate">
                by {artistNames(track.artists)}
              </p>
              <div className="flex-1 min-h-0 flex items-center justify-center py-[var(--space-3)]">
                {track.album.images[0]?.url ? (
                  <img
                    src={track.album.images[0].url}
                    alt=""
                    className="max-h-full max-w-full object-contain rounded-[var(--radius-md)] shadow-md"
                  />
                ) : null}
              </div>
            </div>

            <div className="w-[38%] max-w-[240px] shrink-0 border-l border-[var(--separator)] pl-[var(--space-4)] overflow-y-auto custom-scrollbar">
              {detailRows.map((row) => (
                <div key={row.label} className="mb-[var(--space-3)] min-w-0">
                  <div className="text-xs font-semibold text-[var(--text-tertiary)]">
                    {row.label}
                  </div>
                  <div className="text-sm text-[var(--text-primary)] truncate">{row.value}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
