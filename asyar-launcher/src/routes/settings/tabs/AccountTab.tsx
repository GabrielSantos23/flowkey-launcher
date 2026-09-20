import React, { useState, useEffect } from 'react';
import { Button } from '../../../components/react/Buttons';
import { LoadingState } from '../../../components/react/Feedback';
import { Toggle } from '../../../components/react/Inputs';
import { Badge, StatusDot } from '../../../components/react/Badge';
import SettingsCard from '../../../components/settings/SettingsCard';
import SettingsRow from '../../../components/settings/SettingsRow';
import type { SettingsHandler } from '../settingsHandlers';
import { authService } from '../../../services/auth/authService';
import { cloudSyncService } from '../../../services/sync/cloudSyncService';
import { settingsService } from '../../../services/settings/settingsService';
import { feedbackService } from '../../../services/feedback/feedbackService';
import { logService } from '../../../services/log/logService';
import { syncEncryptionService } from '../../../services/sync/syncEncryptionService';
import EncryptionEnrolmentDialog from '../../../components/settings/EncryptionEnrolmentDialog';
import PassphraseDialog from '../../../components/settings/PassphraseDialog';
import RotatePassphraseDialog from '../../../components/settings/RotatePassphraseDialog';
import RecoverWithMnemonicDialog from '../../../components/settings/RecoverWithMnemonicDialog';
import RecoveryPhraseDialog from '../../../components/settings/RecoveryPhraseDialog';
import DisableE2eeDialog from '../../../components/settings/DisableE2eeDialog';

export interface AccountTabProps {
  handler: SettingsHandler;
}

type ActiveDialog = null | 'enrol' | 'unlock' | 'rotate' | 'phrase' | 'recover' | 'disable';

const ENTITLEMENT_LABELS: Record<string, string> = {
  'sync:settings': 'Settings Sync',
  'extensions:premium': 'Premium Extensions',
};

