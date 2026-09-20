import React, { useEffect, useState, useRef } from 'react';
import { scriptsManager } from './scriptsManager';
import { runSelectedScript } from './runSelected';
import { viewManager } from '../../services/extension/viewManager';
import { commandArgumentsService } from '../../services/search/commandArguments';
import SplitView from '../../components/layout/SplitView';
import LauncherListRow from '../../components/list/LauncherListRow';
import { Badge } from '../../components/react/Badge';
import { Card } from '../../components/react/Card';
import { EmptyState } from '../../components/react/Feedback';
import { scrollSelectedIntoView, resetListScroll } from '../../lib/listScroll';
import { isAnyModalOpen } from '../../components/base/Modal.logic';
import type { ScriptScanIssueReason } from './types';

function issueLabel(reason: ScriptScanIssueReason): string {
  switch (reason) {
    case 'directoryUnreadable':
      return 'Directory unavailable';
    case 'metadataUnreadable':
      return 'Metadata unavailable';
    case 'pathUnavailable':
      return 'Path unavailable';
    case 'notExecutable':
      return 'Not executable';
    case 'contentUnreadable':
      return 'Unreadable';
    case 'invalidHeader':
      return 'Invalid header';
  }
}

export default function ScriptLibraryView() {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const listContainerRef = useRef<HTMLDivElement | null>(null);

  const scripts = scriptsManager.scripts;
  const issues = scriptsManager.issues;
  const selectedScript = scriptsManager.selectedScript;
  const selectedIssue = scriptsManager.selectedIssue;

  const primaryActionLabel = selectedScript
    ? 'Run Script'
    : selectedIssue?.fix === 'makeExecutable'
      ? 'Make Executable'
      : null;

  useEffect(() => {
    viewManager.activeViewPrimaryActionLabel = primaryActionLabel;
    return () => {
      if (viewManager.activeViewPrimaryActionLabel === primaryActionLabel) {
        viewManager.activeViewPrimaryActionLabel = null;
      }
    };
  }, [primaryActionLabel]);

  useEffect(() => {
    const selectedId = scriptsManager.selectedEntryId;
    if (!listContainerRef.current) return;

    let selectedIndex = -1;
    if (selectedId?.startsWith('script:')) {
      const scriptId = selectedId.replace('script:', '');
      selectedIndex = scripts.findIndex((s) => s.dynamicId === scriptId);
    } else if (selectedId?.startsWith('issue:')) {
      const issuePath = selectedId.replace('issue:', '');
      const issueIdx = issues.findIndex((i) => i.absolutePath === issuePath);
      selectedIndex = issueIdx >= 0 ? scripts.length + issueIdx : -1;
    }

    if (selectedIndex >= 0) {
      scrollSelectedIntoView(listContainerRef.current, selectedIndex);
    } else {
      resetListScroll(listContainerRef.current);
    }
  }, [scriptsManager.selectedEntryId, scripts.length, issues.length]);

  useEffect(() => {
    const handleWindowKeydown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector('.action-popup') || isAnyModalOpen(document)) return;
      if (commandArgumentsService.active) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable]')) {
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        scriptsManager.moveSelection(event.key === 'ArrowDown' ? 1 : -1);
        event.preventDefault();
        event.stopPropagation();
        rerender();
        return;
      }
      if (event.key === 'Enter') {
        if (selectedScript) {
          void runSelectedScript();
        } else if (selectedIssue?.fix === 'makeExecutable') {
          void scriptsManager.makeSelectedExecutable();
        } else {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleWindowKeydown, true);
    return () => window.removeEventListener('keydown', handleWindowKeydown, true);
  }, [selectedScript, selectedIssue]);

  return (
    <SplitView
      leftWidth="38%"
      left={
        <div
          className="h-full p-2 overflow-y-auto custom-scrollbar"
          ref={listContainerRef}
          role="listbox"
          aria-label="Scripts and issues"
        >
          {scripts.length === 0 && issues.length === 0 ? (
            <EmptyState
              message={'No scripts found'}
              description={'Executable files from watched directories appear here.'}
            />
          ) : (
            <>
              {scripts.length > 0 &&
                scripts.map((script, index) => {
                  const prev = scripts[index - 1];
                  const showHeader = index === 0 || prev?.directoryPath !== script.directoryPath;
                  return (
                    <React.Fragment key={script.dynamicId}>
                      {showHeader && (
                        <div
                          className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] px-3 py-2 truncate"
                          title={script.directoryPath}
                        >
                          {script.directoryPath}
                        </div>
                      )}
                      <LauncherListRow
                        data-index={index}
                        title={script.displayName}
                        subtitle={script.fileName}
                        selected={scriptsManager.selectedEntryId === `script:${script.dynamicId}`}
                        onClick={() => {
                          scriptsManager.selectEntry(`script:${script.dynamicId}`);
                          rerender();
                        }}
                      />
                    </React.Fragment>
                  );
                })}

              {issues.length > 0 && (
                <>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] px-3 py-2">
                    Issues
                  </div>
                  {issues.map((issue, index) => {
                    const prev = issues[index - 1];
                    const showHeader = index === 0 || prev?.directoryPath !== issue.directoryPath;
                    return (
                      <React.Fragment key={issue.absolutePath}>
                        {showHeader && (
                          <div
                            className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] px-3 py-2 truncate"
                            title={issue.directoryPath}
                          >
                            {issue.directoryPath}
                          </div>
                        )}
                        <LauncherListRow
                          data-index={scripts.length + index}
                          title={issue.fileName}
                          subtitle={issue.message}
                          selected={
                            scriptsManager.selectedEntryId === `issue:${issue.absolutePath}`
                          }
                          onClick={() => {
                            scriptsManager.selectEntry(`issue:${issue.absolutePath}`);
                            rerender();
                          }}
                        />
                      </React.Fragment>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      }
      right={
        selectedScript ? (
          <div className="h-full overflow-y-auto custom-scrollbar p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center text-xl shrink-0">
                📜
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold text-[var(--text-primary)] truncate">
                  {selectedScript.displayName}
                </div>
                <div className="text-xs font-mono text-[var(--text-tertiary)] truncate">
                  {selectedScript.absolutePath}
                </div>
              </div>
              <Badge text={selectedScript.header.mode} variant="default" />
            </div>

            <Card title="Configuration">
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-4 text-sm">
                <dt className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">
                  File
                </dt>
                <dd className="font-mono break-all text-[var(--text-primary)]">
                  {selectedScript.fileName}
                </dd>
                <dt className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">
                  Directory
                </dt>
                <dd className="font-mono break-all text-[var(--text-primary)]">
                  {selectedScript.directoryPath}
                </dd>
                <dt className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">
                  Arguments
                </dt>
                <dd className="text-[var(--text-primary)]">
                  {selectedScript.header.arguments.length === 0 ? (
                    'None'
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedScript.header.arguments.map((argument) => (
                        <Badge key={argument.name} text={argument.name} mono bordered />
                      ))}
                    </div>
                  )}
                </dd>
                {selectedScript.header.mode === 'inline' && (
                  <>
                    <dt className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">
                      Refresh
                    </dt>
                    <dd className="text-[var(--text-primary)]">
                      {selectedScript.header.refreshTimeSeconds
                        ? `${selectedScript.header.refreshTimeSeconds}s`
                        : 'Manual'}
                    </dd>
                  </>
                )}
              </dl>
            </Card>
          </div>
        ) : selectedIssue ? (
          <div className="h-full overflow-y-auto custom-scrollbar p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center text-xl shrink-0">
                ⚠️
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold text-[var(--text-primary)] truncate">
                  {selectedIssue.fileName}
                </div>
                <div className="text-xs font-mono text-[var(--text-tertiary)] truncate">
                  {selectedIssue.directoryPath}
                </div>
              </div>
              <Badge text={issueLabel(selectedIssue.reason)} variant="warning" />
            </div>

            <div className="p-4 rounded-[var(--radius-md)] bg-amber-500/10 border border-amber-500/20 text-amber-500">
              <div className="font-semibold">{issueLabel(selectedIssue.reason)}</div>
              <div className="text-xs mt-1 text-[var(--text-secondary)]">
                {selectedIssue.message}
              </div>
            </div>

            <div className="mt-6">
              <Card title="File">
                <div className="font-mono break-all text-sm text-[var(--text-primary)]">
                  {selectedIssue.absolutePath}
                </div>
              </Card>
            </div>
          </div>
        ) : (
          <EmptyState message={'Select a script or issue'} />
        )
      }
    />
  );
}
