import React, { useEffect } from 'react';
import Card from '../../../components/layout/Card';
import { completeStep } from '../stepLogic';
import { settingsService } from '../../../services/settings/settingsService';
import { onboardingNav } from '../onboardingNav';

export default function CheatSheet() {
  const mod = settingsService.currentSettings.shortcut?.modifier ?? 'Super';
  const key = settingsService.currentSettings.shortcut?.key ?? 'K';

  useEffect(() => {
    onboardingNav.set({ primaryLabel: 'Open Flowkey', onPrimary: completeStep });
  }, []);

  const rows = [
    { keys: `${mod}+${key}`, label: 'Open / hide Flowkey' },
    { keys: 'Ctrl+K', label: 'Open the action panel' },
    { keys: 'Enter', label: 'Run the selected result' },
    { keys: 'Esc / Backspace', label: 'Go back · hide' },
  ];

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <p className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--asyar-brand)]">
          {"You're set"}
        </p>
        <h1 className="m-0 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          {"That's Flowkey — go fast"}
        </h1>
        <p className="m-0 text-[var(--text-secondary)] text-base leading-relaxed">
          {'Keep these five shortcuts handy. You can re-run this tour anytime from Settings.'}
        </p>

        <ul className="list-none m-0 mt-2 p-0 flex flex-col gap-2">
          {rows.map((row, i) => (
            <li key={i} className="flex items-center gap-3">
              <kbd className="min-w-[84px] text-center bg-[var(--bg-tertiary)] border border-[var(--separator)] rounded-[var(--radius-md)] px-3 py-1 text-xs font-mono text-[var(--text-primary)]">
                {row.keys}
              </kbd>
              <span className="text-sm text-[var(--text-secondary)]">{row.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
