import React, { useEffect, useState } from 'react';
import { onboardingService } from '../services/onboarding/onboardingService';
import StepProgress from '../components/onboarding/StepProgress';
import Welcome from '../routes/onboarding/steps/Welcome';
import SummonSearch from '../routes/onboarding/steps/SummonSearch';
import Clipboard from '../routes/onboarding/steps/Clipboard';
import Portals from '../routes/onboarding/steps/Portals';
import Emoji from '../routes/onboarding/steps/Emoji';
import Snippets from '../routes/onboarding/steps/Snippets';
import CheatSheet from '../routes/onboarding/steps/CheatSheet';
import PrivacyConsent from '../routes/onboarding/steps/PrivacyConsent';
import { Button } from '../components/react/Buttons';
import OnboardingStage from '../components/onboarding/OnboardingStage';
import { STEP_VISUALS } from '../routes/onboarding/stepVisuals';
import { onboardingNav, type OnbNav } from '../routes/onboarding/onboardingNav';
import { initValidKeys } from '../built-in-features/shortcuts/shortcutFormatter';

export default function OnboardingPage() {
  const [, setTick] = useState(0);
  const [nav, setNav] = useState<OnbNav>(onboardingNav.current);

  const state = onboardingService.state;

  useEffect(() => {
    void initValidKeys();
    void onboardingService.load();

    const unsubNav = onboardingNav.subscribe((n) => {
      setNav(n);
    });
    const unsubService = onboardingService.subscribe(() => {
      setTick((t) => t + 1);
    });

    return () => {
      unsubNav();
      unsubService();
    };
  }, []);

  if (!state) {
    return <p className="p-8 text-center text-sm text-[var(--text-secondary)]">Loading…</p>;
  }

  const visual = STEP_VISUALS[state.current];

  return (
    <div className="grid grid-cols-[1.02fr_0.98fr] flex-1 min-h-0 h-screen bg-[var(--bg-popup)]">
      <div className="flex flex-col gap-5 p-6 overflow-hidden min-h-0">
        <StepProgress total={state.total} position={state.position} />
        <div className="flex-1 min-h-0 flex flex-col justify-center overflow-y-auto">
          {state.current === 'welcome' && <Welcome />}
          {state.current === 'summonSearch' && <SummonSearch />}
          {state.current === 'clipboard' && <Clipboard />}
          {state.current === 'portals' && <Portals />}
          {state.current === 'emoji' && <Emoji />}
          {state.current === 'snippets' && <Snippets />}
          {state.current === 'cheatSheet' && <CheatSheet />}
          {state.current === 'privacyConsent' && <PrivacyConsent />}
        </div>
        <div className="flex justify-between items-center gap-2 pt-4 border-t border-[var(--separator)]">
          {nav.showBack ? <Button onClick={() => void nav.onBack()}>Back</Button> : <span />}
          <div className="flex gap-2">
            {nav.showSkip ? (
              <Button onClick={() => void nav.onSkip()}>{nav.skipLabel}</Button>
            ) : null}
            <Button
              variant="primary"
              onClick={() => void nav.onPrimary()}
              disabled={nav.primaryDisabled}
            >
              {nav.primaryLabel}
            </Button>
          </div>
        </div>
      </div>
      {visual ? <OnboardingStage image={visual.image} lean={visual.lean} /> : null}
    </div>
  );
}
