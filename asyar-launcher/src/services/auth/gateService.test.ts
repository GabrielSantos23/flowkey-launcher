import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gateService as gate } from './gateService';
import { authService } from './authService';
import { settingsService } from '../settings/settingsService';
import type { AppSettings } from '../settings/types/AppSettingsType';

vi.mock('./authService', () => ({
  authService: {
    isLoggedIn: false,
    entitlements: [] as string[],
    subscribe: vi.fn(),
  },
}));

vi.mock('../settings/settingsService', () => ({
  settingsService: {
    getSettings: vi.fn(),
    subscribe: vi.fn(),
  },
}));

function mockSettings(partial: Partial<AppSettings> = {}) {
  const defaults: AppSettings = {
    general: { startAtLogin: false, showDockIcon: false, showTrayIcon: true },
    search: {
      searchApplications: true,
      searchSystemPreferences: true,
      fuzzySearch: true,
      enableExtensionSearch: false,
      allowExtensionActions: false,
      additionalScanPaths: [],
      applicationEnabled: {},
    },
    shortcut: { modifier: 'Alt', key: 'Space' },
    appearance: { theme: 'system', launchView: 'default', windowWidth: 800, windowHeight: 600 },
    extensions: { enabled: {}, autoUpdate: true },
    onboarding: { completed: true },
    privacy: { crashReportMode: 'off', usageShareMode: 'off' },
    user: { syncEnabled: true },
    fileSearch: { enabled: true, includeRoots: [], excludePatterns: [], indexHidden: false },
  };
  vi.mocked(settingsService.getSettings).mockReturnValue({
    ...defaults,
    ...partial,
    privacy: { ...defaults.privacy, ...(partial.privacy ?? {}) },
    user: { ...defaults.user, ...(partial.user ?? {}) },
  });
}

describe('gateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authService.isLoggedIn = false;
    authService.entitlements = [];
    mockSettings();
  });

  describe('Cloud Sync Egress (sync.egress)', () => {
    it('denies when not logged in', () => {
      authService.isLoggedIn = false;
      expect(gate.allows('sync.egress')).toBe(false);
      expect(gate.gate('sync.egress')).toEqual({
        allowed: false,
        reason: 'Cloud sync requires a signed-in account.',
      });
    });

    it('denies when logged in without sync entitlement', () => {
      authService.isLoggedIn = true;
      authService.entitlements = [];
      expect(gate.allows('sync.egress')).toBe(false);
      expect(gate.gate('sync.egress')).toEqual({
        allowed: false,
        reason: 'Cloud sync requires an active subscription with the sync:settings entitlement.',
      });
    });

    it('denies when entitled but syncEnabled is false in settings', () => {
      authService.isLoggedIn = true;
      authService.entitlements = ['sync:settings'];
      mockSettings({ user: { syncEnabled: false } });

      expect(gate.allows('sync.egress')).toBe(false);
      expect(gate.gate('sync.egress')).toEqual({
        allowed: false,
        reason: 'Cloud sync is disabled in settings.',
      });
    });

    it('allows when signed in, entitled, and enabled', () => {
      authService.isLoggedIn = true;
      authService.entitlements = ['sync:settings'];
      mockSettings({ user: { syncEnabled: true } });

      expect(gate.allows('sync.egress')).toBe(true);
      expect(gate.gate('sync.egress')).toEqual({ allowed: true });
    });
  });

  describe('Telemetry Abilities', () => {
    it('telemetry.crash-report respects privacy.crashReportMode', () => {
      mockSettings({ privacy: { crashReportMode: 'off', usageShareMode: 'off' } });
      expect(gate.allows('telemetry.crash-report')).toBe(false);

      mockSettings({ privacy: { crashReportMode: 'auto', usageShareMode: 'off' } });
      expect(gate.allows('telemetry.crash-report')).toBe(true);

      mockSettings({ privacy: { crashReportMode: 'ask', usageShareMode: 'off' } });
      expect(gate.allows('telemetry.crash-report')).toBe(true);
    });

    it('telemetry.usage-metrics respects privacy.usageShareMode', () => {
      mockSettings({ privacy: { crashReportMode: 'off', usageShareMode: 'off' } });
      expect(gate.allows('telemetry.usage-metrics')).toBe(false);

      mockSettings({ privacy: { crashReportMode: 'off', usageShareMode: 'auto' } });
      expect(gate.allows('telemetry.usage-metrics')).toBe(true);
    });
  });
});
