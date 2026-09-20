import React, { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { emit } from '@tauri-apps/api/event';
import { Icon } from '../../../components/react/Icon';
import { Toggle } from '../../../components/react/Inputs';
import { KeyboardHint } from '../../../components/react/Badge';
import { EmptyState } from '../../../components/react/Feedback';
import SettingsCard from '../../../components/settings/SettingsCard';
import { settingsService } from '../../../services/settings/settingsService';
import {
  getDefaultAppScanPaths,
  listApplications,
  normalizeScanPath,
  setFocusLock,
} from '../../../lib/ipc/commands';
import { logService } from '../../../services/log/logService';

import ShortcutCapture from '../../../built-in-features/shortcuts/ShortcutCapture';
import {
  shortcutStore,
  type ItemShortcut,
} from '../../../built-in-features/shortcuts/shortcutStore';
import { shortcutService } from '../../../built-in-features/shortcuts/shortcutService';
import { toDisplayString } from '../../../built-in-features/shortcuts/shortcutFormatter';
import { aliasStore } from '../../../built-in-features/aliases/aliasStore';
import { aliasService } from '../../../built-in-features/aliases/aliasService';
import AliasCapture from '../../../built-in-features/aliases/AliasCapture';
import type { Application } from '../../../bindings';

type IndexedApp = Application & { id: string };

function withIds(list: Application[]): IndexedApp[] {
  return list.filter((a): a is IndexedApp => typeof a.id === 'string' && a.id.length > 0);
}

export default function ApplicationsTab() {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const [apps, setApps] = useState<IndexedApp[]>([]);
  const [defaultPaths, setDefaultPaths] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingApp, setEditingApp] = useState<IndexedApp | null>(null);
  const [editingAliasApp, setEditingAliasApp] = useState<IndexedApp | null>(null);
  const [appFilterQuery, setAppFilterQuery] = useState('');

  const userPaths = settingsService.currentSettings.search.additionalScanPaths ?? [];
  const enabledMap = settingsService.currentSettings.search.applicationEnabled ?? {};
  const defaultSet = new Set(defaultPaths);

  const shortcutsByObjectId = new Map<string, ItemShortcut>(
    shortcutStore.shortcuts.map((s) => [s.objectId, s]),
  );

  const pathRows = [
    ...defaultPaths.map((path) => ({ path, readonly: true })),
    ...userPaths.map((path) => ({ path, readonly: false })),
  ];

  const sortedApps = [...apps].sort((a, b) => a.name.localeCompare(b.name));
  const filteredApps = appFilterQuery.trim()
    ? sortedApps.filter((a) => a.name.toLowerCase().includes(appFilterQuery.trim().toLowerCase()))
    : sortedApps;

  useEffect(() => {
    Promise.all([getDefaultAppScanPaths(), listApplications(userPaths)])
      .then(([paths, loaded]) => {
        setDefaultPaths(paths ?? []);
        setApps(withIds(loaded ?? []));
        void aliasStore.refresh().catch((e) => {
          logService.warn(`Failed to refresh alias store: ${e}`);
        });
      })
      .catch((err) => {
        logService.warn(`Failed to load applications: ${err}`);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const reloadApps = async () => {
    try {
      const loaded = await listApplications(userPaths);
      setApps(withIds(loaded ?? []));
    } catch (err) {
      logService.warn(`Failed to reload applications: ${err}`);
    }
  };

  const persistPaths = async (paths: string[]) => {
    const ok = await settingsService.updateSettings('search', {
      additionalScanPaths: paths,
    });
    if (!ok) {
      setErrorMessage('Failed to save directory list');
      return;
    }
    setErrorMessage(null);
    await emit('asyar:app-scan-paths-changed', { additionalScanPaths: paths });
    await reloadApps();
    rerender();
  };

  const handleAddDirectory = async () => {
    if (isBrowsing) return;
    setIsBrowsing(true);
    setErrorMessage(null);
    try {
      await setFocusLock(true);
      const picked = await open({
        directory: true,
        multiple: false,
        title: 'Add Application Directory',
      });
      if (!picked || typeof picked !== 'string') return;

      const normalized = await normalizeScanPath(picked);
      if (!normalized) return;

      if (defaultSet.has(normalized)) {
        setErrorMessage(`${normalized} is already scanned by default`);
        return;
      }
      if (userPaths.includes(normalized)) {
        setErrorMessage(`${normalized} is already in the list`);
        return;
      }

      await persistPaths([...userPaths, normalized]);
    } catch (err) {
      logService.warn(`Directory picker failed: ${err}`);
      setErrorMessage('Could not open directory picker');
    } finally {
      await setFocusLock(false);
      setIsBrowsing(false);
    }
  };

  const handleRemoveDirectory = async (path: string) => {
    await persistPaths(userPaths.filter((p) => p !== path));
  };

  const isEnabled = (appId: string): boolean => {
    return enabledMap[appId] !== false;
  };

  const handleToggleEnabled = async (app: IndexedApp) => {
    const next = { ...enabledMap, [app.id]: !isEnabled(app.id) };
    await settingsService.updateSettings('search', { applicationEnabled: next });
    rerender();
  };

  const handleShortcutSave = async (detail: {
    modifier: string;
    key: string;
  }): Promise<string | true> => {
    if (!editingApp) return 'No application selected';
    const shortcut = `${detail.modifier}+${detail.key}`;
    const result = await shortcutService.register(
      editingApp.id,
      editingApp.name,
      'application',
      shortcut,
      editingApp.path,
      editingApp.icon ?? undefined,
    );
    if (!result.ok) {
      const reason = result.conflict?.itemName ?? 'Unsupported key or OS error';
      return `Could not assign: ${reason}`;
    }
    rerender();
    return true;
  };

  const handleRemoveShortcut = async (app: IndexedApp) => {
    await shortcutService.unregister(app.id);
    rerender();
  };

  const handleRemoveAlias = async (app: IndexedApp) => {
    const alias = aliasStore.byObjectId.get(app.id);
    if (!alias) return;
    try {
      await aliasService.unregister(alias);
      aliasStore.removeOptimistic(alias);
      rerender();
    } catch (e) {
      logService.warn(`Failed to remove alias for ${app.name}: ${e}`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Search scope'}
      </div>
      <div id="applications-scope">
        <SettingsCard>
          <ul className="path-list list-none p-0 m-0 flex flex-col">
            {pathRows.map((row) => (
              <li
                key={row.path}
                className="path-row flex items-center gap-3 p-4 border-b border-[var(--border-color)] last:border-b-0"
              >
                <Icon name="layers" size={14} className="text-[var(--text-tertiary)] shrink-0" />
                <span
                  className="path-text flex-1 min-w-0 text-sm text-[var(--text-primary)] font-mono truncate"
                  title={row.path}
                >
                  {row.path}
                </span>
                {row.readonly ? (
                  <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                    {'Default'}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="p-1 text-[var(--accent-danger)] bg-transparent border-0 cursor-pointer hover:opacity-80"
                    aria-label={`Remove ${row.path}`}
                    onClick={() => void handleRemoveDirectory(row.path)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </li>
            ))}
            <li className="p-0">
              <button
                type="button"
                className="w-full flex items-center gap-2 p-4 bg-transparent border-0 text-[var(--accent-primary)] text-sm font-semibold cursor-pointer hover:bg-[var(--bg-hover)] disabled:opacity-60"
                onClick={() => void handleAddDirectory()}
                disabled={isBrowsing}
              >
                <Icon name="plus" size={14} />
                {isBrowsing ? 'Opening…' : 'Add directory…'}
              </button>
            </li>
          </ul>
        </SettingsCard>
        {errorMessage ? (
          <div
            className="mt-3 p-2 bg-[color-mix(in_srgb,var(--accent-danger)_10%,transparent)] rounded-[var(--radius-sm)] text-xs text-[var(--accent-danger)]"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}
      </div>

      <div className="applications-header-row flex items-center justify-between mt-4 mb-2">
        <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          {'Applications'}
        </div>
        <div className="filter-box flex items-center gap-2 max-w-[200px] px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--bg-secondary)] border border-[var(--border-color)]">
          <Icon
            name="search"
            size={13}
            strokeWidth={2}
            className="text-[var(--text-tertiary)] shrink-0"
          />
          <input
            type="text"
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
            placeholder={'Filter apps'}
            aria-label={'Filter applications'}
            value={appFilterQuery}
            onChange={(e) => setAppFilterQuery(e.target.value)}
          />
        </div>
      </div>

      <div id="applications-list">
        {isLoading ? (
          <div className="p-4 text-center text-[var(--text-tertiary)] text-sm">{'Loading...'}</div>
        ) : filteredApps.length === 0 ? (
          appFilterQuery.trim() ? (
            <EmptyState
              message={'No applications match your filter'}
              description={'Try a different search term.'}
            />
          ) : (
            <EmptyState
              message={'No applications found'}
              description={'Add a directory above to scan for apps.'}
            />
          )
        ) : (
          <SettingsCard>
            <div className="app-table flex flex-col" role="table">
              <div
                className="app-table-head grid grid-cols-[1fr_150px_130px_56px] items-center gap-6 px-6 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[10px] font-bold tracking-wider uppercase text-[var(--text-tertiary)]"
                role="row"
              >
                <span role="columnheader">{'Name'}</span>
                <span role="columnheader">{'Alias'}</span>
                <span role="columnheader">{'Hotkey'}</span>
                <span className="text-right" role="columnheader">
                  {'Enabled'}
                </span>
              </div>

              {filteredApps.map((app) => {
                const shortcut = shortcutsByObjectId.get(app.id);
                return (
                  <div
                    key={app.id}
                    className="app-row grid grid-cols-[1fr_150px_130px_56px] items-center gap-6 px-6 py-3 border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--bg-hover)] transition-colors"
                    role="row"
                  >
                    <div className="flex items-center gap-3 min-w-0" role="cell">
                      {app.icon ? (
                        <img
                          className="w-[22px] h-[22px] rounded-[var(--radius-sm)] shrink-0 object-contain"
                          src={app.icon}
                          alt=""
                        />
                      ) : (
                        <span
                          className="inline-flex items-center justify-center w-[22px] h-[22px] text-sm"
                          aria-hidden="true"
                        >
                          💻
                        </span>
                      )}
                      <span
                        className="text-sm text-[var(--text-primary)] truncate"
                        title={app.path}
                      >
                        {app.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2" role="cell">
                      {aliasStore.byObjectId.has(app.id) ? (
                        <>
                          <button
                            type="button"
                            className="bg-transparent border-0 p-0 cursor-pointer"
                            onClick={() => setEditingAliasApp(app)}
                            title="Change alias"
                          >
                            <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-2 rounded-[var(--radius-xs)] bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-primary)] text-[10px] font-mono font-medium leading-none select-none">
                              {aliasStore.byObjectId.get(app.id)}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="bg-transparent border-0 px-1 py-0.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--accent-danger)] cursor-pointer rounded-[var(--radius-xs)]"
                            aria-label={`Remove alias for ${app.name}`}
                            onClick={() => void handleRemoveAlias(app)}
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="bg-transparent border-0 p-0 text-xs font-mono text-[var(--text-tertiary)] hover:text-[var(--accent-primary)] cursor-pointer"
                          onClick={() => setEditingAliasApp(app)}
                        >
                          {'Add Alias'}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2" role="cell">
                      {shortcut ? (
                        <>
                          <button
                            type="button"
                            className="bg-transparent border-0 p-0 cursor-pointer"
                            onClick={() => setEditingApp(app)}
                            title="Reassign hotkey"
                          >
                            <KeyboardHint keys={toDisplayString(shortcut.shortcut)} />
                          </button>
                          <button
                            type="button"
                            className="bg-transparent border-0 px-1 py-0.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--accent-danger)] cursor-pointer rounded-[var(--radius-xs)]"
                            aria-label={`Remove hotkey for ${app.name}`}
                            onClick={() => void handleRemoveShortcut(app)}
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="bg-transparent border-0 p-0 text-xs font-mono text-[var(--text-tertiary)] hover:text-[var(--accent-primary)] cursor-pointer"
                          onClick={() => setEditingApp(app)}
                        >
                          {'Record'}
                        </button>
                      )}
                    </div>

                    <div className="flex justify-end" role="cell">
                      <Toggle
                        checked={isEnabled(app.id)}
                        onChange={() => void handleToggleEnabled(app)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </SettingsCard>
        )}
      </div>

      {editingApp ? (
        <ShortcutCapture
          onsave={handleShortcutSave}
          oncancel={() => setEditingApp(null)}
          ondone={() => setEditingApp(null)}
          excludeObjectId={editingApp.id}
        />
      ) : null}

      {editingAliasApp ? (
        <AliasCapture
          objectId={editingAliasApp.id}
          itemName={editingAliasApp.name}
          itemType="application"
          currentAlias={aliasStore.byObjectId.get(editingAliasApp.id)}
          onsave={() => {
            setEditingAliasApp(null);
            rerender();
          }}
          oncancel={() => setEditingAliasApp(null)}
        />
      ) : null}
    </div>
  );
}
