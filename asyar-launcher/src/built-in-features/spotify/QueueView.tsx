import React, { useEffect, useState } from 'react';
import { EmptyState, ListItem, Spinner } from '../../components';
import { logService } from '../../services/log/logService';
import { artistNames, formatDuration } from './helpers/format';
import * as api from './spotifyApi';
import SetupCard from './SetupCard';
import { token } from './token';
import { useSpotifySetup } from './useSpotifySetup';

export default function QueueView() {
  const setup = useSpotifySetup();
  const [queue, setQueue] = useState<api.SpotifyTrack[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!setup.ready) return;
    void (async () => {
      setError(null);
      try {
        setQueue((await api.getQueue(await token())).queue);
      } catch (err) {
        logService.error(`[Spotify] queue load failed: ${err}`);
        setError(String(err));
        setQueue([]);
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
        <span className="section-header">Up next</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-[var(--space-2)] pb-[var(--space-2)]">
        {queue === null ? (
          <Spinner />
        ) : error ? (
          <EmptyState message="Could not load the queue" description={error} />
        ) : queue.length === 0 ? (
          <EmptyState compact message="The queue is empty" />
        ) : (
          queue.map((track, index) => (
            <ListItem
              key={`${track.id}-${index}`}
              title={track.name}
              subtitle={`${artistNames(track.artists)} · ${formatDuration(track.duration_ms)}`}
            />
          ))
        )}
      </div>
    </div>
  );
}
