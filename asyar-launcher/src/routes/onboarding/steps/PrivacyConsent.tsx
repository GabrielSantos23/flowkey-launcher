import React, { useEffect, useState } from 'react';
import GuidanceStep from '../../../components/onboarding/GuidanceStep';
import SettingsRadioGroup from '../../../components/settings/SettingsRadioGroup';
import { settingsService } from '../../../services/settings/settingsService';
import { advanceStep } from '../stepLogic';
import { onboardingNav } from '../onboardingNav';
import type {
  CrashReportMode,
  UsageShareMode,
} from '../../../services/settings/types/AppSettingsType';

export default function PrivacyConsent() {
  const [mode, setMode] = useState<CrashReportMode>(
    settingsService.currentSettings.privacy?.crashReportMode ?? 'off',
  );
  const [usageMode, setUsageMode] = useState<UsageShareMode>(
    settingsService.currentSettings.privacy?.usageShareMode ?? 'off',
  );

  const options: { value: CrashReportMode; label: string; description?: string }[] = [
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

  const usageOptions: { value: UsageShareMode; label: string; description?: string }[] = [
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
      label: 'Share anonymously',
      description: 'Daily counts, no personal data.',
    },
  ];

  useEffect(() => {
    onboardingNav.set({ showSkip: false, onPrimary: advanceStep });
  }, []);

  const handleChange = (value: string) => {
    setMode(value as CrashReportMode);
    void settingsService.updateSettings('privacy', { crashReportMode: value as CrashReportMode });
  };

  const handleUsageChange = (value: string) => {
    setUsageMode(value as UsageShareMode);
    void settingsService.updateSettings('privacy', { usageShareMode: value as UsageShareMode });
  };

  return (
    <GuidanceStep kicker={'Private by design'} title={'Crash reports & analytics'}>
      <p>
        {
          'When Flowkey crashes, it can send a small report so the team can fix the problem faster. You are always in control — choose what feels right for you.'
        }
      </p>
      <SettingsRadioGroup
        name="crashReportMode"
        options={options}
        value={mode}
        onchange={handleChange}
        noBorder={true}
      />
      <p className="font-semibold text-sm text-[var(--text-primary)] mt-3">
        {'Anonymous usage share (optional)'}
      </p>
      <p>
        {
          'Share anonymous daily counts of which commands you run. No search text, no file paths, no personal data.'
        }
      </p>
      <SettingsRadioGroup
        name="usageShareMode"
        options={usageOptions}
        value={usageMode}
        onchange={handleUsageChange}
        noBorder={true}
      />
    </GuidanceStep>
  );
}
