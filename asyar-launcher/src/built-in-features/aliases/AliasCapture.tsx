import React, { useState } from 'react';
import Modal from '../../components/base/Modal';
import { Button } from '../../components/react/Buttons';
import { Input, FormField } from '../../components/react/Inputs';
import ConfirmDialog from '../../components/base/ConfirmDialog';
import { validateAlias } from './aliasValidation';
import { aliasService } from './aliasService';
import { aliasStore } from './aliasStore';
import { logService } from '../../services/log/logService';

export interface AliasCaptureProps {
  objectId: string;
  itemName: string;
  itemType: 'application' | 'command';
  currentAlias?: string;
  onsave: () => void;
  oncancel: () => void;
}

export default function AliasCapture({
  objectId,
  itemName,
  itemType,
  currentAlias,
  onsave,
  oncancel,
}: AliasCaptureProps) {
  const [value, setValue] = useState(currentAlias ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAlias, setPendingAlias] = useState<string | null>(null);
  const [conflictName, setConflictName] = useState<string | null>(null);

  const reasonMessage = (reason: 'empty' | 'too-long' | 'invalid-chars'): string => {
    switch (reason) {
      case 'empty':
        return 'Please enter an alias.';
      case 'too-long':
        return 'Alias must be at most 10 characters.';
      case 'invalid-chars':
        return 'Alias may only contain lowercase letters and digits.';
    }
  };

  const commit = async (alias: string): Promise<void> => {
    setSaving(true);
    try {
      const created = await aliasService.register(objectId, alias, itemName, itemType);
      aliasStore.addOptimistic(created);
      onsave();
    } catch (e) {
      logService.error(`Failed to register alias '${alias}' for ${objectId}: ${e}`);
      setError('Failed to save alias. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const submitAlias = async (): Promise<void> => {
    if (saving) return;
    setError(null);
    const result = validateAlias(value);
    if (!result.ok) {
      setError(reasonMessage(result.reason));
      return;
    }
    const conflict = await aliasService.findConflict(result.normalized, objectId);
    if (conflict) {
      setPendingAlias(result.normalized);
      setConflictName(conflict.itemName);
      setConfirmOpen(true);
      return;
    }
    await commit(result.normalized);
  };

  const handleFormSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    void submitAlias();
  };

  const handleConfirmReassign = (): void => {
    if (pendingAlias) {
      const alias = pendingAlias;
      setPendingAlias(null);
      setConflictName(null);
      void commit(alias);
    }
  };

  const handleCancelReassign = (): void => {
    setPendingAlias(null);
    setConflictName(null);
  };

  return (
    <>
      <Modal
        isOpen={true}
        labelledBy="alias-capture-title"
        onEscape={oncancel}
        onEnter={submitAlias}
      >
        <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
          <div>
            <h2
              id="alias-capture-title"
              className="text-xl font-semibold text-[var(--text-primary)] m-0"
            >
              {currentAlias ? 'Change alias' : 'Assign alias'}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1 mb-0">{itemName}</p>
          </div>

          <FormField
            label={'Alias'}
            hint={'1–10 lowercase letters or digits'}
            error={error ?? undefined}
          >
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. c, s, app"
              disabled={saving}
              autoComplete="off"
              autoFocus
            />
          </FormField>

          <div className="flex justify-end gap-3 mt-2">
            <Button type="button" onClick={oncancel} disabled={saving}>
              {'Cancel'}
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirmOpen}
        title={'Reassign alias'}
        message={conflictName ? `'${conflictName}' already uses '${pendingAlias}'. Reassign?` : ''}
        confirmButtonText={'Reassign'}
        cancelButtonText={'Cancel'}
        onConfirm={handleConfirmReassign}
        onCancel={handleCancelReassign}
      />
    </>
  );
}
