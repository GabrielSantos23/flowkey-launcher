import React, { useState } from 'react';
import SettingsCard from '../../../components/settings/SettingsCard';
import SettingsRow from '../../../components/settings/SettingsRow';
import { Toggle } from '../../../components/react/Inputs';
import SegmentedControl from '../../../components/base/SegmentedControl';
import type { SettingsHandler } from '../settingsHandlers';
import ScheduledTasksSection from '../../../components/settings/ScheduledTasksSection';
import RuntimesSection from '../../../components/settings/RuntimesSection';
import {
  snippetService,
  enabledPersistence,
} from '../../../built-in-features/snippets/snippetService';

type EscapeBehavior = 'hide-and-reset' | 'go-back' | 'close-window';

export interface AdvancedTabProps {
  handler: SettingsHandler;
}

export default function AdvancedTab({ handler }: AdvancedTabProps) {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const [snippetsEnabled, setSnippetsEnabled] = useState(enabledPersistence.loadSync(true));
  const [snippetsToggleError, setSnippetsToggleError] = useState<string | null>(null);

  const toggleSnippets = async () => {
    setSnippetsToggleError(null);
    const next = !snippetsEnabled;
    try {
      await snippetService.setEnabled(next);
      setSnippetsEnabled(next);
    } catch (e) {
      setSnippetsToggleError((e as Error).message || 'Failed to update snippets state');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          {'Extension surface'}
        </div>
        <SettingsCard>
          <div id="advanced-extension-surface">
            <SettingsRow
              label={'Extension results in search'}
              description={'Allow extensions to contribute results in the search bar.'}
            >
              <Toggle
                checked={handler.settings.search?.enableExtensionSearch ?? false}
                onChange={() => {
                  handler.handleExtensionSearchToggle();
                  rerender();
                }}
              />
            </SettingsRow>
            <SettingsRow
              label={'Extension actions in ⌘K'}
              description={"When off, only Flowkey's built-in actions appear in the action panel."}
            >
              <Toggle
                checked={handler.settings.search?.allowExtensionActions ?? false}
                onChange={() => {
                  handler.handleExtensionActionsToggle();
                  rerender();
                }}
              />
            </SettingsRow>
            <SettingsRow
              label={'Auto-update extensions'}
              description={'Updates install silently in the background.'}
            >
              <Toggle
                checked={handler.settings.extensions?.autoUpdate !== false}
                onChange={() => {
                  handler.handleExtensionAutoUpdateToggle();
                  rerender();
                }}
              />
            </SettingsRow>
          </div>
        </SettingsCard>
      </div>

      <div>
        <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          {'Input'}
        </div>
        <SettingsCard>
          <div id="advanced-input">
            <SettingsRow label={'Escape key'} description={'What Escape does inside the launcher.'}>
              <SegmentedControl
                options={[
                  { value: 'hide-and-reset', label: 'Reset Launcher' },
                  { value: 'go-back', label: 'Step Backwards' },
                  { value: 'close-window', label: 'Hide Window' },
                ]}
                value={handler.settings.general?.escapeInViewBehavior ?? 'go-back'}
                onchange={(v) => {
                  handler.updateEscapeBehavior(v as EscapeBehavior);
                  rerender();
                }}
              />
            </SettingsRow>
            <SettingsRow
              label={'Text expansion'}
              description={
                'Expand snippets as you type. Requires Accessibility permission on macOS.'
              }
            >
              <Toggle checked={snippetsEnabled} onChange={() => void toggleSnippets()} />
            </SettingsRow>
            <SettingsRow
              label={'Developer mode'}
              description={'Enables the extension inspector, verbose logging, and sideloading.'}
            >
              <Toggle
                checked={handler.settings.developer?.enabled ?? false}
                onChange={() => {
                  handler.handleDeveloperModeToggle();
                  rerender();
                }}
              />
            </SettingsRow>
          </div>
        </SettingsCard>
      </div>

      {snippetsToggleError ? (
        <div className="text-sm font-medium text-[var(--accent-danger)]">{snippetsToggleError}</div>
      ) : null}

      <ScheduledTasksSection />

      <RuntimesSection />

      {handler.saveError && handler.saveMessage ? (
        <div className="text-sm font-medium text-[var(--accent-danger)]">{handler.saveMessage}</div>
      ) : null}
    </div>
  );
}
