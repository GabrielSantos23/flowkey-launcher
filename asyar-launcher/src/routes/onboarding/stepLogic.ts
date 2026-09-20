import { onboardingService } from '../../services/onboarding/onboardingService';

export async function advanceStep(): Promise<void> {
  await onboardingService.advance();
}

export async function goBackStep(): Promise<void> {
  await onboardingService.goBack();
}

export async function completeStep(): Promise<void> {
  await onboardingService.complete();
}
