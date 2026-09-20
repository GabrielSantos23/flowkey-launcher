import React, { useEffect, useState } from 'react';
import { Badge, EmptyState, ListItem, Spinner } from '../../components';
import * as api from './spotifyApi';
import SetupCard from './SetupCard';
import { token } from './token';
import { useSpotifySetup } from './useSpotifySetup';

export default function DevicesView() {
  const setup = useSpotifySetup();
  const [devices, setDevices] = useState<api.SpotifyDevice[] | null>(null);
  const [transferringTo, setTransferringTo] = useState<string | null>(null);

  useEffect(() => {
    if (!setup.ready) return;
    void (async () => {
      try {
        setDevices((await api.getDevices(await token())).devices);
      } catch {
        setDevices([]);
      }
    })();
  }, [setup.ready]);

  const transfer = async (deviceId: string) => {
    setTransferringTo(deviceId);
    try {
      await api.transferPlayback(await token(), deviceId, true);
      setDevices((await api.getDevices(await token())).devices);
    } finally {
      setTransferringTo(null);
    }
  };

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
        <span className="section-header">Devices</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-[var(--space-2)] pb-[var(--space-2)]">
        {devices === null ? (
          <Spinner />
        ) : devices.length === 0 ? (
          <EmptyState compact message="No Spotify devices found — open Spotify on a device first" />
        ) : (
          devices.map((device) => (
            <ListItem
              key={device.id ?? device.name}
              title={device.name}
              subtitle={device.type}
              trailing={
                device.is_active ? (
                  <Badge text="Active" variant="success" />
                ) : (
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                    disabled={transferringTo !== null}
                    onClick={() => device.id && void transfer(device.id)}
                  >
                    {transferringTo === device.id ? 'Moving…' : 'Play here'}
                  </button>
                )
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
