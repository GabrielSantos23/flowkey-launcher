import React, { useState } from 'react';
import Modal from '../base/Modal';
import { Button } from '../react/Buttons';
import { Input } from '../react/Inputs';
import { syncEncryptionService } from '../../services/sync/syncEncryptionService';
import { logService } from '../../services/log/logService';

export interface DisableE2eeDialogProps {
  isOpen?: boolean;
  onComplete?: () => void;
  onCancel?: () => void;
}

export default function DisableE2eeDialog({
  isOpen = false,
  onComplete,
  onCancel,
}: DisableE2eeDialogProps) {
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit = confirmation === 'DISABLE' && !submitting;

  const reset = () => {
    setConfirmation('');
    setSubmitting(false);
    setErrorMessage(null);
  };

  const cancel = () => {
    reset();
    onCancel?.();
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await syncEncryptionService.disable();
      reset();
      onComplete?.();
    } catch (err) {
      logService.warn(`disable dialog submit failed: ${String(err)}`);
      setErrorMessage("Couldn't disable encrypted sync. Check your connection and try again.");
      setSubmitting(false);
    }
  };

  const handleEnter = () => {
    if (canSubmit) void submit();
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} labelledBy="disable-title" onEscape={cancel} onEnter={handleEnter}>
      <div className="flex flex-col gap-4">
        <h2 id="disable-title" className="text-xl font-semibold text-[var(--accent-danger)] m-0">
          Disable encrypted sync
        </h2>
        <p className="text-sm text-[var(--text-primary)] m-0">
          Disabling encrypted sync will re-upload every item to Flowkey's servers in plaintext.
          Flowkey will be able to read your synced data again. Continue?
        </p>
        <p className="text-sm text-[var(--text-secondary)] m-0">
          To confirm, type <strong>DISABLE</strong> below.
        </p>
        <Input
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder={'Type DISABLE to confirm'}
          autoFocus
        />
        {errorMessage ? (
          <p className="text-xs text-[var(--accent-danger)] m-0">{errorMessage}</p>
        ) : null}
        <div className="flex justify-end gap-2 mt-4">
          <Button onClick={cancel}>{'Cancel'}</Button>
          <Button
            className="!bg-[var(--accent-danger-fill)] !text-[var(--text-on-accent)] !border-transparent"
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {submitting ? 'Disabling…' : 'Disable encrypted sync'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
