import React, { useState } from 'react';
import SettingsCard from './SettingsCard';
import SettingsRow from './SettingsRow';
import { Badge } from '../react/Badge';
import { Button } from '../react/Buttons';
import { Input } from '../react/Inputs';
import { EmptyState } from '../react/Feedback';
import { clipboardPrivacyService } from '../../services/privacy/clipboardPrivacyService';

export default function ClipboardPrivacySection() {
  const [newEntry, setNewEntry] = useState('');

  const totalSkipped = (Object.values(clipboardPrivacyService.sessionStats) as number[]).reduce(
    (a: number, b: number) => a + b,
    0,
  );

  const handleAdd = async () => {
    const trimmed = newEntry.trim();
    if (!trimmed) return;
    await clipboardPrivacyService.addToDenylist(trimmed);
    setNewEntry('');
  };

  return (
    <div>
      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Clipboard items'}
      </div>

      <SettingsCard>
        <SettingsRow
          label="Items Filtered This Session"
          description="Total clipboard captures skipped by privacy rules"
        >
          <Badge variant="default">{totalSkipped}</Badge>
        </SettingsRow>

        <SettingsRow
          label="Denylist Patterns"
          description="App bundles or patterns to exclude from clipboard history"
        >
          <div className="space-y-3 w-full max-w-md">
            <div className="flex gap-2">
              <Input
                value={newEntry}
                onValueChange={setNewEntry}
                placeholder="Bundle ID or regex pattern"
              />
              <Button onClick={handleAdd}>Add</Button>
            </div>

            <div className="space-y-1">
              {clipboardPrivacyService.userDenylist.length === 0 ? (
                <EmptyState message="No patterns defined" />
              ) : (
                clipboardPrivacyService.userDenylist.map((pattern) => (
                  <div
                    key={pattern}
                    className="flex items-center justify-between p-2 rounded-[var(--radius-md)] bg-[var(--bg-secondary)]"
                  >
                    <span className="font-mono text-sm">{pattern}</span>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => clipboardPrivacyService.removeFromDenylist(pattern)}
                    >
                      Remove
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}
