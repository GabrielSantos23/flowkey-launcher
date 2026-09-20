import React, { useState, useEffect } from 'react';
import { Button } from '../react/Buttons';
import { EmptyState } from '../react/Feedback';
import SettingsCard from './SettingsCard';
import {
  shellListTrusted,
  shellRevokeTrust,
  discoverExtensions,
  type TrustedBinary,
} from '../../lib/ipc/commands';
import { feedbackService } from '../../services/feedback/feedbackService';
import { logService } from '../../services/log/logService';

interface GroupedTrust {
  extensionId: string;
  extensionName: string;
  extensionIcon?: string;
  binaries: TrustedBinary[];
}

export default function ShellTrustManager() {
  const [groupedTrusts, setGroupedTrusts] = useState<GroupedTrust[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadTrustData = async () => {
    setIsLoading(true);
    try {
      const allRecords = (await discoverExtensions()) ?? [];
      const recordsWithShell = allRecords.filter((r) =>
        r.manifest.permissions?.includes('shell:spawn'),
      );

      if (recordsWithShell.length === 0) {
        setGroupedTrusts([]);
        setIsLoading(false);
        return;
      }

      const results: GroupedTrust[] = [];

      for (const record of recordsWithShell) {
        try {
          const binaries = await shellListTrusted(record.manifest.id);
          if (binaries && binaries.length > 0) {
            results.push({
              extensionId: record.manifest.id,
              extensionName: record.manifest.name,
              extensionIcon: record.manifest.icon
                ? `asyar-icon://${record.manifest.id}/${record.manifest.icon}`
                : undefined,
              binaries: binaries.sort((a, b) => b.trustedAt - a.trustedAt),
            });
          }
        } catch (e) {
          logService.error(`Failed to load trust for ${record.manifest.id}: ${e}`);
        }
      }

      setGroupedTrusts(results);
    } catch (e) {
      logService.error(`Failed to load extension records: ${e}`);
    } finally {
      setIsLoading(false);
    }
  };

  const revokeTrust = async (extensionId: string, binaryPath: string) => {
    try {
      await shellRevokeTrust(extensionId, binaryPath);
      setGroupedTrusts((prev) =>
        prev
          .map((group) => {
            if (group.extensionId === extensionId) {
              return {
                ...group,
                binaries: group.binaries.filter((b) => b.binaryPath !== binaryPath),
              };
            }
            return group;
          })
          .filter((group) => group.binaries.length > 0),
      );
    } catch (e) {
      logService.error(`Failed to revoke shell trust for ${extensionId} (${binaryPath}): ${e}`);
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'error',
        retryable: false,
        context: { message: `Could not revoke shell trust for ${binaryPath}` },
      });
    }
  };

  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  };

  useEffect(() => {
    void loadTrustData();
  }, []);

  return (
    <div>
      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Shell trust'}
      </div>
      <SettingsCard>
        <div className="shell-trust-content flex flex-col gap-5 p-6">
          {isLoading ? (
            <p className="trust-note text-sm text-[var(--text-secondary)]">
              {'Loading trusted programs...'}
            </p>
          ) : groupedTrusts.length > 0 ? (
            <>
              <p className="trust-note text-sm text-[var(--text-secondary)] leading-relaxed">
                {
                  'The following programs have been explicitly trusted for execution by specific extensions. Revoking trust will cause the extension to prompt for permission again on next use.'
                }
              </p>

              <div className="trust-groups flex flex-col gap-6">
                {groupedTrusts.map((group) => (
                  <div key={group.extensionId} className="trust-group flex flex-col gap-3">
                    <div className="trust-group-header flex items-center gap-3 min-w-0">
                      {group.extensionIcon ? (
                        <img
                          src={group.extensionIcon}
                          alt=""
                          className="w-5 h-5 rounded-[var(--radius-sm)] shrink-0"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-[var(--radius-sm)] shrink-0 flex items-center justify-center bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-[10px] font-semibold">
                          {group.extensionName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {group.extensionName}
                      </span>
                      <span className="text-xs font-mono text-[var(--text-tertiary)] truncate">
                        {group.extensionId}
                      </span>
                    </div>

                    <div className="trust-binaries grid gap-2 pl-8">
                      {group.binaries.map((binary) => (
                        <div
                          key={binary.binaryPath}
                          className="trust-binary-row flex items-center justify-between gap-4 p-3 border border-[var(--separator)] rounded-[var(--radius-md)] bg-[var(--bg-secondary)] hover:border-[var(--border-color)]"
                        >
                          <div className="trust-binary-text flex flex-col gap-0.5 min-w-0">
                            <span
                              className="text-xs font-mono text-[var(--accent-primary)] truncate"
                              title={binary.binaryPath}
                            >
                              {binary.binaryPath}
                            </span>
                            <span className="text-xs text-[var(--text-tertiary)]">
                              Trusted {formatRelativeTime(binary.trustedAt)}
                            </span>
                          </div>

                          <Button onClick={() => revokeTrust(group.extensionId, binary.binaryPath)}>
                            {'Revoke'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              compact
              message={'No trusted programs'}
              description={
                'When an extension runs a binary, or you approve its declared binaries at install, they will appear here.'
              }
            />
          )}
        </div>
      </SettingsCard>
    </div>
  );
}
