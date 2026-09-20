import React, { useEffect } from 'react';
import SettingsCard from './SettingsCard';
import SettingsRow from './SettingsRow';
import SettingsRadioGroup from './SettingsRadioGroup';
import { Button } from '../react/Buttons';
import { settingsService } from '../../services/settings/settingsService';
import type { UsageShareMode } from '../../services/settings/types/AppSettingsType';
import { usageShareState } from './usageShareState';

export default function UsageShareSection() {
  const options = [
    {
      value: 'off',
      label: 'Off',
      description: 'Nothing leaves your device.',
    },
    {
      value: 'ask',
      label: 'Ask me each time',
      description: 'Show me what will be sent before sharing usage data.',
    },
    {
      value: 'auto',
      label: 'Share automatically',
      description: 'Send anonymous daily counts in the background.',
    },
  ];

  const mode = settingsService.currentSettings.privacy.usageShareMode;

  const choose = async (value: string) => {
    await settingsService.updateSettings('privacy', { usageShareMode: value as UsageShareMode });
  };

  useEffect(() => {
    void usageShareState.load();
  }, []);

  return (
    <div>
      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Usage'}
      </div>
      <SettingsCard>
        <SettingsRadioGroup
          label={'Anonymous usage share'}
          description={
            'Help shape Flowkey by sharing anonymous daily counts of which commands you run. No search text, no timestamps, no file paths. Off by default.'
          }
          name="usage-share-mode"
          options={options}
          value={mode}
          onchange={choose}
        />

        <SettingsRow
          label={'Anonymous ID'}
          description={'A random id, not linked to your account. Reset it any time.'}
        >
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-[var(--text-secondary)]">
              {usageShareState.anonId}
            </span>
            <Button onClick={() => usageShareState.reset()}>{'Reset'}</Button>
          </div>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}
