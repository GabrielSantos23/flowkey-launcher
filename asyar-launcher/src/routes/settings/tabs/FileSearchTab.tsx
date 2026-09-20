import React, { useState, useEffect } from 'react';
import { Input } from '../../../components/react/Inputs';
import { Button } from '../../../components/react/Buttons';
import { Icon } from '../../../components/react/Icon';
import { Toggle } from '../../../components/react/Inputs';
import { Badge } from '../../../components/react/Badge';
import SettingsCard from '../../../components/settings/SettingsCard';
import SettingsRow from '../../../components/settings/SettingsRow';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { settingsService } from '../../../services/settings/settingsService';
import { setFocusLock } from '../../../lib/ipc/commands';
import { fileIndexStatus, fileIndexRebuild } from '../../../lib/ipc/fileSearchCommands';
import { logService } from '../../../services/log/logService';
import type { IndexStatus } from '../../../bindings';
import { canAddRoot, canAddExcludePattern } from './fileSearchTab.helpers';

const STATE_LABELS: Record<string, string> = {
  disabled: 'Disabled',
  building: 'Building…',
  ready: 'Ready',
  rescanning: 'Rescanning…',
  'cap-reached': 'Index cap reached',
};

export default function FileSearchTab() {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const roots = settingsService.currentSettings.fileSearch?.includeRoots ?? [];
  const excludePatterns = settingsService.currentSettings.fileSearch?.excludePatterns ?? [];
  const enabled = settingsService.currentSettings.fileSearch?.enabled ?? true;

  const [isBrowsing, setIsBrowsing] = useState(false);
  const [newExcludePattern, setNewExcludePattern] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  const refreshStatus = async () => {
    const s = await fileIndexStatus();
    setStatus(s);
  };

  useEffect(() => {
    void refreshStatus();
    let unlisten: UnlistenFn | undefined;
    listen<IndexStatus>('asyar:file-index-status', (e) => {
      setStatus(e.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const persistFileSearch = async (
    patch: Partial<{
      enabled: boolean;
      includeRoots: string[];
      excludePatterns: string[];
      indexHidden: boolean;
    }>,
  ) => {
    const ok = await settingsService.updateSettings('fileSearch', patch);
    if (!ok) {
      setErrorMessage('Failed to save file search settings');
      return;
    }
    setErrorMessage(null);
    rerender();
  };

  const handleToggleEnabled = async () => {
    await persistFileSearch({ enabled: !enabled });
  };

  const handleAddRoot = async () => {
    if (isBrowsing) return;
    setIsBrowsing(true);
    setErrorMessage(null);
    try {
      await setFocusLock(true);
      const picked = await open({
        directory: true,
        multiple: false,
        title: 'Add Search Root',
      });
      if (!picked || typeof picked !== 'string') return;
      if (!canAddRoot(picked, roots)) {
        setErrorMessage(`${picked} is already in the list`);
        return;
      }
      await persistFileSearch({ includeRoots: [...roots, picked] });
    } catch (err) {
      logService.warn(`Directory picker failed: ${err}`);
      setErrorMessage('Could not open directory picker');
    } finally {
      await setFocusLock(false);
      setIsBrowsing(false);
    }
  };

  const handleRemoveRoot = async (path: string) => {
    await persistFileSearch({ includeRoots: roots.filter((p) => p !== path) });
  };

  const handleAddExcludePattern = async () => {
    const pattern = newExcludePattern.trim();
    if (!canAddExcludePattern(pattern, excludePatterns)) {
      setErrorMessage(pattern ? `"${pattern}" is already excluded` : null);
      return;
    }
    setErrorMessage(null);
    await persistFileSearch({ excludePatterns: [...excludePatterns, pattern] });
    setNewExcludePattern('');
  };

  const handleRemoveExcludePattern = async (pattern: string) => {
    await persistFileSearch({ excludePatterns: excludePatterns.filter((p) => p !== pattern) });
  };

  const isRebuilding = rebuilding || status?.state === 'rescanning';

  const handleRebuild = async () => {
    if (isRebuilding) return;
    setRebuilding(true);
    try {
      await fileIndexRebuild();
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Status'}
      </div>
      <div id="file-search-status">
        <SettingsCard>
          <SettingsRow
            label={'File search'}
            description={
              'Indexing runs in the background and excludes caches, dependency folders, and system directories by default.'
            }
          >
            <Toggle checked={enabled} onChange={() => void handleToggleEnabled()} />
          </SettingsRow>
        </SettingsCard>

        {status ? (
          <div className="flex items-center gap-3 mt-3 px-6 py-4 border border-[var(--border-color)] rounded-[var(--radius-lg)] bg-[var(--bg-secondary)] flex-wrap">
            <Badge text={STATE_LABELS[status.state] ?? status.state} variant="default" />
            <span className="text-xs text-[var(--text-secondary)]">
              {status.entryCount.toLocaleString()} files indexed
            </span>
            {status.lastScanMs > 0 ? (
              <span className="text-xs text-[var(--text-secondary)] opacity-70">
                last scan {status.lastScanMs}ms
              </span>
            ) : null}
            {status.snapshotLoaded ? (
              <span className="text-xs text-[var(--text-secondary)] opacity-70">
                {'restored from snapshot'}
              </span>
            ) : null}
            <Button onClick={() => void handleRebuild()} disabled={isRebuilding}>
              {isRebuilding ? 'Rebuilding…' : 'Rebuild Index'}
            </Button>
          </div>
        ) : null}
        {status?.capReached ? (
          <div
            className="mt-3 p-3 bg-[color-mix(in_srgb,var(--accent-warning)_10%,transparent)] rounded-[var(--radius-sm)] text-xs text-[var(--text-primary)]"
            role="alert"
          >
            {
              'The index hit its size cap — some files may not be searchable. Add exclude patterns to narrow the scan, or reduce your search roots.'
            }
          </div>
        ) : null}
      </div>

      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Search roots'}
      </div>
      <div id="file-search-roots">
        <p className="m-0 mb-3 text-xs text-[var(--text-secondary)] leading-relaxed">
          {'Empty ⇒ your entire home folder. Add specific directories to narrow the scope.'}
        </p>

        <div className="mb-3 self-start">
          <Button onClick={() => void handleAddRoot()} disabled={isBrowsing}>
            <span className="inline-flex items-center gap-2">
              <Icon name="plus" size={14} />
              {isBrowsing ? 'Opening…' : 'Add Root'}
            </span>
          </Button>
        </div>

        {errorMessage ? (
          <div
            className="mb-3 p-2 bg-[color-mix(in_srgb,var(--accent-danger)_10%,transparent)] rounded-[var(--radius-sm)] text-xs text-[var(--accent-danger)]"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}

        {roots.length > 0 ? (
          <SettingsCard>
            <ul className="list-none p-0 m-0 flex flex-col">
              {roots.map((path) => (
                <li
                  key={path}
                  className="flex items-center gap-3 p-4 border-b border-[var(--border-color)] last:border-b-0"
                >
                  <Icon name="folder" size={14} className="text-[var(--text-tertiary)] shrink-0" />
                  <span
                    className="flex-1 min-w-0 text-sm text-[var(--text-primary)] truncate"
                    title={path}
                  >
                    {path}
                  </span>
                  <button
                    type="button"
                    className="p-1 text-[var(--accent-danger)] bg-transparent border-0 cursor-pointer hover:opacity-80"
                    aria-label={`Remove ${path}`}
                    onClick={() => void handleRemoveRoot(path)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </SettingsCard>
        ) : null}
      </div>

      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Exclude patterns'}
      </div>
      <div id="file-search-excludes">
        <p className="m-0 mb-3 text-xs text-[var(--text-secondary)] leading-relaxed">
          {'Glob patterns to skip during indexing.'}
        </p>

        <div className="flex gap-2 mb-3">
          <Input
            value={newExcludePattern}
            onChange={(e) => setNewExcludePattern(e.target.value)}
            placeholder="e.g. *.tmp"
            onKeyDown={(e) => e.key === 'Enter' && void handleAddExcludePattern()}
          />
          <Button onClick={() => void handleAddExcludePattern()}>{'Add'}</Button>
        </div>

        {excludePatterns.length > 0 ? (
          <SettingsCard>
            <ul className="list-none p-0 m-0 flex flex-col">
              {excludePatterns.map((pattern) => (
                <li
                  key={pattern}
                  className="flex items-center gap-3 p-4 border-b border-[var(--border-color)] last:border-b-0"
                >
                  <Icon name="filter" size={14} className="text-[var(--text-tertiary)] shrink-0" />
                  <span
                    className="flex-1 min-w-0 text-sm font-mono text-[var(--text-primary)] truncate"
                    title={pattern}
                  >
                    {pattern}
                  </span>
                  <button
                    type="button"
                    className="p-1 text-[var(--accent-danger)] bg-transparent border-0 cursor-pointer hover:opacity-80"
                    aria-label={`Remove ${pattern}`}
                    onClick={() => void handleRemoveExcludePattern(pattern)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </SettingsCard>
        ) : null}
      </div>
    </div>
  );
}
