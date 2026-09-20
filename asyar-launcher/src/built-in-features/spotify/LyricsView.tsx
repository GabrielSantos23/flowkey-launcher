import React, { useEffect, useState } from 'react';
import { EmptyState, Spinner } from '../../components';
import { cleanupSongTitle } from './helpers/cleanupSongTitle';
import { artistNames } from './helpers/format';
import * as api from './spotifyApi';
import SetupCard from './SetupCard';
import { token } from './token';
import { useSpotifySetup } from './useSpotifySetup';

export default function LyricsView() {
  const setup = useSpotifySetup();
  const [lyrics, setLyrics] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!setup.ready) return;
    void (async () => {
      try {
        const state = await api.getPlaybackState(await token());
        const track = state?.item;
        if (!track) {
          setLyrics(null);
          return;
        }
        setLyrics(
          await api.fetchLyrics({
            track: cleanupSongTitle(track.name),
            artist: artistNames(track.artists),
            album: track.album?.name,
            durationMs: track.duration_ms,
          }),
        );
      } catch {
        setLyrics(null);
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
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-[var(--space-4)]">
        {lyrics === undefined ? (
          <Spinner />
        ) : lyrics === null ? (
          <EmptyState compact message="No lyrics found for this track" />
        ) : (
          <div className="text-body whitespace-pre-wrap leading-relaxed">{lyrics}</div>
        )}
      </div>
      <div className="px-[var(--space-3)] py-[var(--space-2)] text-caption text-[var(--text-tertiary)] shrink-0">
        Lyrics from lrclib.net
      </div>
    </div>
  );
}
