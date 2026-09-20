import React from 'react';
import { Button, EmptyState } from '../../components';

export interface SetupCardProps {
  hasClientId: boolean;
  authorizeError: string | null;
  authorizing: boolean;
  onAuthorize: () => void;
}

/** Shown by every Spotify view until the Client ID is set and authorized. */
export default function SetupCard({
  hasClientId,
  authorizeError,
  authorizing,
  onAuthorize,
}: SetupCardProps) {
  if (!hasClientId) {
    return (
      <EmptyState
        message="Connect your Spotify account"
        description={
          'Create a free app at developer.spotify.com/dashboard (enable the Web API), add the redirect URIs asyar://oauth/callback and asyar-dev://oauth/callback, then paste the Client ID in Settings → Extensions → Spotify.'
        }
      />
    );
  }

  return (
    <EmptyState
      message="Connect your Spotify account"
      description="Sign in to allow Flowkey to see your playback and control your devices."
    >
      <Button variant="primary" disabled={authorizing} onClick={onAuthorize}>
        {authorizing ? 'Opening Spotify…' : 'Connect Spotify'}
      </Button>
      {authorizeError ? (
        <p className="text-xs text-[var(--accent-danger)] m-0">{authorizeError}</p>
      ) : null}
    </EmptyState>
  );
}
