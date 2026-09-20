import React, { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Badge, Button, EmptyState, Icon, ListItem, Spinner } from '../../components';
import type { ExtensionRecord } from '../../types/ExtensionRecord';
import * as commands from '../../lib/ipc/commands';
import { extensionsManager } from './index';
import { logService } from '../../services/log/logService';

/**
 * Local extensions manager: installs come from the user's own downloads —
 * `.asyar` packages or unpacked folders — never from a remote marketplace.
 */
export default function DefaultView() {
  const [installed, setInstalled] = useState<ExtensionRecord[] | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const records = await commands.discoverExtensions();
    setInstalled((records ?? []).filter((r) => !r.isBuiltIn));
  }, []);

  useEffect(() => {
    void refresh();
    let unlisten: (() => void) | undefined;
    listen('extensions_updated', () => void refresh()).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [refresh]);

  const runInstall = async (kind: 'file' | 'folder') => {
    setBusy(true);
    try {
      if (kind === 'file') {
        await extensionsManager.installFromFile();
      } else {
        await extensionsManager.installFromFolder();
      }
      await refresh();
    } catch (err) {
      logService.error(`[ExtensionsManager] install failed: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-[var(--space-3)] px-[var(--space-3)] py-[var(--space-2)] shrink-0">
        <Button variant="primary" size="sm" disabled={busy} onClick={() => void runInstall('file')}>
          Install from file…
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void runInstall('folder')}>
          Install from folder…
        </Button>
        {busy ? <Spinner size="inline" /> : null}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-[var(--space-2)] pb-[var(--space-2)]">
        {installed === null ? (
          <EmptyState message="Loading…" compact />
        ) : installed.length === 0 ? (
          <EmptyState
            compact
            bordered
            message="No extensions installed yet"
            description="Download an extension (.asyar package or folder) and install it here."
          />
        ) : (
          installed.map((record) => <InstalledRow key={record.manifest.id} record={record} />)
        )}
      </div>
    </div>
  );
}

function InstalledRow({ record }: { record: ExtensionRecord }) {
  const { manifest, enabled } = record;
  const isDisabled = !enabled;
  return (
    <ListItem
      leading={
        <div className="w-[var(--size-lg)] h-[var(--size-lg)] rounded-[var(--radius-sm)] flex items-center justify-center bg-[var(--bg-tertiary)] text-[var(--text-secondary)] shrink-0">
          <Icon name="puzzle" size={16} aria-hidden="true" />
        </div>
      }
      title={manifest.name}
      subtitle={
        <span className="flex items-center gap-[var(--space-2)] min-w-0">
          <span className="text-mono text-[var(--text-tertiary)]">v{manifest.version}</span>
          <span className="text-[var(--text-tertiary)] truncate">{manifest.id}</span>
        </span>
      }
      trailing={
        <Badge
          text={isDisabled ? 'Disabled' : 'Enabled'}
          variant={isDisabled ? 'default' : 'success'}
        />
      }
    />
  );
}
