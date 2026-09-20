import React, { useEffect, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import Card from '../../../components/layout/Card';
import { Button } from '../../../components/react/Buttons';
import AppearanceThemeSelector from '../../../components/settings/AppearanceThemeSelector';
import WindowModeSelector from '../../../components/settings/WindowModeSelector';
import { advanceStep } from '../stepLogic';
import { settingsService } from '../../../services/settings/settingsService';
import { onboardingNav } from '../onboardingNav';

export default function Welcome() {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  useEffect(() => {
    onboardingNav.set({ showBack: false, primaryLabel: 'Start the tour', onPrimary: advanceStep });
  }, []);

  const currentTheme = settingsService.currentSettings.appearance?.theme ?? 'system';
  const currentLaunchView = settingsService.currentSettings.appearance?.launchView ?? 'default';

  const pickTheme = async (theme: 'light' | 'dark' | 'system') => {
    await settingsService.updateSettings('appearance', { theme });
    rerender();
  };

  const pickLaunchView = async (launchView: 'default' | 'compact') => {
    await settingsService.updateSettings('appearance', { launchView });
    await emit('asyar:launch-view-changed', { launchView });
    rerender();
  };

  const openRaycastImport = async () => {
    await emit('asyar:run-command', { commandId: 'cmd_raycast-import_import-raycast' });
  };

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <p className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--asyar-brand)]">
          {'Welcome'}
        </p>
        <h1 className="m-0 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Meet Flowkey — your keyboard-first{' '}
          <span className="text-[var(--asyar-brand)]">command center</span>
        </h1>
        <p className="m-0 text-[var(--text-secondary)] text-base leading-relaxed">
          {
            "Search apps, do math, ask AI, rewrite text anywhere, expand snippets, and more — all from one box. Let's take a 2-minute tour and set you up."
          }
        </p>

        <div className="flex items-center justify-between gap-5 py-4 border-b border-[var(--separator)]">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-[var(--text-primary)]">{'Appearance'}</span>
            <span className="text-sm text-[var(--text-secondary)]">
              {'Light, dark, or follow your system.'}
            </span>
          </div>
          <AppearanceThemeSelector value={currentTheme} onchange={pickTheme} />
        </div>

        <div className="flex items-center justify-between gap-5 py-4 border-b border-[var(--separator)]">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {'Window mode'}
            </span>
            <span className="text-sm text-[var(--text-secondary)]">
              {'Default shows results panel; Compact is just the search bar.'}
            </span>
          </div>
          <WindowModeSelector value={currentLaunchView} onchange={pickLaunchView} />
        </div>

        <div className="flex items-center justify-between gap-5 py-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {'Coming from Raycast?'}
            </span>
            <span className="text-sm text-[var(--text-secondary)]">
              {'Bring over your snippets, quicklinks, and app hotkeys.'}
            </span>
          </div>
          <Button onClick={() => void openRaycastImport()}>{'Import from Raycast…'}</Button>
        </div>
      </div>
    </Card>
  );
}
