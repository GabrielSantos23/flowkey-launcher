import { advanceStep, goBackStep } from './stepLogic';

export interface OnbNav {
  showBack: boolean;
  showSkip: boolean;
  skipLabel: string;
  primaryLabel: string;
  primaryDisabled: boolean;
  onBack: () => void | Promise<void>;
  onSkip: () => void | Promise<void>;
  onPrimary: () => void | Promise<void>;
}

function defaults(): OnbNav {
  return {
    showBack: true,
    showSkip: false,
    skipLabel: 'Skip',
    primaryLabel: 'Continue',
    primaryDisabled: false,
    onBack: goBackStep,
    onSkip: advanceStep,
    onPrimary: advanceStep,
  };
}

class OnboardingNav {
  current: OnbNav = defaults();
  private listeners: Set<(nav: OnbNav) => void> = new Set();

  set(partial: Partial<OnbNav>) {
    this.current = { ...defaults(), ...partial };
    for (const listener of this.listeners) {
      listener(this.current);
    }
  }

  subscribe(fn: (nav: OnbNav) => void): () => void {
    this.listeners.add(fn);
    fn(this.current);
    return () => {
      this.listeners.delete(fn);
    };
  }
}

export const onboardingNav = new OnboardingNav();
