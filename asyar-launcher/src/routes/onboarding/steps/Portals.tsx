import React, { useEffect, useState } from 'react';
import Card from '../../../components/layout/Card';
import { Button } from '../../../components/react/Buttons';
import LauncherHint from '../../../components/onboarding/LauncherHint';
import { advanceStep } from '../stepLogic';
import { settingsService } from '../../../services/settings/settingsService';
import { seedSamplePortal } from './portalsSetup';
import { onboardingNav } from '../onboardingNav';

export default function Portals() {
  const mod = settingsService.currentSettings.shortcut?.modifier ?? 'Super';
  const key = settingsService.currentSettings.shortcut?.key ?? 'K';
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    onboardingNav.set({ showSkip: true, onPrimary: advanceStep, onSkip: advanceStep });
  }, []);

  const addSample = () => {
    seedSamplePortal();
    setSeeded(true);
  };

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <p className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--asyar-brand)]">
          Turn any site into a command
        </p>
        <h1 className="m-0 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          <span className="text-[var(--asyar-brand)]">Portals</span>
        </h1>
        <p className="m-0 text-[var(--text-secondary)] text-base leading-relaxed">
          A portal is a saved URL with a{' '}
          <code className="bg-[var(--bg-tertiary)] border border-[var(--separator)] rounded-[var(--radius-md)] px-2 py-0.5 font-mono">
            {'{query}'}
          </code>{' '}
          placeholder — type a few letters and jump straight into a search. We'll add a sample
          "Search GitHub" portal so you can try it.
        </p>

        <div className="self-start">
          <Button onClick={addSample} disabled={seeded}>
            {seeded ? '✓ Sample added' : 'Add sample portal'}
          </Button>
        </div>

        <LauncherHint
          steps={[`Press ${mod}+${key}`, 'Type Search GitHub', 'Press Tab, type a query, Enter']}
        />
      </div>
    </Card>
  );
}