function labelFor(entitlement: string): string {
  return ENTITLEMENT_LABELS[entitlement] ?? entitlement;
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return 'Never';
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function AccountTab({ handler: _handler }: AccountTabProps) {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [toggleState, setToggleState] = useState(syncEncryptionService.enabled);
  const [syncToggleState, setSyncToggleState] = useState(cloudSyncService.enabled);

  useEffect(() => {
    setToggleState(syncEncryptionService.enabled);
  }, [syncEncryptionService.enabled]);

  useEffect(() => {
    setSyncToggleState(cloudSyncService.enabled);
  }, [cloudSyncService.enabled]);

  useEffect(() => {
    syncEncryptionService.refreshStatus().catch((err) => {
      logService.warn(`refresh e2ee status failed: ${String(err)}`);
    });
  }, []);

  const reportSyncFailure = (err: unknown): void => {
    logService.error(`[AccountTab] cloud sync failed: ${err}`);
    feedbackService.report({
      source: 'frontend',
      kind: 'manual',
      severity: 'error',
      retryable: false,
      context: { message: 'Cloud sync failed' },
    });
  };

  const revertSyncToggle = (previous: boolean, reason: string) => {
    logService.error(`[AccountTab] toggling cloud sync failed: ${reason}`);
    setSyncToggleState(previous);
    settingsService.updateSettings('user', { syncEnabled: previous }).catch(() => {});
  };

  const onSyncToggleClick = (target: boolean) => {
    const previous = cloudSyncService.enabled;
    setSyncToggleState(target);
    settingsService
      .updateSettings('user', { syncEnabled: target })
      .then((ok) => {
        if (!ok) revertSyncToggle(previous, 'settings save returned false');
        rerender();
      })
      .catch((err) => {
        revertSyncToggle(previous, String(err));
        rerender();
      });
  };

  const onToggleClick = (target: boolean) => {
    if (target && !syncEncryptionService.enabled) {
      setActiveDialog('enrol');
    } else if (!target && syncEncryptionService.enabled) {
      setActiveDialog('disable');
    }
  };

  const handleSignIn = async (provider: string) => {
    await authService.startLogin(provider);
    rerender();
  };

  const handleSignOut = async () => {
    await authService.logout();
    rerender();
  };

  const handleCancel = () => {
    authService.cancelLoginPolling();
    rerender();
  };

  if (authService.isAwaitingOAuth) {
    return (
      <div className="flex flex-col gap-6">
        <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          {'Profile'}
        </div>
        <div id="account-profile" className="scroll-mt-6">
          <SettingsCard>
            <div className="flex flex-col items-center gap-4 p-8 text-[var(--text-secondary)]">
              <LoadingState message="Waiting for browser login..." />
              <Button onClick={handleCancel}>{'Cancel'}</Button>
            </div>
          </SettingsCard>
        </div>

        <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          {'Subscription'}
        </div>
        <div id="account-subscription" className="scroll-mt-6">
          <SettingsCard>
            <SettingsRow
              label={'Subscription'}
              description={'Finish signing in to manage your plan.'}
            >
              <span className="text-sm text-[var(--text-secondary)]">{'Pending login'}</span>
            </SettingsRow>
          </SettingsCard>
        </div>

        <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          {'Sync'}
        </div>
        <div id="account-sync" className="scroll-mt-6">
          <SettingsCard>
            <SettingsRow label={'Sync'} description={'Finish signing in to sync settings.'}>
              <span className="text-sm text-[var(--text-secondary)]">{'Pending login'}</span>
            </SettingsRow>
          </SettingsCard>
        </div>
      </div>
    );
  }

  if (!authService.isLoggedIn) {
    return (
      <div className="flex flex-col gap-6">
        <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          {'Profile'}
        </div>
        <div id="account-profile" className="scroll-mt-6">
          <SettingsCard>
            {authService.loginError ? (
              <SettingsRow label={'Sign-in error'}>
                <div className="w-full p-3 rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--accent-danger)_12%,var(--bg-secondary))] text-[var(--accent-danger)] text-sm">
                  {authService.loginError}
                </div>
              </SettingsRow>
            ) : null}

            <SettingsRow label="GitHub" description={'Use your GitHub account with Flowkey.'}>
              <Button onClick={() => void handleSignIn('github')} disabled={authService.isLoading}>
                {'Sign in'}
              </Button>
            </SettingsRow>

            <SettingsRow label="Google" description={'Use your Google account with Flowkey.'}>
              <Button onClick={() => void handleSignIn('google')} disabled={authService.isLoading}>
                {'Sign in'}
              </Button>
            </SettingsRow>

            <SettingsRow label={'Terms'}>
              <p className="m-0 text-xs text-[var(--text-tertiary)]">
                {'By signing in, you agree to the Flowkey Terms of Service and Privacy Policy.'}
              </p>
            </SettingsRow>
          </SettingsCard>
        </div>

        <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          {'Subscription'}
        </div>
        <div id="account-subscription" className="scroll-mt-6">
          <SettingsCard>
            <SettingsRow label={'Subscription'} description={'Sign in to manage your plan.'}>
              <span className="text-sm text-[var(--text-secondary)]">{'Not signed in'}</span>
            </SettingsRow>
          </SettingsCard>
        </div>

        <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          {'Sync'}
        </div>
        <div id="account-sync" className="scroll-mt-6">
          <SettingsCard>
            <SettingsRow label={'Sync'} description={'Sign in to sync settings across devices.'}>
              <div className="flex items-center gap-3 w-full">
                <span className="flex-1 min-w-0 text-sm text-[var(--text-secondary)]">
                  {syncToggleState
                    ? 'Data will sync when signed in.'
                    : 'Your data stays on this device.'}
                </span>
                <Toggle
                  checked={syncToggleState}
                  onChange={(checked) => onSyncToggleClick(checked)}
                />
              </div>
            </SettingsRow>
          </SettingsCard>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Profile'}
      </div>
      <div id="account-profile" className="scroll-mt-6">
        <SettingsCard>
          <SettingsRow label={'Profile'}>
            <div className="flex items-center gap-4 w-full py-2">
              {authService.user?.avatarUrl ? (
                <img
                  src={authService.user.avatarUrl}
                  alt="Avatar"
                  className="w-10 h-10 rounded-full shrink-0 border-2 border-[var(--separator)] object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center bg-[var(--bg-tertiary)] text-[var(--text-secondary)] font-semibold">
                  {authService.user?.name?.charAt(0).toUpperCase() ?? '?'}
                </div>
              )}
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                  {authService.user?.name ?? 'Unknown'}
                </span>
                <span className="text-sm text-[var(--text-secondary)] truncate">
                  {authService.user?.email ?? ''}
                </span>
              </div>
              <Button onClick={() => void handleSignOut()} disabled={authService.isLoading}>
                {authService.isLoading ? 'Signing out…' : 'Sign out'}
              </Button>
            </div>
          </SettingsRow>

          <SettingsRow label="Features">
            {authService.entitlements.length === 0 ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[var(--text-secondary)]">No active subscription.</span>
                <button
                  type="button"
                  className="bg-transparent border-0 p-0 text-sm text-[var(--text-primary)] underline cursor-pointer"
                  onClick={() => {
                    import('@tauri-apps/plugin-opener').then((m) =>
                      m.openUrl('https://asyar.org/pricing'),
                    );
                  }}
                >
                  View plans
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {authService.entitlements.map((entitlement) => (
                  <div key={entitlement} className="flex items-center gap-2">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <circle
                        cx="8"
                        cy="8"
                        r="7"
                        fill="color-mix(in srgb, var(--accent-success) 20%, transparent)"
                        stroke="var(--accent-success)"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M5 8l2 2 4-4"
                        stroke="var(--accent-success)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="text-sm text-[var(--text-primary)]">
                      {labelFor(entitlement)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SettingsRow>
        </SettingsCard>
      </div>

      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Subscription'}
      </div>
      <div id="account-subscription" className="scroll-mt-6">
        <SettingsCard>
          <SettingsRow
            label={'Subscription'}
            description={'Open your hosted billing and plan settings.'}
          >
            <Button
              onClick={() => {
                import('@tauri-apps/plugin-opener').then((m) =>
                  m.openUrl('https://asyar.org/settings/subscription'),
                );
              }}
            >
              {'Manage Subscription'}
            </Button>
          </SettingsRow>
        </SettingsCard>
      </div>

      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Sync'}
      </div>
      <div id="account-sync" className="scroll-mt-6">
        <SettingsCard>
          {!authService.isLoggedIn || authService.entitlements.includes('sync:settings') ? (
            <>
              <SettingsRow label={'Sync'}>
                <div className="flex items-center gap-3 w-full">
                  <span className="flex-1 min-w-0 text-sm text-[var(--text-secondary)]">
                    {syncToggleState
                      ? 'Syncing your data across devices.'
                      : 'Your data stays on this device.'}
                  </span>
                  <Toggle
                    checked={syncToggleState}
                    onChange={(checked) => onSyncToggleClick(checked)}
                  />
                </div>
              </SettingsRow>

              {cloudSyncService.enabled ? (
                <>
                  <SettingsRow label={'Last Synced'}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-[var(--text-secondary)]">
                        {cloudSyncService.lastSyncedAt
                          ? formatRelativeTime(cloudSyncService.lastSyncedAt)
                          : 'Not yet synced'}
                      </span>
                      {cloudSyncService.lastError ? (
                        <span className="text-xs text-[var(--accent-danger)]">
                          {cloudSyncService.lastError}
                        </span>
                      ) : null}
                    </div>
                  </SettingsRow>

                  <SettingsRow label={'Sync Now'}>
                    <Button
                      onClick={() =>
                        cloudSyncService
                          .syncNow()
                          .then(() => rerender())
                          .catch((err) => reportSyncFailure(err))
                      }
                      disabled={cloudSyncService.status === 'syncing'}
                    >
                      {cloudSyncService.status === 'syncing' ? 'Syncing…' : 'Sync Now'}
                    </Button>
                  </SettingsRow>

                  <SettingsRow label={'Encrypted Sync'}>
                    <div className="flex items-center gap-3 w-full">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {!syncEncryptionService.enabled ? (
                          <>
                            <Badge text="Off" variant="default" />
                            <span className="text-sm text-[var(--text-secondary)]">
                              Server can read your synced data.
                            </span>
                          </>
                        ) : syncEncryptionService.locked ? (
                          <>
                            <div className="flex items-center gap-1">
                              <StatusDot color="warning" />
                              <Badge text={'Locked'} variant="warning" />
                            </div>
                            <span className="text-sm text-[var(--text-secondary)]">
                              Passphrase needed to continue.
                            </span>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-1">
                              <StatusDot color="success" />
                              <Badge text="On" variant="success" />
                            </div>
                            <span className="text-sm text-[var(--text-secondary)]">
                              Server stores only ciphertext.
                            </span>
                          </>
                        )}
                      </div>
                      <Toggle
                        checked={toggleState}
                        onChange={(checked) => onToggleClick(checked)}
                      />
                    </div>
                  </SettingsRow>

                  {syncEncryptionService.enabled ? (
                    <>
                      {syncEncryptionService.locked ? (
                        <SettingsRow label={'Locked'}>
                          <Button onClick={() => setActiveDialog('unlock')}>
                            {'Enter passphrase'}
                          </Button>
                        </SettingsRow>
                      ) : null}
                      <SettingsRow label={'Passphrase'}>
                        <Button onClick={() => setActiveDialog('rotate')}>
                          {'Change passphrase'}
                        </Button>
                      </SettingsRow>
                      <SettingsRow label={'Recovery phrase'}>
                        <div className="flex gap-2">
                          <Button onClick={() => setActiveDialog('phrase')}>
                            {'View recovery phrase'}
                          </Button>
                          <Button onClick={() => setActiveDialog('recover')}>
                            {'I forgot my passphrase'}
                          </Button>
                        </div>
                      </SettingsRow>
                    </>
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <SettingsRow label={'Sync'} description={'Your current plan does not include sync.'}>
              <span className="text-sm text-[var(--text-secondary)]">Unavailable</span>
            </SettingsRow>
          )}
        </SettingsCard>
      </div>

      {activeDialog === 'enrol' ? (
        <EncryptionEnrolmentDialog
          isOpen={true}
          onComplete={() => {
            setActiveDialog(null);
            setToggleState(syncEncryptionService.enabled);
            rerender();
          }}
          onCancel={() => {
            setActiveDialog(null);
            setToggleState(syncEncryptionService.enabled);
            rerender();
          }}
        />
      ) : activeDialog === 'unlock' ? (
        <PassphraseDialog
          isOpen={true}
          title={'Encrypted Sync'}
          description={'Enter your passphrase to unlock the cached encryption key on this device.'}
          onComplete={() => {
            setActiveDialog(null);
            rerender();
          }}
          onCancel={() => setActiveDialog(null)}
          onForgot={() => setActiveDialog('recover')}
        />
      ) : activeDialog === 'rotate' ? (
        <RotatePassphraseDialog
          isOpen={true}
          onComplete={() => {
            setActiveDialog(null);
            rerender();
          }}
          onCancel={() => setActiveDialog(null)}
        />
      ) : activeDialog === 'phrase' ? (
        <RecoveryPhraseDialog
          isOpen={true}
          onComplete={() => {
            setActiveDialog(null);
            rerender();
          }}
          onCancel={() => setActiveDialog(null)}
        />
      ) : activeDialog === 'recover' ? (
        <RecoverWithMnemonicDialog
          isOpen={true}
          onComplete={() => {
            setActiveDialog(null);
            rerender();
          }}
          onCancel={() => setActiveDialog(null)}
        />
      ) : activeDialog === 'disable' ? (
        <DisableE2eeDialog
          isOpen={true}
          onComplete={() => {
            setActiveDialog(null);
            setToggleState(syncEncryptionService.enabled);
            rerender();
          }}
          onCancel={() => {
            setActiveDialog(null);
            setToggleState(syncEncryptionService.enabled);
            rerender();
          }}
        />
      ) : null}
    </div>
  );
}
