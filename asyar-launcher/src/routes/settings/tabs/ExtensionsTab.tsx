import React, { useState, useEffect, useRef } from 'react';
import { Input } from '../../../components/react/Inputs';
import { SplitView } from '../../../components/react/Layout';
import { Toggle } from '../../../components/react/Inputs';
import { EmptyState, LoadingState } from '../../../components/react/Feedback';
import ExtensionDetailPanel from '../../../components/settings/ExtensionDetailPanel';
import { Icon } from '../../../components/react/Icon';
import type { SettingsHandler, ExtensionItem } from '../settingsHandlers';
import { extensionStateManager } from '../../../services/extension/extensionStateManager';
import {
  showOpenExtensionDialog,
  installExtensionFromFile,
  showOpenFolderDialog,
  inspectExtensionFolder,
  registerDevExtension,
} from '../../../lib/ipc/commands';
import { filterExtensions, type ExtensionFilter } from './extensionFilters';
import type { ExtensionCommand } from 'asyar-sdk/contracts';
import { aliasStore } from '../../../built-in-features/aliases/aliasStore';
import { aliasService } from '../../../built-in-features/aliases/aliasService';
import AliasCapture from '../../../built-in-features/aliases/AliasCapture';

import ShortcutCapture from '../../../built-in-features/shortcuts/ShortcutCapture';
import {
  shortcutStore,
  type ItemShortcut,
} from '../../../built-in-features/shortcuts/shortcutStore';
import { shortcutService } from '../../../built-in-features/shortcuts/shortcutService';
import { toDisplayString } from '../../../built-in-features/shortcuts/shortcutFormatter';
import { KeyboardHint } from '../../../components/react/Badge';
import { logService } from '../../../services/log/logService';
import { isBuiltInIcon, isIconImage, getBuiltInIconName } from '../../../lib/iconUtils';

type AliasEditTarget = {
  objectId: string;
  name: string;
  currentAlias?: string;
};

type ShortcutEditTarget = {
  objectId: string;
  name: string;
  icon?: string;
};

const FILTERS: { id: ExtensionFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'commands', label: 'Commands' },
  { id: 'extension', label: 'Extensions' },
  { id: 'theme', label: 'Theme' },
];

function commandObjectId(extensionId: string, cmdId: string): string {
  return `cmd_${extensionId}_${cmdId}`;
}

export interface ExtensionsTabProps {
  handler: SettingsHandler;
}

