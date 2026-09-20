import React, { useState, useEffect } from 'react';
import SettingsCard from './SettingsCard';
import SettingsRow from './SettingsRow';
import { runtimeService } from '../../services/runtime/runtimeService';
import { describeRuntimeRemovalWarning } from '../../services/runtime/runtimeRemovalGuard';
import { formatBytes } from '../../services/action/actionService';
import { feedbackService } from '../../services/feedback/feedbackService';
import { logService } from '../../services/log/logService';
import type { InstalledRuntimeInfo } from '../../lib/ipc/runtimeCommands';

export default function RuntimesSection() {
  const [runtimes, setRuntimes] = useState<InstalledRuntimeInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [removingName, setRemovingName] = useState<string | null>(null);

  const loadRuntimes = async () => {
    try {
      const list = await runtimeService.list();
      setRuntimes(list);
    } catch (e) {
      logService.error(`Failed to load installed runtimes: ${e}`);
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'warning',
        retryable: false,
        context: { message: 'Could not load installed runtimes list' },
      });
      setRuntimes([]);
    } finally {
      setIsLoading(false);
    }
  };

  const removeRuntime = async (name: string) => {
    setRemovingName(name);
    try {
      const consumers = await runtimeService.consumersOf(name);
      const warning = describeRuntimeRemovalWarning(consumers);
      if (warning) {
        const confirmed = await feedbackService.confirmAlert({
          title: 'Remove Runtime',
          message: warning,
          confirmText: 'Remove Anyway',
          variant: 'danger',
        });
        if (!confirmed) return;
      }
      await runtimeService.remove(name);
      await loadRuntimes();
    } catch (e) {
      logService.error(`Failed to remove runtime "${name}": ${e}`);
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'error',
        retryable: false,
        context: { message: `Could not remove runtime "${name}"` },
      });
    } finally {
      setRemovingName(null);
    }
  };

  useEffect(() => {
    void loadRuntimes();
  }, []);

  if (isLoading || runtimes.length === 0) return null;

  return (
    <div>
      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Installed Runtimes'}
      </div>
      <SettingsCard>
        {runtimes.map((runtime) => (
          <SettingsRow
            key={runtime.name + runtime.version}
            label={runtime.name}
            description={`v${runtime.version} · ${formatBytes(runtime.sizeBytes)}`}
          >
            <button
              className="text-xs text-[var(--accent-danger)] bg-transparent border-0 cursor-pointer p-0 hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => removeRuntime(runtime.name)}
              disabled={removingName === runtime.name}
            >
              {removingName === runtime.name ? 'Removing…' : 'Remove'}
            </button>
          </SettingsRow>
        ))}
      </SettingsCard>
    </div>
  );
}
