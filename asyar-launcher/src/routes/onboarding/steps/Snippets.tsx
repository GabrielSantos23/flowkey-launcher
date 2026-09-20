import React, { useEffect, useState } from 'react';
import Card from '../../../components/layout/Card';
import { Button } from '../../../components/react/Buttons';
import ExpansionDemo from '../../../components/onboarding/ExpansionDemo';
import { advanceStep } from '../stepLogic';
import AccessibilityGate from './AccessibilityGate';
import { seedSampleSnippet, enableExpansion } from './snippetsSetup';
import { onboardingNav } from '../onboardingNav';

export default function Snippets() {
  const [seeded, setSeeded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [, setAxGranted] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    onboardingNav.set({ primaryLabel: seeded ? 'Continue' : 'Skip', onPrimary: advanceStep });
  }, [seeded]);

  const setUp = async () => {
    setWorking(true);
    setError('');
    try {
      seedSampleSnippet();
      setSeeded(true);
      const ok = await enableExpansion();
      if (!ok) {
        setError(
          'Could not enable expansion — grant Accessibility permission above and try again.',
        );
      } else {
        setEnabled(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <p className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--asyar-brand)]">
          {'Type less, everywhere'}
        </p>
        <h1 className="m-0 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          <span className="text-[var(--asyar-brand)]">{'Snippets'}</span>
        </h1>
        <p className="m-0 text-[var(--text-secondary)] text-base leading-relaxed">
          {
            "Save a keyword and it expands into full text in any app you type in — addresses, signatures, boilerplate. Snippets can include placeholders like {clipboard} or {date}. We'll add a sample snippet."
          }
        </p>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            1 · Permission
          </span>
          <AccessibilityGate onGrantedChange={setAxGranted} />
          <div className="self-start">
            <Button onClick={() => void setUp()} disabled={working || (seeded && enabled)}>
              {seeded && enabled
                ? '✓ Sample snippet ready'
                : working
                  ? 'Setting up…'
                  : '2 · Add sample & enable'}
            </Button>
          </div>
          {error ? <p className="mt-2 text-sm text-[var(--accent-danger)]">{error}</p> : null}
        </div>

        <ExpansionDemo
          trigger=";email"
          result="you@example.com"
          note="Heads up: snippets expand in other apps — not inside Flowkey's own windows. Add the sample above, then type ;email anywhere you type."
        />
      </div>
    </Card>
  );
}
