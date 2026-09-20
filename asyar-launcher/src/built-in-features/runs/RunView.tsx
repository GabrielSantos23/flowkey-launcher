import React, { useEffect, useState, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import SplitView from '../../components/layout/SplitView';
import ListItem from '../../components/list/ListItem';
import { EmptyState } from '../../components/react/Feedback';
import { Button } from '../../components/react/Buttons';
import StatusDot from '../../components/status/StatusDot';
import { runService } from '../../services/run/runService';
import { formatRunSubtitle } from './runViewLogic';
import { invokeSafe } from '../../lib/ipc/invokeSafe';
import { scrollSelectedIntoView, resetListScroll } from '../../lib/listScroll';
import type { Run } from 'asyar-sdk/contracts';

function statusDotColor(status: Run['status']): 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'running':
      return 'info';
    case 'succeeded':
      return 'success';
    case 'failed':
      return 'danger';
    case 'cancelled':
      return 'warning';
    default:
      return 'info';
  }
}

export default function RunView() {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const [outputLines, setOutputLines] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);

  const combinedRuns = runService.combined;
  const selectedRun = combinedRuns.find((r) => r.id === runService.selectedRunId) ?? null;
  const selectedIndex = runService.selectedRunId
    ? combinedRuns.findIndex((r) => r.id === runService.selectedRunId)
    : -1;

  useEffect(() => {
    void runService.loadHistory().then(() => rerender());
    let outputUnlisten: UnlistenFn | null = null;
    listen<{ id: string; line: string }>('runs:output', (ev) => {
      if (ev.payload.id === runService.selectedRunId) {
        setOutputLines((prev) => [...prev, ev.payload.line]);
      }
    }).then((unlisten) => {
      outputUnlisten = unlisten;
    });

    return () => {
      outputUnlisten?.();
    };
  }, []);

  useEffect(() => {
    const run = selectedRun;
    if (!run) {
      setOutputLines([]);
      return;
    }
    invokeSafe<string[]>('runs_get_output', { id: run.id }).then((lines) => {
      setOutputLines(lines ?? []);
    });
  }, [selectedRun?.id]);

  useEffect(() => {
    if (!listRef.current) return;
    if (selectedIndex >= 0) {
      scrollSelectedIntoView(listRef.current, selectedIndex);
    } else {
      resetListScroll(listRef.current);
    }
  }, [selectedIndex]);

  const handleSelectRun = (id: string) => {
    runService.selectedRunId = id;
    rerender();
  };

  const handleCancel = async () => {
    if (selectedRun && selectedRun.status === 'running' && selectedRun.cancellable) {
      await runService.cancelById(selectedRun.id);
      rerender();
    }
  };

  return (
    <SplitView
      left={
        <div className="flex flex-col p-2 h-full overflow-y-auto custom-scrollbar" ref={listRef}>
          {combinedRuns.map((run, index) => (
            <ListItem
              key={run.id}
              data-index={index}
              selected={run.id === runService.selectedRunId}
              title={run.label}
              subtitle={formatRunSubtitle(run)}
              onClick={() => handleSelectRun(run.id)}
              leading={<StatusDot variant={statusDotColor(run.status)} />}
            />
          ))}
          {combinedRuns.length === 0 && (
            <EmptyState
              message={'No runs yet'}
              description={'Runs from AI chat or shell scripts will appear here.'}
            />
          )}
        </div>
      }
      right={
        <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto custom-scrollbar">
          {selectedRun ? (
            <>
              <div className="flex flex-col gap-1">
                <div className="text-base font-semibold text-[var(--text-primary)]">
                  {selectedRun.label}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {formatRunSubtitle(selectedRun)}
                </div>
              </div>

              {selectedRun.cancellable && selectedRun.status === 'running' && (
                <div className="flex gap-2">
                  <Button onClick={() => void handleCancel()}>Cancel</Button>
                </div>
              )}

              {outputLines.length > 0 ? (
                <div className="font-mono text-xs text-[var(--text-primary)] bg-[var(--bg-secondary)] rounded-[var(--radius-md)] p-3 flex-1 overflow-y-auto flex flex-col gap-1 custom-scrollbar">
                  {outputLines.map((line, i) => (
                    <div key={i} className="whitespace-pre-wrap break-all leading-relaxed">
                      {line}
                    </div>
                  ))}
                </div>
              ) : selectedRun.status === 'failed' ? (
                <div className="flex-1 flex flex-col gap-4 bg-[var(--bg-secondary)] rounded-[var(--radius-md)] p-4">
                  <div className="flex items-center gap-2 font-semibold">
                    <span>❌</span>
                    <span className="text-base text-red-500">Execution Failed</span>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="text-xs text-[var(--text-secondary)]">
                      The execution failed or returned an error:
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-[var(--radius-md)] p-3 text-red-500 font-mono text-xs whitespace-pre-wrap break-all leading-relaxed">
                      {selectedRun.errorMessage || 'Script exited with non-zero status.'}
                    </div>
                  </div>
                </div>
              ) : selectedRun.status === 'succeeded' ? (
                <div className="flex-1 flex flex-col gap-4 bg-[var(--bg-secondary)] rounded-[var(--radius-md)] p-4">
                  <div className="flex items-center gap-2 font-semibold">
                    <span>✅</span>
                    <span className="text-base text-green-500">Finished Successfully</span>
                  </div>
                  <div className="flex flex-col gap-3">
                    {selectedRun.endedAt && selectedRun.startedAt ? (
                      <div className="text-xs text-[var(--text-secondary)]">
                        Process successfully completed in{' '}
                        {((selectedRun.endedAt - selectedRun.startedAt) / 1000).toFixed(2)} seconds.
                      </div>
                    ) : (
                      <div className="text-xs text-[var(--text-secondary)]">
                        Execution successful. The script terminated without printing any output to
                        standard out.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <EmptyState
                  message={'No output yet'}
                  description={
                    selectedRun.status === 'running'
                      ? 'Output will appear as it streams.'
                      : 'Output has been dismissed.'
                  }
                />
              )}
            </>
          ) : (
            <EmptyState
              message={'Select a run'}
              description={'Choose a run from the left to see its details.'}
            />
          )}
        </div>
      }
    />
  );
}
