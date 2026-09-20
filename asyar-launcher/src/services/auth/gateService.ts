import { authService } from './authService';
import { settingsService } from '../settings/settingsService';
import type { Ability } from '../../lib/ipc/commands';

export interface GateResult {
  allowed: boolean;
  reason?: string;
}

export type AbilityName =
  Ability | 'sync.egress' | 'telemetry.crash-report' | 'telemetry.usage-metrics';

/**
 * Centralized, reactive Gate & Policy Service.
 *
 * Implements a strict fail-closed authorization engine across all privileged
 * abilities (cloud sync, telemetry egress).
 */
class GateService {
  /**
   * Evaluate whether an ability is authorized under current auth and settings.
   * Returns a structured `{ allowed: boolean, reason?: string }` object.
   */
  gate(ability: AbilityName): GateResult {
    switch (ability) {
      case 'cloud-sync-egress':
      case 'sync.egress': {
        if (!authService.isLoggedIn) {
          return { allowed: false, reason: 'Cloud sync requires a signed-in account.' };
        }
        if (!authService.entitlements?.includes('sync:settings')) {
          return {
            allowed: false,
            reason:
              'Cloud sync requires an active subscription with the sync:settings entitlement.',
          };
        }
        const syncEnabled = settingsService.getSettings().user?.syncEnabled ?? true;
        if (!syncEnabled) {
          return { allowed: false, reason: 'Cloud sync is disabled in settings.' };
        }
        return { allowed: true };
      }

      case 'telemetry-crash-report':
      case 'telemetry.crash-report': {
        const mode = settingsService.getSettings().privacy.crashReportMode;
        if (mode === 'off') {
          return { allowed: false, reason: 'Crash reporting is disabled in settings.' };
        }
        return { allowed: true };
      }

      case 'telemetry-usage-share':
      case 'telemetry.usage-metrics': {
        const mode = settingsService.getSettings().privacy.usageShareMode;
        if (mode === 'off') {
          return { allowed: false, reason: 'Anonymous usage metrics sharing is disabled.' };
        }
        return { allowed: true };
      }

      default: {
        const strAbility = String(ability);
        if (strAbility.includes(':')) {
          if (!authService.isLoggedIn) {
            return { allowed: false, reason: 'This feature requires a signed-in account.' };
          }
          if (authService.entitlements?.includes(strAbility)) {
            return { allowed: true };
          }
          return {
            allowed: false,
            reason: `This feature requires the '${strAbility}' subscription entitlement.`,
          };
        }
        return { allowed: false, reason: `Unknown ability '${strAbility}'.` };
      }
    }
  }

  /**
   * Check if an ability is allowed. Returns true or false.
   */
  allows(ability: AbilityName): boolean {
    return this.gate(ability).allowed;
  }
}

export const gateService = new GateService();
export const gate = gateService;