export default function ExtensionsTab({ handler }: ExtensionsTabProps) {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const [editingAliasTarget, setEditingAliasTarget] = useState<AliasEditTarget | null>(null);
  const [editingShortcutTarget, setEditingShortcutTarget] = useState<ShortcutEditTarget | null>(
    null,
  );

  const [isInstallingFromFile, setIsInstallingFromFile] = useState(false);
  const [installMessage, setInstallMessage] = useState('');
  const [installError, setInstallError] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ExtensionFilter>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedExtensionId, setSelectedExtensionId] = useState<string | null>(null);
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const plusBtnRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });

  const shortcutsByObjectId = new Map<string, ItemShortcut>(
    shortcutStore.shortcuts.map((s) => [s.objectId, s]),
  );

  useEffect(() => {
    void aliasStore.refresh().catch((e) => {
      logService.warn(`ExtensionsTab: failed to refresh alias store: ${e}`);
    });
  }, []);

  useEffect(() => {
    const pending = handler.pendingExtensionSelection;
    if (!pending || handler.isLoadingExtensions) return;
    if (handler.extensions.length === 0) return;
    const ext = handler.extensions.find((e) => (e.id ?? e.title) === pending);
    if (ext) {
      setSelectedExtensionId(ext.id ?? ext.title);
      setSelectedCommandId(null);
    }
    handler.pendingExtensionSelection = null;
  }, [handler.pendingExtensionSelection, handler.isLoadingExtensions, handler.extensions]);

  useEffect(() => {
    if (!plusOpen) return;
    const close = () => {
      setPlusOpen(false);
    };
    const id = setTimeout(() => document.addEventListener('click', close, { once: true }), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', close);
    };
  }, [plusOpen]);

  const handleInstallFromFolder = async () => {
    try {
      const folder = await showOpenFolderDialog();
      if (!folder) return;
      const inspection = await inspectExtensionFolder(folder);
      if (!inspection) {
        setInstallError(true);
        setInstallMessage('Could not read that folder — is there a manifest.json in it?');
        setTimeout(() => setInstallMessage(''), 5000);
        return;
      }
      const { manifest, compatibility } = inspection;
      if (
        compatibility.status === 'sdkMismatch' ||
        compatibility.status === 'appVersionTooOld' ||
        compatibility.status === 'platformNotSupported'
      ) {
        setInstallError(true);
        setInstallMessage(
          `${manifest.name} is not compatible with this app (${compatibility.status})`,
        );
        setTimeout(() => setInstallMessage(''), 5000);
        return;
      }
      setIsInstallingFromFile(true);
      setInstallMessage(`Registering ${manifest.name}…`);
      setInstallError(false);
      const registered = await registerDevExtension(manifest.id, folder);
      if (!registered) throw new Error('registration failed');
      setInstallMessage(`${manifest.name} installed. It will load on next launch.`);
      if (handler.loadExtensions) await handler.loadExtensions();
    } catch (error) {
      setInstallError(true);
      setInstallMessage(`Installation failed: ${error}`);
    } finally {
      setIsInstallingFromFile(false);
      setTimeout(() => {
        setInstallMessage('');
        setInstallError(false);
      }, 5000);
    }
  };

  const handleInstallFromFile = async () => {
    try {
      const filePath = await showOpenExtensionDialog();
      if (!filePath) return;
      setIsInstallingFromFile(true);
      setInstallMessage('Installing extension…');
      setInstallError(false);
      await installExtensionFromFile(filePath);
      setInstallMessage('Extension installed successfully. Restart to activate.');
      if (handler.loadExtensions) await handler.loadExtensions();
    } catch (error) {
      setInstallError(true);
      setInstallMessage(`Installation failed: ${error}`);
    } finally {
      setIsInstallingFromFile(false);
      setTimeout(() => {
        setInstallMessage('');
        setInstallError(false);
      }, 5000);
    }
  };

  const openAliasCaptureForCommand = (ext: ExtensionItem, cmd: ExtensionCommand): void => {
    if (!ext.id) return;
    const objectId = commandObjectId(ext.id, cmd.id);
    setEditingAliasTarget({
      objectId,
      name: cmd.name,
      currentAlias: aliasStore.byObjectId.get(objectId),
    });
  };

  const handleRemoveCommandAlias = async (
    ext: ExtensionItem,
    cmd: ExtensionCommand,
  ): Promise<void> => {
    if (!ext.id) return;
    const alias = aliasStore.byObjectId.get(commandObjectId(ext.id, cmd.id));
    if (!alias) return;
    try {
      await aliasService.unregister(alias);
      aliasStore.removeOptimistic(alias);
      rerender();
    } catch (e) {
      logService.warn(`Failed to remove alias for ${cmd.name}: ${e}`);
    }
  };

  const openShortcutCaptureForCommand = (ext: ExtensionItem, cmd: ExtensionCommand): void => {
    if (!ext.id) return;
    setEditingShortcutTarget({
      objectId: commandObjectId(ext.id, cmd.id),
      name: cmd.name,
      icon: cmd.icon,
    });
  };

  const handleCommandShortcutSave = async (detail: {
    modifier: string;
    key: string;
  }): Promise<string | true> => {
    if (!editingShortcutTarget) return 'No command selected';
    const shortcut = `${detail.modifier}+${detail.key}`;
    const result = await shortcutService.register(
      editingShortcutTarget.objectId,
      editingShortcutTarget.name,
      'command',
      shortcut,
      undefined,
      editingShortcutTarget.icon,
    );
    if (!result.ok) {
      const reason = result.conflict?.itemName ?? 'Unsupported key or OS error';
      return `Could not assign: ${reason}`;
    }
    rerender();
    return true;
  };

  const handleRemoveCommandShortcut = async (
    ext: ExtensionItem,
    cmd: ExtensionCommand,
  ): Promise<void> => {
    if (!ext.id) return;
    try {
      await shortcutService.unregister(commandObjectId(ext.id, cmd.id));
      rerender();
    } catch (e) {
      logService.warn(`Failed to remove shortcut for ${cmd.name}: ${e}`);
    }
  };

  const openPlusDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!plusOpen && plusBtnRef.current) {
      const rect = plusBtnRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setPlusOpen(!plusOpen);
  };

  const filteredExtensions = filterExtensions(handler.extensions, searchQuery, activeFilter);
  const builtInExtensions = filteredExtensions.filter((e) => e.isBuiltIn);
  const installedExtensions = filteredExtensions.filter((e) => !e.isBuiltIn);

  const getTypeLabel = (ext: ExtensionItem): string => {
    if (ext.isBuiltIn) return 'Built-in';
    if (ext.type === 'theme') return 'Theme';
    return 'Extension';
  };

  const selectedExtension =
    handler.extensions.find((e) => (e.id ?? e.title) === selectedExtensionId) ?? null;

  const selectedCommand = (() => {
    if (!selectedCommandId || !selectedExtensionId) return null;
    const ext = handler.extensions.find((e) => (e.id ?? e.title) === selectedExtensionId);
    const cmd = ext?.commands?.find((c) => c.id === selectedCommandId);
    return cmd && ext ? { cmd, parent: ext } : null;
  })();

  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  const selectExtension = (ext: ExtensionItem) => {
    setSelectedExtensionId(ext.id ?? ext.title);
    setSelectedCommandId(null);
  };

  const selectCommand = (ext: ExtensionItem, cmd: ExtensionCommand) => {
    setSelectedExtensionId(ext.id ?? ext.title);
    setSelectedCommandId(cmd.id);
  };

  const renderExtensionRows = (list: ExtensionItem[]) => (
    <>
      {list.map((ext) => {
        const key = ext.id ?? ext.title;
        const isExpanded = expandedIds.has(key);
        const isExtSelected = selectedExtensionId === key && !selectedCommandId;

        return (
          <React.Fragment key={key}>
            <div
              className={`grid grid-cols-[1fr_90px_110px_110px_50px] items-center gap-3 px-4 py-3 border-b border-[var(--border-color)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors ${
                isExtSelected ? 'bg-[var(--bg-selected)]' : ''
              }`}
              role="row"
              tabIndex={0}
              onClick={() => selectExtension(ext)}
              onKeyDown={(e) => e.key === 'Enter' && selectExtension(ext)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  className={`p-1 bg-transparent border-0 text-[var(--text-tertiary)] cursor-pointer transition-transform ${
                    isExpanded ? 'rotate-90' : ''
                  } ${!ext.commands?.length ? 'opacity-0 pointer-events-none' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(key);
                  }}
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  disabled={!ext.commands?.length}
                >
                  <svg
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-2.5 h-2.5"
                  >
                    <polyline points="3,2 7,5 3,8" />
                  </svg>
                </button>
                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                  {ext.iconUrl && isBuiltInIcon(ext.iconUrl) ? (
                    <Icon name={getBuiltInIconName(ext.iconUrl)} size={20} />
                  ) : ext.iconUrl && isIconImage(ext.iconUrl) ? (
                    <img
                      src={ext.iconUrl}
                      alt={ext.title}
                      className="w-5 h-5 rounded-[var(--radius-xs)] object-contain"
                    />
                  ) : ext.iconUrl ? (
                    <span className="text-base">{ext.iconUrl}</span>
                  ) : (
                    <span className="text-xs font-bold text-[var(--text-secondary)]">
                      {ext.title[0]?.toUpperCase() ?? 'E'}
                    </span>
                  )}
                </div>
                <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                  {ext.title}
                </span>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">{getTypeLabel(ext)}</span>
              <span className="text-xs text-[var(--text-tertiary)]">—</span>
              <span className="text-xs text-[var(--text-tertiary)]">—</span>
              <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                <Toggle
                  checked={ext.isBuiltIn ? true : ext.enabled === true}
                  disabled={
                    ext.isBuiltIn ||
                    handler.togglingExtension === ext.title ||
                    extensionStateManager.extensionUninstallInProgress === ext.id ||
                    (ext.compatibility?.status !== 'compatible' &&
                      ext.compatibility?.status !== 'unknown')
                  }
                  onChange={() => {
                    handler.toggleExtension(ext);
                    rerender();
                  }}
                />
              </div>
            </div>

            {isExpanded && ext.commands?.length
              ? ext.commands.map((cmd) => {
                  const isCmdSelected =
                    selectedCommandId === cmd.id && selectedExtensionId === ext.id;
                  const cmdObjId = ext.id ? commandObjectId(ext.id, cmd.id) : '';
                  const cmdAlias = cmdObjId ? aliasStore.byObjectId.get(cmdObjId) : undefined;
                  const cmdShortcut = cmdObjId ? shortcutsByObjectId.get(cmdObjId) : undefined;

                  return (
                    <div
                      key={cmd.id}
                      className={`grid grid-cols-[1fr_90px_110px_110px_50px] items-center gap-3 px-4 py-2.5 border-b border-[var(--border-color)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors bg-[var(--bg-secondary)] ${
                        isCmdSelected ? 'bg-[var(--bg-selected)]' : ''
                      }`}
                      role="row"
                      tabIndex={0}
                      onClick={() => selectCommand(ext, cmd)}
                      onKeyDown={(e) => e.key === 'Enter' && selectCommand(ext, cmd)}
                    >
                      <div className="flex items-center gap-2 pl-6 min-w-0">
                        <div className="w-4 h-4 flex items-center justify-center shrink-0 text-[var(--text-tertiary)]">
                          {cmd.icon && isBuiltInIcon(cmd.icon) ? (
                            <Icon name={getBuiltInIconName(cmd.icon)} size={14} />
                          ) : cmd.icon && isIconImage(cmd.icon) ? (
                            <img
                              src={cmd.icon}
                              alt={cmd.name}
                              className="w-3.5 h-3.5 object-contain"
                            />
                          ) : cmd.icon ? (
                            <span className="text-xs">{cmd.icon}</span>
                          ) : (
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              className="w-3.5 h-3.5"
                            >
                              <polyline points="4 17 10 11 4 5" />
                              <line x1="12" y1="19" x2="20" y2="19" />
                            </svg>
                          )}
                        </div>
                        <span className="text-sm text-[var(--text-primary)] truncate">
                          {cmd.name}
                        </span>
                      </div>
                      <span className="text-xs text-[var(--text-secondary)]">{'Command'}</span>
                      <span className="flex items-center gap-1.5">
                        {cmdAlias ? (
                          <>
                            <button
                              type="button"
                              className="bg-transparent border-0 p-0 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                openAliasCaptureForCommand(ext, cmd);
                              }}
                              title="Change alias"
                            >
                              <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-2 rounded-[var(--radius-xs)] bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-primary)] text-[10px] font-mono font-medium leading-none select-none">
                                {cmdAlias}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="bg-transparent border-0 px-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--accent-danger)] cursor-pointer"
                              aria-label={`Remove alias for ${cmd.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleRemoveCommandAlias(ext, cmd);
                              }}
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="bg-transparent border-0 p-0 text-xs font-mono text-[var(--text-tertiary)] hover:text-[var(--accent-primary)] cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAliasCaptureForCommand(ext, cmd);
                            }}
                          >
                            {'Add Alias'}
                          </button>
                        )}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {cmdShortcut ? (
                          <>
                            <button
                              type="button"
                              className="bg-transparent border-0 p-0 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                openShortcutCaptureForCommand(ext, cmd);
                              }}
                              title="Reassign hotkey"
                            >
                              <KeyboardHint keys={toDisplayString(cmdShortcut.shortcut)} />
                            </button>
                            <button
                              type="button"
                              className="bg-transparent border-0 px-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--accent-danger)] cursor-pointer"
                              aria-label={`Remove hotkey for ${cmd.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleRemoveCommandShortcut(ext, cmd);
                              }}
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="bg-transparent border-0 p-0 text-xs font-mono text-[var(--text-tertiary)] hover:text-[var(--accent-primary)] cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              openShortcutCaptureForCommand(ext, cmd);
                            }}
                          >
                            {'Record Hotkey'}
                          </button>
                        )}
                      </span>
                      <span className="text-xs text-[var(--text-tertiary)] text-right">✓</span>
                    </div>
                  );
                })
              : null}
          </React.Fragment>
        );
      })}
    </>
  );

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {installMessage ? (
        <div
          className="p-3 rounded-[var(--radius-md)] text-xs font-medium"
          style={{
            background: `color-mix(in srgb, ${
              installError ? 'var(--accent-danger)' : 'var(--accent-success)'
            } 12%, transparent)`,
            color: installError ? 'var(--accent-danger)' : 'var(--accent-success)',
          }}
        >
          {installMessage}
        </div>
      ) : null}

      <SplitView
        leftWidth="66%"
        minLeftWidth={340}
        maxLeftWidth={720}
        left={
          <div className="flex flex-col h-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-[var(--radius-lg)] overflow-hidden">
            <div className="flex items-center gap-2 p-3 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] flex-wrap">
              <div className="flex items-center gap-2 flex-1 min-w-[140px] px-2.5 py-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-[var(--radius-md)]">
                <Icon
                  name="search"
                  size={13}
                  strokeWidth={2}
                  className="text-[var(--text-tertiary)] shrink-0"
                />
                <input
                  type="text"
                  className="w-full bg-transparent border-0 outline-none text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] font-mono"
                  placeholder={'Search…'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`px-2.5 py-1 rounded-[var(--radius-md)] text-xs font-medium border cursor-pointer transition-colors ${
                    activeFilter === f.id
                      ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                      : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)]'
                  }`}
                  onClick={() => setActiveFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}

              <button
                ref={plusBtnRef}
                type="button"
                className="p-1.5 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                aria-label={'Add extension'}
                onClick={openPlusDropdown}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  className="w-3.5 h-3.5"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-[1fr_90px_110px_110px_50px] items-center gap-3 px-4 py-2.5 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              <span>{'Name'}</span>
              <span>{'Type'}</span>
              <span>{'Alias'}</span>
              <span>{'Hotkey'}</span>
              <span className="text-right">{'Enabled'}</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {handler.isLoadingExtensions ? (
                <LoadingState message={'Loading extensions…'} />
              ) : handler.extensionError ? (
                <EmptyState
                  message={'Failed to load extensions'}
                  description={handler.extensionError}
                >
                  <button
                    type="button"
                    className="mt-2 px-3 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-[var(--radius-md)] text-xs text-[var(--text-primary)] cursor-pointer"
                    onClick={() => void handler.loadExtensions()}
                  >
                    {'Retry'}
                  </button>
                </EmptyState>
              ) : filteredExtensions.length === 0 ? (
                <EmptyState
                  message={
                    handler.extensions.length === 0 ? 'No extensions installed' : 'No results found'
                  }
                  description={
                    handler.extensions.length === 0
                      ? 'Extensions add new functionality to Flowkey'
                      : 'Try a different search or filter'
                  }
                />
              ) : (
                <>
                  {builtInExtensions.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-tertiary)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border-color)]">
                        <span>{'Built-in Features'}</span>
                        <span>{builtInExtensions.length}</span>
                      </div>
                      {renderExtensionRows(builtInExtensions)}
                    </>
                  ) : null}
                  {installedExtensions.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-tertiary)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border-color)]">
                        <span>{'Installed Extensions'}</span>
                        <span>{installedExtensions.length}</span>
                      </div>
                      {renderExtensionRows(installedExtensions)}
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>
        }
        right={
          <div className="h-full overflow-y-auto">
            <ExtensionDetailPanel
              extension={selectedCommand ? null : selectedExtension}
              command={selectedCommand}
              isToggling={handler.togglingExtension !== null}
              isUninstalling={extensionStateManager.extensionUninstallInProgress !== null}
              preferencesVersion={handler.preferencesVersion}
              onToggle={(ext) => {
                handler.toggleExtension(ext);
                rerender();
              }}
              onUninstall={(ext) => {
                handler.requestUninstallExtension(ext);
                rerender();
              }}
            />
          </div>
        }
      />

      {plusOpen ? (
        <div
          className="fixed z-50 min-w-[180px] p-1.5 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-[var(--radius-lg)] shadow-lg flex flex-col gap-1"
          style={{ top: `${dropdownPos.top}px`, right: `${dropdownPos.right}px` }}
        >
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            {'Extensions'}
          </div>
          <>
            <button
              type="button"
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-md)] text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border-0 bg-transparent cursor-pointer text-left"
              onClick={() => {
                setPlusOpen(false);
                void handleInstallFromFile();
              }}
              disabled={isInstallingFromFile}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="w-3.5 h-3.5"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {isInstallingFromFile ? 'Installing…' : 'Install from File…'}
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-md)] text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border-0 bg-transparent cursor-pointer text-left"
              onClick={() => {
                setPlusOpen(false);
                void handleInstallFromFolder();
              }}
              disabled={isInstallingFromFile}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="w-3.5 h-3.5"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              Install from Folder…
            </button>
            <div className="h-px bg-[var(--border-color)] my-1" />
          </>
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            {'Tools'}
          </div>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-md)] text-xs text-[var(--text-tertiary)] opacity-60 border-0 bg-transparent cursor-not-allowed text-left"
            disabled
            title="Coming soon"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="w-3.5 h-3.5"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M12 8v8M8 12h8" />
            </svg>
            {'Create Extension'}
          </button>
        </div>
      ) : null}

      {editingAliasTarget ? (
        <AliasCapture
          objectId={editingAliasTarget.objectId}
          itemName={editingAliasTarget.name}
          itemType="command"
          currentAlias={editingAliasTarget.currentAlias}
          onsave={() => {
            setEditingAliasTarget(null);
            rerender();
          }}
          oncancel={() => setEditingAliasTarget(null)}
        />
      ) : null}

      {editingShortcutTarget ? (
        <ShortcutCapture
          onsave={handleCommandShortcutSave}
          oncancel={() => setEditingShortcutTarget(null)}
          ondone={() => setEditingShortcutTarget(null)}
          excludeObjectId={editingShortcutTarget.objectId}
        />
      ) : null}
    </div>
  );
}
