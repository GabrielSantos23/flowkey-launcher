import React, { useEffect, useState } from 'react';
import Card from '../../../components/layout/Card';
import { Button } from '../../../components/react/Buttons';
import ExpansionDemo from '../../../components/onboarding/ExpansionDemo';
import { advanceStep } from '../stepLogic';
import AccessibilityGate from './AccessibilityGate';
import { onboardingNav } from '../onboardingNav';

export default function Emoji() {
  const [, setAxGranted] = useState(true);

  useEffect(() => {
    onboardingNav.set({ primaryLabel: 'Continue', onPrimary: advanceStep });
  }, []);

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <p className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--asyar-brand)]">
          Faster than an emoji picker
        </p>
        <h1 className="m-0 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Emoji <span className="text-[var(--asyar-brand)]">shortcodes</span>
        </h1>
        <p className="m-0 text-[var(--text-secondary)] text-base leading-relaxed">
          Type{' '}
          <code className="bg-[var(--bg-tertiary)] border border-[var(--separator)] rounded-[var(--radius-md)] px-2 py-0.5 font-mono">
            :party:
          </code>{' '}
          and it becomes 🎉 — anywhere you type. Install the Emoji extension from{' '}
          <strong className="text-[var(--text-primary)]">Manage Extensions</strong> (search for
          “store”), grant it clipboard access, then try it in any app you type in.
        </p>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Permission
          </span>
          <AccessibilityGate onGrantedChange={setAxGranted} />
        </div>

        <ExpansionDemo
          trigger=":party:"
          result="🎉"
          note="Heads up: shortcodes expand in other apps (Notes, Slack, your editor) — not inside Flowkey's own windows. Install the extension, then try it anywhere you type."
        />
      </div>
    </Card>
  );
}
