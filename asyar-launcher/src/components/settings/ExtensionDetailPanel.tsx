import React, { useState, useEffect } from 'react';
import { EmptyState } from '../react/Feedback';
import { Badge } from '../react/Badge';
import { Toggle } from '../react/Inputs';
import ExtensionPreferencesForm from './ExtensionPreferencesForm';
import SpotifyConnectionStatus from './SpotifyConnectionStatus';
import PermissionList from './PermissionList';
import type { ExtensionItem } from '../../routes/settings/settingsHandlers';
import type { ExtensionCommand } from 'asyar-sdk/contracts';

import { extensionPreferencesService } from '../../services/extension/extensionPreferencesService';
import { permissionConsentService } from '../../services/extension/permissionConsentService';
import { feedbackService } from '../../services/feedback/feedbackService';
import { logService } from '../../services/log/logService';
import * as commands from '../../lib/ipc/commands';
import { getRuntimeDownloadSizes, type RuntimeDownload } from '../../lib/ipc/runtimeCommands';
import { downloadDeclaredRuntimes } from '../../services/extension/runtimeDownloads';
import extensionManager from '../../services/extension/extensionManager';
import { runtimeService } from '../../services/runtime/runtimeService';
import {
  formatRuntimeDownloadStatus,
  describeMissingRuntimesForConfirm,
} from '../../services/runtime/runtimeDownloadStatus';
import { Icon } from '../react/Icon';
import { isBuiltInIcon, isIconImage, getBuiltInIconName } from '../../lib/iconUtils';

export interface ExtensionDetailPanelProps {
  extension?: ExtensionItem | null;
  command?: { cmd: ExtensionCommand; parent: ExtensionItem } | null;
  isToggling?: boolean;
  isUninstalling?: boolean;
  preferencesVersion?: number;
  onToggle?: (ext: ExtensionItem) => void;
  onUninstall?: (ext: ExtensionItem) => void;
}

