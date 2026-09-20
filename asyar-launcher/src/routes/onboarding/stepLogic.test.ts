import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/onboarding/onboardingService', () => ({
  onboardingService: {
    advance: vi.fn(),
    goBack: vi.fn(),
    complete: vi.fn(),
  },
}));

import { advanceStep, goBackStep, completeStep } from './stepLogic';
import { onboardingService } from '../../services/onboarding/onboardingService';

describe('stepLogic', () => {
  beforeEach(() => vi.clearAllMocks());

  it('advanceStep delegates to onboardingService.advance', async () => {
    await advanceStep();
    expect(onboardingService.advance).toHaveBeenCalledOnce();
  });

  it('goBackStep delegates to onboardingService.goBack', async () => {
    await goBackStep();
    expect(onboardingService.goBack).toHaveBeenCalledOnce();
  });

  it('completeStep delegates to onboardingService.complete', async () => {
    await completeStep();
    expect(onboardingService.complete).toHaveBeenCalledOnce();
  });
});
