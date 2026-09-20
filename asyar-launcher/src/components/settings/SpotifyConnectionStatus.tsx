import React, { useCallback, useEffect, useState } from 'react';
import { Badge } from '../react/Badge';
import { oauthGetStoredToken } from '../../lib/ipc/commands';
import { extensionPreferencesService } from '../../services/extension/extensionPreferencesService';

/**
 * Connection indicator for the built-in Spotify feature, shown in
 * Settings → Extensions → Spotify. Reads the OAuth token and the Client ID
 * preference directly (the settings window is its own webview and does not
 * share state with the launcher's in-memory auth service).
 */
export default function SpotifyConnectionStatus({ extensionId }: { extensionId: string }) {
  const [state, setState] = useState<'loading' | 'connected' | 'not-connected' | 'no-client-id'>(
    'loading',
  );

  const recheck = useCallback(async () => {
    const clientIdPref = await extensionPreferencesService.getEffectivePreferences(extensionId);
    const clientId = (clientIdPref.extension as Record<string, unknown> | undefined)?.clientId;
    if (typeof clientId !== 'string' || !clientId.trim()) {
      setState('no-client-id');
      return;
    }
    const token = await oauthGetStoredToken(extensionId, extensionId);
    setState(token ? 'connected' : 'not-connected');
  }, [extensionId]);

  useEffect(() => {
    void recheck();
    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) =>
      listen('asyar:consent-changed', () => void recheck()).then((fn) => {
        unlisten = fn;
      }),
    );
    return () => unlisten?.();
  }, [recheck]);

  if (extensionId !== 'spotify') return null;

  const badge =
    state === 'loading' ? (
      <Badge text="Checking…" variant="default" />
    ) : state === 'connected' ? (
      <Badge text="Connected" variant="success" />
    ) : state === 'no-client-id' ? (
      <Badge text="Client ID missing" variant="warning" />
    ) : (
      <Badge text="Not connected" variant="warning" />
    );

  return (
    <div className="panel-section flex flex-col gap-1">
      <div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
        Spotify account
      </div>
      <div className="flex items-center gap-2">
        {badge}
        <span className="text-xs text-[var(--text-secondary)]">
          {state === 'connected'
            ? 'Authorized — playback control requires Spotify Premium.'
            : state === 'no-client-id'
              ? 'Paste your Spotify app Client ID in Preferences below.'
              : 'Open “Spotify: Now Playing” in the launcher and click Connect Spotify.'}
        </span>
      </div>
    </div>
  );
}
