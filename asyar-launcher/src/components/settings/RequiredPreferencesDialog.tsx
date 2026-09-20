import React, { useState } from 'react';
import Modal from '../base/Modal';
import { Button } from '../react/Buttons';
import type { PreferenceDeclaration } from 'asyar-sdk/contracts';
import ExtensionPreferencesForm from './ExtensionPreferencesForm';

export interface RequiredPreferencesDialogProps {
  extensionId: string;
  commandId: string;
  missing: PreferenceDeclaration[];
  onSave: (values: Record<string, unknown>) => void | Promise<void>;
  onCancel: () => void;
}

export default function RequiredPreferencesDialog({
  extensionId,
  commandId,
  missing,
  onSave,
  onCancel,
}: RequiredPreferencesDialogProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [isSaving, setIsSaving] = useState(false);

  const isComplete = missing.every((p) => {
    const v = values[p.name];
    if (p.type === 'checkbox') return typeof v === 'boolean';
    if (p.type === 'number') return typeof v === 'number' && Number.isFinite(v);
    return v !== undefined && v !== null && v !== '';
  });

  const handleChange = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!isComplete || isSaving) return;
    setIsSaving(true);
    try {
      await onSave(values);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      labelledBy="required-prefs-title"
      onEscape={() => {
        if (!isSaving) onCancel();
      }}
      onEnter={handleSave}
      actions={
        <>
          <Button disabled={isSaving} onClick={onCancel}>
            {'Cancel'}
          </Button>
          <Button variant="primary" disabled={!isComplete || isSaving} onClick={handleSave}>
            {isSaving ? 'Saving…' : 'Save & Continue'}
          </Button>
        </>
      }
    >
      <h2
        id="required-prefs-title"
        className="text-lg font-semibold text-[var(--text-primary)] mb-2"
      >
        Extension requires setup
      </h2>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        Fill in the required preferences for <strong>{extensionId}</strong> to run{' '}
        <strong>{commandId}</strong>.
      </p>

      <div className="mb-4">
        <ExtensionPreferencesForm
          preferences={missing}
          values={values}
          errors={{}}
          disabled={isSaving}
          onChange={handleChange}
        />
      </div>
    </Modal>
  );
}
