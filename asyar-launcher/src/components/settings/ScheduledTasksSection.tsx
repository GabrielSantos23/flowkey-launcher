import React, { useState, useEffect } from 'react';
import { getScheduledTasks, type ScheduledTaskInfo } from '../../lib/ipc/commands';
import SettingsCard from './SettingsCard';
import SettingsRow from './SettingsRow';
import { feedbackService } from '../../services/feedback/feedbackService';
import { logService } from '../../services/log/logService';

export default function ScheduledTasksSection() {
  const [tasks, setTasks] = useState<ScheduledTaskInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const formatInterval = (seconds: number): string => {
    if (seconds < 120) return `every ${seconds} seconds`;
    if (seconds < 7200) return `every ${Math.round(seconds / 60)} minutes`;
    if (seconds < 172800) return `every ${Math.round(seconds / 3600)} hours`;
    return `every ${Math.round(seconds / 86400)} days`;
  };

  const loadTasks = async () => {
    try {
      const list = (await getScheduledTasks()) ?? [];
      setTasks(list);
    } catch (e) {
      logService.error(`Failed to load scheduled tasks: ${e}`);
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'warning',
        retryable: false,
        context: { message: 'Could not load scheduled tasks list' },
      });
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTasks();
  }, []);

  if (isLoading || tasks.length === 0) return null;

  return (
    <div>
      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Scheduled Tasks'}
      </div>
      <SettingsCard>
        <div id="advanced-scheduled-tasks">
          {tasks.map((task) => (
            <SettingsRow
              key={task.extensionName + task.commandName}
              label={task.extensionName}
              description={`${task.commandName} · ${formatInterval(task.intervalSeconds)}`}
            >
              {task.active ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--accent-success)_12%,transparent)] text-[var(--accent-success)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {'Active'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--text-tertiary)_12%,transparent)] text-[var(--text-tertiary)]">
                  {'Paused'}
                </span>
              )}
            </SettingsRow>
          ))}
        </div>
      </SettingsCard>
    </div>
  );
}
