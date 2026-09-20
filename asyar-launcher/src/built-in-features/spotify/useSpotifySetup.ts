import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { spotifyAuth } from './spotifyAuth';

export interface SpotifySetup {
  hasClientId: boolean;
  /** A usable access token is on hand (hydrated, or refreshed just now). */
  connected: boolean;
  /** True once the first recheck finished — avoids a setup-card flash while hydrating. */
  checked: boolean;
  ready: boolean;
  authorize: () => Promise<void>;
  authorizeError: string | null;
  authorizing: boolean;
}

/**
 * Shared gate for every Spotify view: reads the Client ID preference state
 * and the auth token, and exposes the authorize action. Views show a setup
 * card until `ready` is true.
 */
export function useSpotifySetup(): SpotifySetup {
  const [hasClientId, setHasClientId] = useState(spotifyAuth.hasClientId());
  const [connected, setConnected] = useState(false);
  const [checked, setChecked] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [authorizeError, setAuthorizeError] = useState<string | null>(null);

  const recheck = useCallback(async () => {
    // The Client ID can be saved while this view is open — re-read it live.
    await spotifyAuth.refreshClientId();
    setHasClientId(spotifyAuth.hasClientId());
    const token = await spotifyAuth.getValidToken();
    setConnected(!!token);
    setChecked(true);
  }, []);

  useEffect(() => {
    void recheck();
    let unlisten: (() => void) | undefined;
    listen<string>('asyar:deep-link', () => {
      // Cold-start deep links land here too — re-check the token.
      void recheck();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [recheck]);

  const authorize = useCallback(async () => {
    setAuthorizing(true);
    setAuthorizeError(null);
    try {
      await spotifyAuth.authorize();
      await recheck();
    } catch (err) {
      setAuthorizeError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthorizing(false);
    }
  }, [recheck]);

  return {
    hasClientId,
    connected,
    checked,
    ready: checked && hasClientId && connected,
    authorize,
    authorizeError,
    authorizing,
  };
}
