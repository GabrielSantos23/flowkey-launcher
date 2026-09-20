import { onboardingCommands, type OnboardingState } from '../../lib/ipc/commands';
import { logService } from '../log/logService';
import { feedbackService } from '../feedback/feedbackService';

class OnboardingServiceClass {
  state: OnboardingState | null = null;
  loading = false;
  private listeners: Set<() => void> = new Set();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  async load(): Promise<void> {
    this.loading = true;
    try {
      this.state = await onboardingCommands.getState();
      this.notify();
    } catch (err) {
      logService.warn(`[onboardingService] load failed: ${err}`);
      feedbackService.report({
        source: 'frontend',
        kind: 'onboarding-load-failed',
        severity: 'error',
        retryable: false,
        developerDetail: String(err),
      });
    } finally {
      this.loading = false;
      this.notify();
    }
  }

  async advance(): Promise<void> {
    try {
      this.state = await onboardingCommands.advance();
      this.notify();
    } catch (err) {
      feedbackService.report({
        source: 'frontend',
        kind: 'onboarding-advance-failed',
        severity: 'error',
        retryable: false,
        developerDetail: String(err),
      });
    }
  }

  async goBack(): Promise<void> {
    try {
      this.state = await onboardingCommands.goBack();
      this.notify();
    } catch (err) {
      feedbackService.report({
        source: 'frontend',
        kind: 'onboarding-go-back-failed',
        severity: 'error',
        retryable: false,
        developerDetail: String(err),
      });
    }
  }

  async complete(): Promise<void> {
    try {
      await onboardingCommands.complete();
      this.notify();
    } catch (err) {
      feedbackService.report({
        source: 'frontend',
        kind: 'onboarding-complete-failed',
        severity: 'error',
        retryable: false,
        developerDetail: String(err),
      });
    }
  }

  async dismiss(): Promise<void> {
    try {
      await onboardingCommands.dismiss();
      this.notify();
    } catch (err) {
      feedbackService.report({
        source: 'frontend',
        kind: 'onboarding-dismiss-failed',
        severity: 'error',
        retryable: false,
        developerDetail: String(err),
      });
    }
  }

  reset(): void {
    this.state = null;
    this.loading = false;
    this.notify();
  }
}

export const onboardingService = new OnboardingServiceClass();
