import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '../../components/react/Buttons';
import { Input } from '../../components/base/TextControls';
import Toggle from '../../components/base/Toggle';
import { EmptyState, LoadingState } from '../../components/react/Feedback';
import { Card } from '../../components/react/Card';
import { raycastImportState as state } from './raycastImportState';
import { setFocusLock } from '../../lib/ipc/commands';
import { logService } from '../../services/log/logService';

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export default function RaycastImportDefaultView() {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const pickFile = async () => {
    await setFocusLock(true);
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Raycast export', extensions: ['rayconfig', 'json'] }],
      });
      if (typeof selected === 'string') {
        await state.chooseFile(selected);
      }
    } catch (e) {
      logService.error(`Raycast import: file dialog error: ${e}`);
    } finally {
      await setFocusLock(false);
      rerender();
    }
  };

  const categories = [
    {
      key: 'snippets' as const,
      label: 'Snippets',
      count: state.bundle?.snippets.length ?? 0,
      hint: 'Keywords and text expansions',
    },
    {
      key: 'portals' as const,
      label: 'Quicklinks → Portals',
      count: state.bundle?.portals.length ?? 0,
      hint: '{argument} becomes {query}',
    },
    {
      key: 'shortcuts' as const,
      label: 'Hotkeys → Shortcuts',
      count: state.bundle?.shortcuts.length ?? 0,
      hint: 'App and quicklink hotkeys',
    },
    {
      key: 'aliases' as const,
      label: 'Aliases',
      count: state.bundle?.aliases.length ?? 0,
      hint: 'App and quicklink aliases',
    },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {state.phase === 'pick' ? (
          <EmptyState
            message={'Import from Raycast'}
            description={
              'Choose a .rayconfig file from Raycast’s “Export Settings & Data”, or a JSON file from “Export Snippets” / “Export Quicklinks”.'
            }
          >
            <Button variant="primary" onClick={() => void pickFile()} disabled={state.parsing}>
              Choose export file…
            </Button>
          </EmptyState>
        ) : state.phase === 'password' ? (
          <div className="flex flex-col gap-4 max-w-lg mx-auto">
            <p className="text-base font-semibold text-[var(--text-primary)]">
              This export is password-protected
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              Enter the password you set in Raycast when exporting{' '}
              {state.filePath ? `"${fileName(state.filePath)}"` : ''}.
            </p>
            <Input
              type="password"
              placeholder="Export password"
              value={state.password}
              onChange={(val) => {
                state.password = val;
                rerender();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void state.submitPassword().then(() => rerender());
                }
              }}
            />
            {state.passwordError && (
              <p className="text-xs text-red-500">Incorrect password — try again.</p>
            )}
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => {
                  state.reset();
                  rerender();
                }}
              >
                Back
              </Button>
              <Button
                variant="primary"
                onClick={() => void state.submitPassword().then(() => rerender())}
                disabled={!state.password || state.parsing}
              >
                Unlock
              </Button>
            </div>
          </div>
        ) : state.phase === 'preview' && state.bundle ? (
          <div className="flex flex-col gap-4 max-w-lg mx-auto">
            <p className="text-base font-semibold text-[var(--text-primary)]">
              Found in {state.filePath ? fileName(state.filePath) : 'export'}
            </p>
            <Card>
              {categories.map((category) => (
                <div
                  key={category.key}
                  className="flex items-center gap-4 py-3 border-b border-[var(--border-color)] last:border-b-0"
                >
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {category.label}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">{category.hint}</span>
                  </div>
                  <span className="text-sm font-semibold text-[var(--text-primary)] min-w-8 text-right">
                    {category.count}
                  </span>
                  <Toggle
                    checked={state.selection[category.key]}
                    onChange={(checked) => {
                      state.selection[category.key] = checked;
                      rerender();
                    }}
                    disabled={category.count === 0}
                  />
                </div>
              ))}
            </Card>
            {(state.bundle.skipped.hotkeys > 0 || state.bundle.skipped.aliases > 0) && (
              <p className="text-xs text-[var(--text-secondary)]">
                Not importable:
                {state.bundle.skipped.hotkeys > 0 &&
                  ` ${state.bundle.skipped.hotkeys} hotkey${state.bundle.skipped.hotkeys === 1 ? '' : 's'} bound to Raycast commands or missing apps`}
                {state.bundle.skipped.hotkeys > 0 && state.bundle.skipped.aliases > 0 && ', '}
                {state.bundle.skipped.aliases > 0 &&
                  ` ${state.bundle.skipped.aliases} alias${state.bundle.skipped.aliases === 1 ? '' : 'es'} bound to Raycast commands, missing apps, or with characters Flowkey can't use`}
                .
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => {
                  state.reset();
                  rerender();
                }}
              >
                Back
              </Button>
              <Button
                variant="primary"
                onClick={() => void state.runImport().then(() => rerender())}
                disabled={
                  !state.selection.snippets &&
                  !state.selection.portals &&
                  !state.selection.shortcuts &&
                  !state.selection.aliases
                }
              >
                Import
              </Button>
            </div>
          </div>
        ) : state.phase === 'importing' ? (
          <LoadingState message="Importing…" />
        ) : state.phase === 'error' ? (
          <div className="flex flex-col gap-4 max-w-lg mx-auto">
            <p className="text-base font-semibold text-[var(--text-primary)]">Import failed</p>
            <p className="text-xs text-red-500">{state.errorMessage}</p>
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => {
                  state.reset();
                  rerender();
                }}
              >
                Start over
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  state.backToPreview();
                  rerender();
                }}
              >
                Back to preview
              </Button>
            </div>
          </div>
        ) : state.phase === 'done' && state.summary ? (
          <EmptyState
            message={'Import complete'}
            description={'Duplicates already in Flowkey were skipped.'}
          >
            <div className="flex flex-col gap-2 mb-4 text-sm text-[var(--text-secondary)]">
              <span>
                Snippets: {state.summary.snippets.added} added, {state.summary.snippets.skipped}{' '}
                skipped
              </span>
              <span>
                Portals: {state.summary.portals.added} added, {state.summary.portals.skipped}{' '}
                skipped
              </span>
              <span>
                Shortcuts: {state.summary.shortcuts.added} added, {state.summary.shortcuts.skipped}{' '}
                skipped
              </span>
              <span>
                Aliases: {state.summary.aliases.added} added, {state.summary.aliases.skipped}{' '}
                skipped
              </span>
            </div>
            <Button
              variant="primary"
              onClick={() => {
                state.reset();
                rerender();
              }}
            >
              Import another file
            </Button>
          </EmptyState>
        ) : null}
      </div>
    </div>
  );
}
