import React, { useState, useEffect, useRef } from 'react';
import { emit } from '@tauri-apps/api/event';
import { Checkbox, Input } from '../../../components/react/Inputs';
import { Button } from '../../../components/react/Buttons';
import { WarningBanner } from '../../../components/react/Feedback';
import Modal from '../../../components/base/Modal';
import SettingsCard from '../../../components/settings/SettingsCard';
import SettingsRow from '../../../components/settings/SettingsRow';
import type { SettingsHandler } from '../settingsHandlers';
import { BackupHandler } from './backupHandler';

import type { ConflictStrategy } from '../../../services/profile/types';

export interface BackupTabProps {
  handler: SettingsHandler;
}

export default function BackupTab({ handler: _handler }: BackupTabProps) {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const backupRef = useRef<BackupHandler | null>(null);
  if (!backupRef.current) {
    backupRef.current = new BackupHandler();
  }
  const backup = backupRef.current;

  useEffect(() => {
    backup.init().then(() => rerender());
  }, []);

  const openRaycastImport = () => {
    void emit('open-raycast-import');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Backup'}
      </div>
      <div id="backup-export" className="scroll-mt-6">
        <SettingsCard>
          <div className="flex flex-col p-4 gap-3 border-b border-[var(--border-color)]">
            {backup.exportCategories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-2">
                <Checkbox
                  checked={backup.enabledCategories.has(cat.id)}
                  onChange={() => {
                    backup.toggleCategory(cat.id);
                    rerender();
                  }}
                  disabled={backup.exportStatus === 'exporting'}
                >
                  <span className="text-sm text-[var(--text-primary)]">{cat.label}</span>
                </Checkbox>
              </div>
            ))}
          </div>

          {backup.exportWarning ? (
            <div className="p-4">
              <WarningBanner message={backup.exportWarning} />
            </div>
          ) : null}

          <SettingsRow
            label={'Password (optional)'}
            description={'Encrypt sensitive fields in the export.'}
          >
            <Input
              id="export-password"
              type="password"
              placeholder={'Leave blank to strip sensitive fields'}
              value={backup.exportPassword}
              onChange={(e) => {
                backup.exportPassword = e.target.value;
                rerender();
              }}
            />
          </SettingsRow>

          <SettingsRow label={'Export backup'}>
            <div className="flex items-center gap-4">
              <Button
                onClick={() => {
                  backup.handleExport().then(() => rerender());
                }}
                disabled={
                  backup.exportStatus === 'exporting' || backup.enabledCategories.size === 0
                }
              >
                {backup.exportStatus === 'exporting' ? 'Exporting…' : 'Export…'}
              </Button>
              {backup.exportMessage ? (
                <span
                  className={`text-sm ${
                    backup.exportStatus === 'error'
                      ? 'text-[var(--accent-danger)]'
                      : 'text-[var(--accent-success)]'
                  }`}
                >
                  {backup.exportMessage}
                </span>
              ) : null}
            </div>
          </SettingsRow>
        </SettingsCard>
      </div>

      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Raycast'}
      </div>
      <div id="backup-raycast" className="scroll-mt-6">
        <SettingsCard>
          <SettingsRow
            label={'Migrate from Raycast'}
            description={'Snippets, quicklinks, and app hotkeys.'}
          >
            <div className="flex items-center gap-4">
              <Button onClick={openRaycastImport}>{'Import from Raycast…'}</Button>
            </div>
          </SettingsRow>
        </SettingsCard>
      </div>

      <div className="section-header text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
        {'Restore'}
      </div>
      <div id="backup-import" className="scroll-mt-6">
        <SettingsCard>
          <SettingsRow
            label={'Backup file'}
            description={'Choose an Flowkey backup archive to preview.'}
          >
            <div className="flex items-center gap-4">
              <Button
                onClick={() => {
                  backup.handleChooseFile().then(() => rerender());
                }}
                disabled={backup.importStatus === 'importing'}
              >
                {backup.importStatus === 'importing' && !backup.importNeedsPassword
                  ? 'Reading…'
                  : 'Choose Backup File…'}
              </Button>
              {backup.importMessage && !backup.importModalOpen ? (
                <span
                  className={`text-sm ${
                    backup.importStatus === 'error'
                      ? 'text-[var(--accent-danger)]'
                      : 'text-[var(--accent-success)]'
                  }`}
                >
                  {backup.importMessage}
                </span>
              ) : null}
            </div>
          </SettingsRow>

          {backup.importNeedsPassword ? (
            <>
              <SettingsRow label={'Password'} description={'Unlock the encrypted backup archive.'}>
                <div className="flex items-center gap-3">
                  <Input
                    type="password"
                    placeholder={'Backup password'}
                    value={backup.importPassword}
                    onChange={(e) => {
                      backup.importPassword = e.target.value;
                      rerender();
                    }}
                  />
                  <Button
                    onClick={() => {
                      backup.handleFileWithPassword().then(() => rerender());
                    }}
                    disabled={backup.importStatus === 'importing'}
                  >
                    {backup.importStatus === 'importing' ? 'Unlocking…' : 'Unlock'}
                  </Button>
                </div>
              </SettingsRow>
              {backup.importStatus === 'error' && backup.importMessage ? (
                <SettingsRow label={'Import error'}>
                  <span className="text-sm text-[var(--accent-danger)]">
                    {backup.importMessage}
                  </span>
                </SettingsRow>
              ) : null}
            </>
          ) : null}
        </SettingsCard>
      </div>

      {backup.importModalOpen && backup.importManifest ? (
        <Modal
          isOpen={true}
          title={'Restore from Backup'}
          subtitle={new Date(backup.importManifest.exportedAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
          onEscape={() => {
            backup.closeImportModal();
            rerender();
          }}
          actions={
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => {
                  backup.closeImportModal();
                  rerender();
                }}
              >
                {'Cancel'}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  backup.handleImport().then(() => rerender());
                }}
                disabled={backup.importStatus === 'importing'}
              >
                {backup.importStatus === 'importing' ? 'Restoring…' : 'Restore'}
              </Button>
            </div>
          }
        >
          <div className="max-h-80 overflow-y-auto flex flex-col">
            {backup.importManifest.categories.map((cat) => {
              const catState = backup.importCategories.get(cat.id);
              const preview = backup.importPreviewData.get(cat.id);
              if (!catState) return null;

              return (
                <div
                  key={cat.id}
                  className="flex items-center gap-3 py-3 border-b border-[var(--border-color)] last:border-b-0"
                >
                  <Checkbox
                    checked={catState.enabled}
                    onChange={() => {
                      const current = backup.importCategories.get(cat.id);
                      if (current) {
                        backup.importCategories.set(cat.id, {
                          ...current,
                          enabled: !current.enabled,
                        });
                        rerender();
                      }
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--text-primary)]">
                      {cat.displayName}
                    </div>
                    {preview ? (
                      <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Local: {preview.localCount} → Incoming: {preview.incomingCount}
                        {preview.conflicts > 0 ? (
                          <span className="text-[var(--accent-warning)]">
                            {' '}
                            · {preview.conflicts} conflicts
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <select
                    value={catState.strategy}
                    disabled={!catState.enabled}
                    onChange={(e) => {
                      const current = backup.importCategories.get(cat.id);
                      if (current) {
                        backup.importCategories.set(cat.id, {
                          ...current,
                          strategy: e.target.value as ConflictStrategy,
                        });
                        rerender();
                      }
                    }}
                    className="px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm text-[var(--text-primary)] cursor-pointer disabled:text-[var(--text-tertiary)] disabled:cursor-not-allowed"
                  >
                    <option value="merge">{'Merge'}</option>
                    <option value="replace">{'Replace'}</option>
                    <option value="skip">{'Skip'}</option>
                  </select>
                </div>
              );
            })}
          </div>

          {backup.importStatus === 'error' && backup.importMessage ? (
            <p className="mt-3 text-sm text-[var(--accent-danger)]">{backup.importMessage}</p>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}
