import React from 'react';
import SettingsCard from './SettingsCard';
import SettingsRow from './SettingsRow';
import { Toggle } from '../react/Inputs';
import { Badge } from '../react/Badge';
import { EmptyState } from '../react/Feedback';
import { secretRedactionService } from '../../services/privacy/secretRedactionService';

export default function SecretRedactionSection() {
  const totalRedacted = (Object.values(secretRedactionService.sessionStats) as number[]).reduce(
    (a: number, b: number) => a + b,
    0,
  );

  const toggleMaster = async (next: boolean) => {
    await secretRedactionService.setMasterEnabled(next);
  };

  const toggleClipboard = async (next: boolean) => {
    await secretRedactionService.setCategoryEnabled('clipboard', next);
  };

  const toggleSnippets = async (next: boolean) => {
    await secretRedactionService.setCategoryEnabled('snippets', next);
  };

  return (
    <div>
      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Enabled'}
      </div>
      <SettingsCard>
        <SettingsRow
          label={'Enabled'}
          description={
            'Master switch for redacting known secret formats before storage. Items still appear in history; the secret value is gone.'
          }
        >
          <Toggle checked={secretRedactionService.settings.master} onChange={toggleMaster} />
        </SettingsRow>

        <SettingsRow
          label={'Clipboard items'}
          description={'Detect and redact secrets in copied text, HTML, and RTF before storing.'}
        >
          <Toggle
            checked={secretRedactionService.settings.clipboard}
            disabled={!secretRedactionService.settings.master}
            onChange={toggleClipboard}
          />
        </SettingsRow>

        <SettingsRow
          label={'Snippets'}
          description={'Detect and redact secrets in snippet expansions on save.'}
        >
          <Toggle
            checked={secretRedactionService.settings.snippets}
            disabled={!secretRedactionService.settings.master}
            onChange={toggleSnippets}
          />
        </SettingsRow>

        <SettingsRow
          label={'This session'}
          description={'Number of redaction events since the launcher started.'}
        >
          <Badge text={`${totalRedacted} redacted`} variant="info" />
        </SettingsRow>

        <SettingsRow
          label={'Active detectors'}
          description={'The bundled rule catalog. Updating the catalog requires a launcher update.'}
        >
          {secretRedactionService.catalog.length === 0 ? (
            <EmptyState message={'No detectors loaded'} />
          ) : (
            <ul className="catalog list-none p-0 m-0 flex flex-col gap-2">
              {secretRedactionService.catalog.map((rule) => (
                <li key={rule.kind} className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {rule.kind}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">{rule.description}</span>
                </li>
              ))}
            </ul>
          )}
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}
