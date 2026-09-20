import React from 'react';
import SettingsCard from './SettingsCard';
import SettingsRadioGroup from './SettingsRadioGroup';
import { settingsService } from '../../services/settings/settingsService';
import type { CrashReportMode } from '../../services/settings/types/AppSettingsType';

export default function CrashReportSection() {
  const options = [
    {
      value: 'off',
      label: 'Off',
      description: 'Never send anything.',
    },
    {
      value: 'ask',
      label: 'Ask me each time',
      description: 'Preview the exact report before sending.',
    },
    {
      value: 'auto',
      label: 'Send automatically',
      description: 'Send crash reports silently.',
    },
  ];

  const mode = settingsService.currentSettings.privacy.crashReportMode;

  const choose = async (value: string) => {
    await settingsService.updateSettings('privacy', { crashReportMode: value as CrashReportMode });
  };

  return (
    <div>
      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Crash & Error Reports'}
      </div>
      <SettingsCard>
        <SettingsRadioGroup
          label={'Crash & Error Reports'}
          description={
            'Flowkey sends no telemetry by default. Opt in to help fix crashes — you choose how.'
          }
          name="crash-report-mode"
          options={options}
          value={mode}
          onchange={choose}
          noBorder
        />
      </SettingsCard>
    </div>
  );
}
