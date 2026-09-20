import React, { useState, useEffect } from 'react';
import SettingsCard from '../../../components/settings/SettingsCard';
import SettingsRow from '../../../components/settings/SettingsRow';
import { Toggle } from '../../../components/react/Inputs';
import { Button } from '../../../components/react/Buttons';
import { Badge } from '../../../components/react/Badge';
import { EmptyState } from '../../../components/react/Feedback';
import type { SettingsHandler } from '../settingsHandlers';
import extensionManager from '../../../services/extension/extensionManager';
import { getDevExtensionPaths } from '../../../lib/ipc/commands';
import { forceRemountWorker } from '../../../lib/ipc/devCommands';
import { feedbackService } from '../../../services/feedback/feedbackService';
import { logService } from '../../../services/log/logService';

export interface DeveloperTabProps {
  handler: SettingsHandler;
}

export default function DeveloperTab({ handler }: DeveloperTabProps) {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const [devExtensions, setDevExtensions] = useState<Record<string, string>>({});
  const [isLoadingDevExts, setIsLoadingDevExts] = useState(true);
  const [devExtError, setDevExtError] = useState('');
  const [reloadingExt, setReloadingExt] = useState<string | null>(null);
  const [detachingExt, setDetachingExt] = useState<string | null>(null);

  const loadDevExtensions = async () => {
    setIsLoadingDevExts(true);
    setDevExtError('');
    const result = await getDevExtensionPaths();
    if (result === null) {
      logService.error('Failed to load dev extensions');
      setDevExtError('Failed to load dev extensions.');
      setDevExtensions({});
    } else {
      setDevExtensions(result);
    }
    setIsLoadingDevExts(false);
  };

  useEffect(() => {
    void loadDevExtensions();
  }, []);

  const hotReload = async (extensionId: string) => {
    if (reloadingExt) return;
    setReloadingExt(extensionId);
    const manifest = extensionManager.getManifestById(extensionId) as
      { background?: { main?: string } } | undefined;
    const ok = await forceRemountWorker(extensionId, !!manifest?.background?.main);
    if (ok) {
      void feedbackService.report({
        kind: 'manual',
        severity: 'success',
        retryable: false,
        context: { message: `Reloaded ${extensionId}` },
      });
    } else {
      logService.error(`Failed to hot-reload ${extensionId}`);
      void feedbackService.report({
        kind: 'manual',
        severity: 'error',
        retryable: false,
        context: { message: 'Reload failed' },
      });
    }
    setReloadingExt(null);
  };

  const detachDevExtension = async (extensionId: string) => {
    if (detachingExt) return;
    const confirmed = await feedbackService.confirmAlert({
      title: 'Detach Dev Extension',
      message: `Remove "${extensionId}" from the dev extension registry? The extension files will not be deleted.`,
      confirmText: 'Detach',
      variant: 'danger',
    });
    if (!confirmed) return;

    setDetachingExt(extensionId);
    try {
      await loadDevExtensions();
      void feedbackService.report({
        kind: 'manual',
        severity: 'success',
        retryable: false,
        context: { message: `Detached ${extensionId}` },
      });
    } catch (err) {
      logService.error(`Failed to detach dev extension: ${err}`);
    } finally {
      setDetachingExt(null);
    }
  };

  const devExtEntries = Object.entries(devExtensions);

  return (
    <div className="developer-tab flex flex-col gap-6">
      <div id="developer-tools" className="scroll-mt-6">
        <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          {'Tools'}
        </div>
        <SettingsCard>
          <SettingsRow
            label={'Developer mode'}
            description={'These tools are intended for extension developers.'}
          >
            <Badge text={'Active'} variant="warning" />
          </SettingsRow>

          <SettingsRow
            label={'DevEx Inspector'}
            description={
              'Show the extension inspector panel in the main launcher window. Access runtime state, events, IPC/RPC traces, and more.'
            }
          >
            <Toggle
              checked={handler.settings.developer?.showInspector ?? false}
              onChange={() => {
                handler.handleDeveloperSettingToggle('showInspector');
                rerender();
              }}
            />
          </SettingsRow>

          <SettingsRow
            label={'Verbose logging'}
            description={
              'Increase log verbosity for all loaded extensions. Useful for debugging extension behavior.'
            }
          >
            <Toggle
              checked={handler.settings.developer?.verboseLogging ?? false}
              onChange={() => {
                handler.handleDeveloperSettingToggle('verboseLogging');
                rerender();
              }}
            />
          </SettingsRow>

          <SettingsRow
            label={'IPC/RPC tracing'}
            description={
              "Record message traces between extensions and the host. Visible in the DevEx Inspector's IPC and RPC tabs."
            }
          >
            <Toggle
              checked={handler.settings.developer?.tracing ?? false}
              onChange={() => {
                handler.handleDeveloperSettingToggle('tracing');
                rerender();
              }}
            />
          </SettingsRow>

          <SettingsRow
            label={'Sideload extensions'}
            description={
              'Allow installing extension bundles from local files instead of the store.'
            }
          >
            <Toggle
              checked={handler.settings.developer?.allowSideloading ?? false}
              onChange={() => {
                handler.handleDeveloperSettingToggle('allowSideloading');
                rerender();
              }}
            />
          </SettingsRow>
        </SettingsCard>
      </div>

      <div id="developer-extensions" className="scroll-mt-6">
        <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          {'Dev Extensions'}
        </div>
        <SettingsCard>
          {isLoadingDevExts ? (
            <div className="p-4 text-xs text-[var(--text-secondary)]">{'Loading...'}</div>
          ) : devExtError ? (
            <div className="p-4 text-xs text-[var(--accent-danger)]">{devExtError}</div>
          ) : devExtEntries.length === 0 ? (
            <div className="p-4">
              <EmptyState
                compact
                message={'No dev extensions attached'}
                description={'Use the SDK CLI to attach a local extension: asyar-sdk attach <path>'}
              />
            </div>
          ) : (
            devExtEntries.map(([extId, extPath]) => (
              <SettingsRow key={extId} label={extId} description={extPath}>
                <div className="flex gap-2 shrink-0">
                  <Button disabled={reloadingExt === extId} onClick={() => void hotReload(extId)}>
                    {reloadingExt === extId ? 'Reloading…' : 'Hot Reload'}
                  </Button>
                  <Button
                    variant="danger"
                    disabled={detachingExt === extId}
                    onClick={() => void detachDevExtension(extId)}
                  >
                    {detachingExt === extId ? 'Detaching…' : 'Detach'}
                  </Button>
                </div>
              </SettingsRow>
            ))
          )}
        </SettingsCard>
      </div>
    </div>
  );
}
