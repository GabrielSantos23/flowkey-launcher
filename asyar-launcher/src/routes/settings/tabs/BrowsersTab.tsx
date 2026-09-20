import React, { useState, useEffect } from 'react';
import { EmptyState } from '../../../components/react/Feedback';
import SettingsCard from '../../../components/settings/SettingsCard';
import { Button } from '../../../components/react/Buttons';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { browserService } from '../../../services/browser/browserService';
import { feedbackService } from '../../../services/feedback/feedbackService';

import {
  browserListPendingPairings,
  browserResolvePairing,
  browserRevokePairing,
  type PendingPairing,
} from '../../../lib/ipc/settingsUiCommands';
import type { BrowserId, BrowserKey, BrowserFamily } from 'asyar-sdk/contracts';

type PairRequestEvent = { pairing_id: string; family: string; variant: string };

const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/clgmndlecfeilanhmiohfjmgfgilpjic';

export default function BrowsersTab() {
  const [, setAvailableBrowsers] = useState<BrowserId[]>([]);
  const [pairedBrowsers, setPairedBrowsers] = useState<BrowserKey[]>([]);
  const [pendingPairings, setPendingPairings] = useState<PendingPairing[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, boolean>>({});

  const familyKey = (family: string, variant: string): string => `${family}:${variant}`;

  const refresh = async () => {
    const avail = await browserService.listAvailableBrowsers(null);
    const paired = await browserService.listPairedBrowsers(null);
    const pending = (await browserListPendingPairings()) ?? [];
    const status: Record<string, boolean> = {};
    for (const fam of ['chromium', 'firefox', 'safari'] as const) {
      status[fam] = await browserService.isCompanionInstalled(null, fam as BrowserFamily);
    }
    setAvailableBrowsers(avail);
    setPairedBrowsers(paired);
    setPendingPairings(pending);
    setConnectionStatus(status);
  };

  const installChromiumCompanion = async () => {
    try {
      await openUrl(CHROME_STORE_URL);
    } catch (err) {
      feedbackService.report({
        source: 'frontend',
        kind: 'browser:settings.install-link-failed',
        severity: 'error',
        retryable: true,
        context: { message: err instanceof Error ? err.message : String(err) },
      });
    }
  };

  const resolve = async (id: string, decision: 'allow' | 'deny') => {
    const ok = await browserResolvePairing(id, decision);
    if (!ok) {
      feedbackService.report({
        source: 'frontend',
        kind: 'browser:settings.resolve-failed',
        severity: 'error',
        retryable: false,
        context: { message: 'browser_resolve_pairing failed' },
      });
      return;
    }
    await refresh();
  };

  const revoke = async (family: string, variant: string) => {
    const ok = await browserRevokePairing(family, variant);
    if (!ok) {
      feedbackService.report({
        source: 'frontend',
        kind: 'browser:settings.revoke-failed',
        severity: 'error',
        retryable: false,
        context: { message: 'browser_revoke_pairing failed' },
      });
      return;
    }
    await refresh();
  };

  useEffect(() => {
    void refresh();

    const unlisteners: Array<() => void> = [];
    Promise.all([
      listen<PairRequestEvent>('browser:pair-request', () => void refresh()),
      listen('browser:companion-connected', () => void refresh()),
      listen('browser:companion-disconnected', () => void refresh()),
    ]).then((fns) => {
      unlisteners.push(...fns);
    });

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Connected browsers'}
      </div>
      <div id="browsers-connected" className="flex flex-col gap-4">
        {pendingPairings.length > 0 ? (
          <SettingsCard>
            <div className="flex flex-col" data-testid="pending-list">
              {pendingPairings.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-4 border-b border-[var(--border-color)] last:border-b-0"
                >
                  <span className="flex-1 min-w-0 text-sm text-[var(--text-primary)]">
                    {p.family} · {p.variant}
                  </span>
                  <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                    {'Pending'}
                  </span>
                  <button
                    className="px-3 py-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-[var(--radius-md)] text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                    onClick={() => void resolve(p.id, 'allow')}
                    data-testid={`allow-${p.id}`}
                  >
                    {'Allow'}
                  </button>
                  <button
                    className="px-3 py-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-[var(--radius-md)] text-xs text-[var(--accent-danger)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                    onClick={() => void resolve(p.id, 'deny')}
                    data-testid={`deny-${p.id}`}
                  >
                    {'Deny'}
                  </button>
                </div>
              ))}
            </div>
          </SettingsCard>
        ) : null}

        {pairedBrowsers.length === 0 ? (
          <div className="flex flex-col" data-testid="paired-list">
            <EmptyState
              compact
              message={'No browsers paired yet'}
              description={
                "Install the Flowkey Companion extension below — once it's running, it pairs automatically and your browser shows up here."
              }
            />
          </div>
        ) : (
          <SettingsCard>
            <div className="flex flex-col" data-testid="paired-list">
              {pairedBrowsers.map((b) => {
                const key = familyKey(b.family, b.variant);
                const isConn = connectionStatus[b.family];
                return (
                  <div
                    key={key}
                    className="flex items-center gap-3 p-4 border-b border-[var(--border-color)] last:border-b-0"
                  >
                    <span className="flex-1 min-w-0 text-sm text-[var(--text-primary)]">
                      {b.family} · {b.variant}
                    </span>
                    <span
                      className={`text-xs ${isConn ? 'text-[var(--accent-success)]' : 'text-[var(--text-tertiary)]'}`}
                    >
                      {isConn ? 'Connected' : 'Offline'}
                    </span>
                    <button
                      className="px-3 py-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-[var(--radius-md)] text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                      onClick={() => void revoke(b.family, b.variant)}
                      data-testid={`revoke-${key}`}
                    >
                      {'Revoke'}
                    </button>
                  </div>
                );
              })}
            </div>
          </SettingsCard>
        )}
      </div>

      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Install companion'}
      </div>
      <div id="browsers-install">
        <SettingsCard>
          <div className="flex flex-col gap-3 p-6">
            <p className="m-0 text-sm text-[var(--text-secondary)] leading-relaxed">
              {
                "Flowkey's browser features need a small companion extension installed in your browser. The two work as a pair: the companion streams your open tabs, bookmarks, and history to Flowkey so you can search and control them from here. Install it, and it pairs with this launcher automatically."
              }
            </p>
            <div>
              <Button
                variant="primary"
                onClick={() => void installChromiumCompanion()}
                data-testid="install-chromium"
              >
                {'Install for Chrome'}
              </Button>
            </div>
            <p className="m-0 text-xs text-[var(--text-tertiary)] leading-relaxed">
              {
                'Works for Chrome, Brave, Edge, Arc, and Vivaldi. Firefox and Safari companions are coming soon.'
              }
            </p>
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}
