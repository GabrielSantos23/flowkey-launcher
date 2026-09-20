import React, { useState, useEffect } from 'react';
import { Button } from '../../../components/react/Buttons';
import { LoadingState } from '../../../components/react/Feedback';
import { Toggle } from '../../../components/react/Inputs';
import { Select } from '../../../components/react/Inputs';
import SettingsCard from '../../../components/settings/SettingsCard';
import SettingsRow from '../../../components/settings/SettingsRow';
import type { SettingsHandler } from '../settingsHandlers';
import { getVersion } from '@tauri-apps/api/app';
import {
  checkForUpdate,
  installDownloadedUpdate,
  appUpdate,
} from '../../../services/updater/updaterService';
import type { AppUpdateState } from '../../../services/updater/updaterService';
import { logService } from '../../../services/log/logService';

export interface AboutTabProps {
  handler: SettingsHandler;
}

export default function AboutTab({ handler }: AboutTabProps) {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const [version, setVersion] = useState<string>('...');
  const [appUpdateState, setAppUpdateState] = useState<AppUpdateState>(appUpdate.current);
  const [checking, setChecking] = useState<boolean>(false);

  useEffect(() => {
    getVersion()
      .then((v) => setVersion(v))
      .catch(() => setVersion('0.1.0'));

    const unsub = appUpdate.subscribe((state) => {
      setAppUpdateState(state);
    });

    return () => unsub();
  }, []);

  const handleCheckUpdate = async () => {
    setChecking(true);
    try {
      await checkForUpdate();
    } catch (e) {
      logService.error(`Update check failed: ${e}`);
    } finally {
      setChecking(false);
    }
  };

  const handleInstall = async () => {
    try {
      await installDownloadedUpdate();
    } catch (e) {
      logService.error(`Update install failed: ${e}`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'About'}
      </div>

      <div className="flex flex-col gap-4">
        <SettingsCard>
          <div className="flex items-center gap-4 py-2">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent-primary)]/10 flex items-center justify-center text-2xl font-bold text-[var(--accent-primary)]">
              A
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-semibold text-[var(--text-primary)]">Flowkey</span>
              <span className="text-sm text-[var(--text-secondary)]">{`Version ${version}`}</span>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard title={'Updates'}>
          <SettingsRow
            label={'Release channel'}
            description={
              'Stable: tested releases only. Beta: early access to pre-release versions.'
            }
          >
            <Select
              value={handler.settings.updates?.channel ?? 'stable'}
              options={[
                { value: 'stable', label: 'Stable' },
                { value: 'beta', label: 'Beta' },
              ]}
              onChange={(value: string) => {
                handler.updateChannel(value as 'stable' | 'beta');
                rerender();
              }}
            />
          </SettingsRow>

          <SettingsRow
            label={'Automatic updates'}
            description={'Check for and download updates in the background.'}
          >
            <Toggle
              checked={handler.settings.updates?.autoCheck ?? true}
              onChange={(checked: boolean) => {
                handler.updateAutoCheck(checked);
                rerender();
              }}
            />
          </SettingsRow>

          {appUpdateState.phase === 'ready' ? (
            <SettingsRow
              label={`Update ${appUpdateState.pendingVersion} ready`}
              description={'Will install automatically on next launch.'}
            >
              <Button variant="primary" onClick={handleInstall}>
                {'Install and Restart'}
              </Button>
            </SettingsRow>
          ) : (
            <SettingsRow
              label={
                appUpdateState.phase === 'downloading' ? 'Downloading update…' : 'Check for Updates'
              }
              description={
                appUpdateState.phase === 'downloading'
                  ? `${appUpdateState.percent}%`
                  : 'Check for updates manually'
              }
            >
              <Button
                variant="secondary"
                disabled={checking || appUpdateState.phase === 'downloading'}
                onClick={handleCheckUpdate}
              >
                {checking ? <LoadingState message="" /> : 'Check Now'}
              </Button>
            </SettingsRow>
          )}
        </SettingsCard>
      </div>
    </div>
  );
}
