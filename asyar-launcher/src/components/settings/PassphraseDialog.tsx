import React, { useState } from 'react';
import Modal from '../base/Modal';
import { Button } from '../react/Buttons';
import { Input } from '../react/Inputs';
import { syncEncryptionService } from '../../services/sync/syncEncryptionService';
import { logService } from '../../services/log/logService';

export interface PassphraseDialogProps {
  isOpen?: boolean;
  title?: string;
  description?: string;
  onComplete?: () => void;
  onCancel?: () => void;
  onForgot?: () => void;
}

export default function PassphraseDialog({
  isOpen = false,
  title = 'Unlock encrypted sync',
  description = 'Encrypted sync needs your passphrase to continue.',
  onComplete,
  onCancel,
  onForgot,
}: PassphraseDialogProps) {
  const [passphrase, setPassphrase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reset = () => {
    setPassphrase('');
    setSubmitting(false);
    setErrorMessage(null);
  };

  const cancel = () => {
    reset();
    onCancel?.();
  };

  const submit = async () => {
    if (submitting || passphrase.length === 0) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await syncEncryptionService.unlock(passphrase);
      reset();
      onComplete?.();
    } catch (err) {
      logService.warn(`passphrase dialog unlock failed: ${String(err)}`);
      setErrorMessage('Incorrect passphrase. Try again.');
      setSubmitting(false);
    }
  };

  const forgot = () => {
    reset();
    onForgot?.();
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} labelledBy="passphrase-title" onEscape={cancel} onEnter={submit}>
      <div className="flex flex-col gap-4">
        <h2 id="passphrase-title" className="text-xl font-semibold text-[var(--text-primary)] m-0">
          {title}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] m-0">{description}</p>
        <Input
          type="password"
          placeholder={'Passphrase'}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          maxLength={256}
          autoFocus
        />
        {errorMessage ? (
          <p className="text-xs text-[var(--accent-danger)] m-0">{errorMessage}</p>
        ) : null}
        <div className="flex justify-between items-center mt-2">
          {onForgot ? (
            <button
              type="button"
              className="bg-transparent border-0 p-0 cursor-pointer text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
              onClick={forgot}
            >
              {'Use recovery phrase instead'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button onClick={cancel}>{'Cancel'}</Button>
            <Button
              variant="primary"
              disabled={passphrase.length === 0 || submitting}
              onClick={() => void submit()}
            >
              {submitting ? 'Unlocking…' : 'Unlock'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