export default function ExtensionDetailPanel({
  extension = null,
  command = null,
  isToggling = false,
  isUninstalling = false,
  preferencesVersion = 0,
  onToggle,
  onUninstall,
}: ExtensionDetailPanelProps) {
  const [preferenceValues, setPreferenceValues] = useState<Record<string, any>>({});
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(false);
  const [needsPermissionReview, setNeedsPermissionReview] = useState(false);
  const [isDownloadingRuntime, setIsDownloadingRuntime] = useState(false);
  const [needsRuntimeDownload, setNeedsRuntimeDownload] = useState(false);
  const [missingRuntimes, setMissingRuntimes] = useState<RuntimeDownload[]>([]);

  const runtimeDownloadLabel = isDownloadingRuntime
    ? formatRuntimeDownloadStatus(runtimeService.downloadProgress, 'Downloading…')
    : 'Download runtime';

  const refreshRuntimeStatus = async (extensionId: string): Promise<void> => {
    const status = await commands.checkExtensionConsent(extensionId);
    const declared = status?.declaredRuntimes ?? [];
    if (declared.length === 0) {
      if (extension?.id === extensionId) {
        setNeedsRuntimeDownload(false);
        setMissingRuntimes([]);
      }
      return;
    }
    const missing = await getRuntimeDownloadSizes(declared);
    if (extension?.id === extensionId) {
      setNeedsRuntimeDownload(missing.length > 0);
      setMissingRuntimes(missing);
    }
  };

  useEffect(() => {
    setNeedsRuntimeDownload(false);
    setMissingRuntimes([]);
    if (extension?.id && !extension.isBuiltIn) {
      void refreshRuntimeStatus(extension.id);
    }
  }, [extension?.id, extension?.isBuiltIn]);

  const retryRuntimeDownload = async () => {
    if (!extension?.id) return;
    if (missingRuntimes.length > 0) {
      const { title, message } = describeMissingRuntimesForConfirm(missingRuntimes);
      const confirmed = await feedbackService.confirmAlert({
        title,
        message,
        confirmText: 'Download',
      });
      if (!confirmed) return;
    }
    setIsDownloadingRuntime(true);
    try {
      await downloadDeclaredRuntimes(extension.id);
      await extensionManager.reloadExtensions();
      await refreshRuntimeStatus(extension.id);
    } finally {
      setIsDownloadingRuntime(false);
    }
  };

  useEffect(() => {
    setNeedsPermissionReview(false);
    if (extension?.id && !extension.isBuiltIn && (extension.permissions?.length ?? 0) > 0) {
      commands.checkExtensionConsent(extension.id).then((status) => {
        if (extension?.id === extension.id) {
          setNeedsPermissionReview(status?.needsConsent ?? false);
        }
      });
    }
  }, [
    extension?.id,
    extension?.isBuiltIn,
    extension?.permissions?.length,
    permissionConsentService.consentVersion,
  ]);

  const reviewPermissions = async () => {
    if (!extension?.id) return;
    const accepted = await permissionConsentService.ensureConsent(
      extension.id,
      extension.title,
      'review',
    );
    if (accepted && extension?.id === extension.id) {
      setNeedsPermissionReview(false);
    }
  };

  const revokePermissions = async () => {
    if (!extension?.id) return;
    const confirmed = await feedbackService.confirmAlert({
      title: 'Revoke Permissions',
      message: `"${extension.title}" will lose access to its granted permissions until you review and re-allow them. It stays installed and enabled.`,
      confirmText: 'Revoke',
      variant: 'danger',
    });
    if (!confirmed) return;
    const revoked = await permissionConsentService.revoke(extension.id);
    if (revoked && extension?.id === extension.id) {
      setNeedsPermissionReview(true);
    }
  };

  useEffect(() => {
    const id = command?.parent.id ?? extension?.id;
    if (id) {
      setIsLoadingPrefs(true);
      extensionPreferencesService
        .getEffectivePreferences(id)
        .then((bundle) => {
          if (command) {
            setPreferenceValues(bundle.commands[command.cmd.id] ?? {});
          } else {
            setPreferenceValues(bundle.extension ?? {});
          }
        })
        .finally(() => {
          setIsLoadingPrefs(false);
        });
    } else {
      setPreferenceValues({});
    }
  }, [command, extension?.id, preferencesVersion]);

  const handlePreferenceChange = async (name: string, value: any) => {
    const id = command?.parent.id ?? extension?.id;
    if (!id) return;

    setPreferenceValues((prev) => ({ ...prev, [name]: value }));

    try {
      await extensionPreferencesService.set(id, command?.cmd.id ?? null, name, value);
    } catch (err) {
      logService.error(`Failed to save preference ${name} for ${id}: ${err}`);
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'error',
        retryable: false,
        context: { message: `Could not save preference "${name}"` },
      });
    }
  };

  if (command) {
    return (
      <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
        <div className="panel-header flex items-start gap-5 p-6 border-b border-[var(--border-color)]">
          <div className="panel-icon w-11 h-11 rounded-[var(--radius-xl)] bg-[color-mix(in_srgb,var(--accent-primary)_18%,transparent)] flex items-center justify-center text-xl font-bold text-[var(--accent-primary)] shrink-0 overflow-hidden">
            {command.cmd.icon && isBuiltInIcon(command.cmd.icon) ? (
              <Icon name={getBuiltInIconName(command.cmd.icon)} size={28} />
            ) : command.cmd.icon && isIconImage(command.cmd.icon) ? (
              <img
                src={command.cmd.icon}
                alt={command.cmd.name}
                className="w-7 h-7 object-contain rounded-[var(--radius-sm)]"
              />
            ) : command.cmd.icon ? (
              <span className="text-2xl leading-none">{command.cmd.icon}</span>
            ) : command.parent.iconUrl && isBuiltInIcon(command.parent.iconUrl) ? (
              <Icon name={getBuiltInIconName(command.parent.iconUrl)} size={28} />
            ) : command.parent.iconUrl && isIconImage(command.parent.iconUrl) ? (
              <img
                src={command.parent.iconUrl}
                alt={command.parent.title}
                className="w-7 h-7 object-contain rounded-[var(--radius-sm)]"
              />
            ) : (
              <span>{command.parent.title[0]?.toUpperCase() ?? 'E'}</span>
            )}
          </div>
          <div className="panel-meta flex flex-col">
            <div className="text-base font-semibold text-[var(--text-primary)]">
              {command.cmd.name}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">{command.parent.title}</div>
          </div>
        </div>

        <div className="panel-body flex flex-col gap-6 p-6">
          {command.cmd.description ? (
            <div className="panel-section flex flex-col gap-1">
              <div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                Description
              </div>
              <p className="text-sm text-[var(--text-secondary)] m-0 leading-relaxed">
                {command.cmd.description}
              </p>
            </div>
          ) : null}

          {command.cmd.trigger ? (
            <div className="panel-section flex flex-col gap-1">
              <div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                Trigger
              </div>
              <code className="text-xs font-mono text-[var(--text-primary)] bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-[var(--radius-xs)] px-2 py-1 self-start">
                {command.cmd.trigger}
              </code>
            </div>
          ) : null}

          {command.cmd.preferences && command.cmd.preferences.length > 0 ? (
            <div className="panel-section flex flex-col gap-2">
              <div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                Preferences
              </div>
              <ExtensionPreferencesForm
                preferences={command.cmd.preferences}
                values={preferenceValues}
                disabled={isLoadingPrefs}
                onChange={handlePreferenceChange}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (extension) {
    return (
      <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
        <div className="panel-header flex items-start gap-5 p-6 border-b border-[var(--border-color)]">
          <div className="panel-icon w-11 h-11 rounded-[var(--radius-xl)] bg-[color-mix(in_srgb,var(--accent-primary)_18%,transparent)] flex items-center justify-center text-xl font-bold text-[var(--accent-primary)] shrink-0 overflow-hidden">
            {extension.iconUrl && isBuiltInIcon(extension.iconUrl) ? (
              <Icon name={getBuiltInIconName(extension.iconUrl)} size={28} />
            ) : extension.iconUrl && isIconImage(extension.iconUrl) ? (
              <img
                src={extension.iconUrl}
                alt={extension.title}
                className="w-7 h-7 object-contain rounded-[var(--radius-sm)]"
              />
            ) : extension.iconUrl ? (
              <span className="text-2xl leading-none">{extension.iconUrl}</span>
            ) : (
              <span>{extension.title[0]?.toUpperCase() ?? 'E'}</span>
            )}
          </div>
          <div className="panel-meta flex-1 min-w-0">
            <div className="text-base font-semibold text-[var(--text-primary)] truncate">
              {extension.title}
            </div>
          </div>
          <div className="panel-actions flex items-center gap-3">
            <Toggle
              checked={extension.isBuiltIn ? true : extension.enabled === true}
              disabled={extension.isBuiltIn || isToggling}
              onChange={() => onToggle?.(extension)}
            />
            {!extension.isBuiltIn ? (
              <button
                className="text-xs text-[var(--accent-danger)] bg-transparent border-0 cursor-pointer p-0 hover:opacity-80 disabled:opacity-50"
                onClick={() => onUninstall?.(extension)}
                disabled={isUninstalling}
              >
                {isUninstalling ? 'Uninstalling…' : 'Uninstall'}
              </button>
            ) : null}
          </div>
        </div>

        <div className="panel-body flex flex-col gap-6 p-6">
          {extension.subtitle ? (
            <div className="panel-section flex flex-col gap-1">
              <div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                {'Description'}
              </div>
              <p className="text-sm text-[var(--text-secondary)] m-0 leading-relaxed">
                {extension.subtitle}
              </p>
            </div>
          ) : null}

          {extension.id === 'spotify' ? (
            <SpotifyConnectionStatus extensionId={extension.id} />
          ) : null}

          {needsRuntimeDownload ? (
            <div className="panel-section flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                  Runtime
                </span>
                <button
                  className="text-xs text-[var(--accent-primary)] bg-transparent border-0 cursor-pointer hover:underline disabled:opacity-50"
                  onClick={retryRuntimeDownload}
                  disabled={isDownloadingRuntime}
                >
                  {runtimeDownloadLabel}
                </button>
              </div>
              <p className="text-xs text-[var(--text-secondary)] m-0 leading-relaxed">
                A required runtime failed to download or was declined. Commands are hidden until
                it's installed — retry from here.
              </p>
            </div>
          ) : null}

          <div className="panel-section flex flex-wrap gap-2">
            {extension.isBuiltIn ? (
              <Badge text={'Built-in'} variant="info" />
            ) : extension.type === 'theme' ? (
              <Badge text={'Theme'} variant="info" />
            ) : extension.type ? (
              <Badge text={'Extension'} variant="info" />
            ) : null}
            {extension.version ? (
              <Badge text={`v${extension.version}`} variant="default" mono />
            ) : null}
            {extension.compatibility?.status === 'sdkMismatch' ? (
              <Badge text={`Requires SDK ${extension.compatibility.required}`} variant="danger" />
            ) : null}
            {extension.compatibility?.status === 'appVersionTooOld' ? (
              <Badge text={`Requires app v${extension.compatibility.required}+`} variant="danger" />
            ) : null}
            {needsPermissionReview ? (
              <Badge text={'Permissions need review'} variant="danger" />
            ) : null}
            {needsRuntimeDownload ? (
              <Badge text={'Needs runtime download'} variant="danger" />
            ) : null}
          </div>

          {!extension.isBuiltIn && extension.permissions && extension.permissions.length > 0 ? (
            <div className="panel-section flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                  {'Permissions'}
                </span>
                {needsPermissionReview ? (
                  <button
                    className="text-xs text-[var(--accent-primary)] bg-transparent border-0 cursor-pointer hover:underline"
                    onClick={reviewPermissions}
                  >
                    {'Review permissions'}
                  </button>
                ) : (
                  <button
                    className="text-xs text-[var(--accent-danger)] bg-transparent border-0 cursor-pointer hover:underline"
                    onClick={revokePermissions}
                  >
                    {'Revoke'}
                  </button>
                )}
              </div>
              <PermissionList
                permissions={extension.permissions}
                permissionArgs={extension.permissionArgs ?? {}}
              />
            </div>
          ) : null}

          {extension.preferences && extension.preferences.length > 0 ? (
            <div className="panel-section flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                  Preferences
                </span>
                <button
                  className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-transparent border-0 cursor-pointer"
                  onClick={() => extensionPreferencesService.reset(extension.id!)}
                >
                  {'Reset to Defaults'}
                </button>
              </div>
              <ExtensionPreferencesForm
                preferences={extension.preferences}
                values={preferenceValues}
                disabled={isLoadingPrefs}
                onChange={handlePreferenceChange}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return <EmptyState message={'Select an extension or command'} />;
}
