import React, { useEffect, useState } from 'react';
import Card from '../../../components/layout/Card';
import ShortcutRecorder from '../../../components/base/ShortcutRecorder';
import LauncherHint from '../../../components/onboarding/LauncherHint';
import { advanceStep } from '../stepLogic';
import { settingsService } from '../../../services/settings/settingsService';
import { saveHotkey } from './summonSearchSetup';
import { onboardingNav } from '../onboardingNav';

export default function SummonSearch() {
  const [modifier, setModifier] = useState(
    settingsService.currentSettings.shortcut?.modifier ?? 'Super',
  );
  const [key, setKey] = useState(settingsService.currentSettings.shortcut?.key ?? 'K');
  const [showRebind, setShowRebind] = useState(false);

  useEffect(() => {
    onboardingNav.set({ primaryLabel: 'Continue', onPrimary: advanceStep });
  }, []);

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <p className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--asyar-brand)]">
          {'The one shortcut to remember'}
        </p>
        <h1 className="m-0 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          {'Summon Flowkey, then just type'}
        </h1>
        <p className="m-0 text-[var(--text-secondary)] text-base leading-relaxed">
          Press{' '}
          <kbd className="bg-[var(--bg-tertiary)] border border-[var(--separator)] rounded-[var(--radius-md)] px-2 py-0.5 text-xs font-mono">
            {modifier}+{key}
          </kbd>{' '}
          from anywhere to open Flowkey. Try searching an app, or do quick math — type{' '}
          <code className="bg-[var(--bg-tertiary)] border border-[var(--separator)] rounded-[var(--radius-md)] px-2 py-0.5 text-xs font-mono">
            1234 * 56
          </code>{' '}
          and press Enter.
        </p>

        <LauncherHint
          steps={[`Press ${modifier}+${key}`, 'Type an app name, or "1234 * 56"', 'Press Enter']}
        />

        {showRebind ? (
          <div className="mt-2">
            <ShortcutRecorder
              modifier={modifier}
              keyVal={key}
              onModifierChange={setModifier}
              onKeyChange={setKey}
              onsave={saveHotkey}
            />
          </div>
        ) : (
          <button
            type="button"
            className="bg-transparent border-0 text-[var(--asyar-brand)] cursor-pointer text-sm p-0 text-left hover:underline"
            onClick={() => setShowRebind(true)}
          >
            {'Prefer a different key? Change it'}
          </button>
        )}
      </div>
    </Card>
  );
}
