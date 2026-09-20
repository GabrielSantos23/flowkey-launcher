import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../log/logService', () => ({
  logService: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../feedback/feedbackService', () => ({
  feedbackService: { report: vi.fn() },
}));

import { onboardingService } from './onboardingService';
import { invoke } from '@tauri-apps/api/core';
import { feedbackService } from '../feedback/feedbackService';
import { setInvokeFailureReporter } from '../../lib/ipc/invokeSafe';

const initialState = {
  current: 'welcome',
  total: 7,
  position: 1,
  isMacos: false,
};

describe('onboardingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setInvokeFailureReporter(feedbackService);
    onboardingService.reset();
  });

  it('loads initial state from Rust', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(initialState);
    await onboardingService.load();
    expect(invoke).toHaveBeenCalledWith('get_onboarding_state', undefined);
    expect(onboardingService.state).toEqual(initialState);
  });

  it('advances and stores returned state', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(initialState)
      .mockResolvedValueOnce({
        ...initialState,
        current: 'grantAccessibility',
        position: 2,
      });
    await onboardingService.load();
    await onboardingService.advance();
    expect(invoke).toHaveBeenCalledWith('advance_onboarding_step', undefined);
    expect(onboardingService.state?.current).toBe('grantAccessibility');
  });

  it('goes back and stores returned state', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({ ...initialState, current: 'pickHotkey', position: 3 })
      .mockResolvedValueOnce({ ...initialState, current: 'grantAccessibility', position: 2 });
    await onboardingService.load();
    await onboardingService.goBack();
    expect(invoke).toHaveBeenCalledWith('go_back_onboarding_step', undefined);
    expect(onboardingService.state?.current).toBe('grantAccessibility');
  });

  it('completes calls Rust', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await onboardingService.complete();
    expect(invoke).toHaveBeenCalledWith('complete_onboarding', undefined);
  });

  it('dismiss calls Rust', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await onboardingService.dismiss();
    expect(invoke).toHaveBeenCalledWith('dismiss_onboarding', undefined);
  });

  it('reports diagnostics on load failure', async () => {
    const { feedbackService } = await import('../feedback/feedbackService');
    vi.mocked(invoke).mockRejectedValueOnce(new Error('boom'));
    await onboardingService.load();
    expect(feedbackService.report).toHaveBeenCalled();
  });
});
