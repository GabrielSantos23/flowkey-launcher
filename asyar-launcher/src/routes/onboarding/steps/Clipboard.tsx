import React, { useEffect } from 'react';
import GuidanceStep from '../../../components/onboarding/GuidanceStep';
import LauncherHint from '../../../components/onboarding/LauncherHint';
import { settingsService } from '../../../services/settings/settingsService';
import { advanceStep } from '../stepLogic';
import { onboardingNav } from '../onboardingNav';

export default function Clipboard() {
  const mod = settingsService.currentSettings.shortcut?.modifier ?? 'Super';
  const key = settingsService.currentSettings.shortcut?.key ?? 'K';

  useEffect(() => {
    onboardingNav.set({ showSkip: true, onPrimary: advanceStep, onSkip: advanceStep });
  }, []);

  return (
    <GuidanceStep kicker={'Never lose a copy again'} title={'Clipboard History'}>
      <p>
        Everything you copy is saved and searchable — text, links, even images. Find an old copy and
        paste it in one keystroke.
      </p>
      <LauncherHint
        steps={[
          `Press ${mod}+${key}`,
          'Type clip and press Enter',
          'Pick any past item to paste it',
        ]}
      />
      <p>
        Need several at once? Ctrl-click (or Ctrl+↑/↓) to select multiple items, then press Enter to{' '}
        <span className="text-[var(--asyar-brand)] font-semibold">
          merge them into a single paste
        </span>
        .
      </p>
    </GuidanceStep>
  );
}
