import React, { useState } from 'react';
import Modal from '../base/Modal';
import { Button } from '../react/Buttons';
import { Input } from '../react/Inputs';
import { syncEncryptionService } from '../../services/sync/syncEncryptionService';
import { evaluatePassphraseStrength } from './EncryptionEnrolmentDialog.logic';
import { logService } from '../../services/log/logService';

export interface RotatePassphraseDialogProps {
  isOpen?: boolean;
  onComplete?: () => void;
  onCancel?: () => void;
}

export default function RotatePassphraseDialog({
  isOpen = false,
  onComplete,
  onCancel,
}: RotatePassphraseDialogProps) {
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmNew, setConfirmNew] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const strength = evaluatePassphraseStrength(newPass);
  const confirmsMatch = newPass.length > 0 && newPass === confirmNew;
  const submitDisabled = submitting || oldPass.length === 0 || !strength.accepted || !confirmsMatch;

  const reset = () => {
    setOldPass('');
    setNewPass('');
    setConfirmNew('');
    setSubmitting(false);
    setErrorMessage(null);
  };

  const cancel = () => {
    reset();
    onCancel?.();
  };

  const submit = async () => {
    if (submitDisabled) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await syncEncryptionService.rotate(oldPass, newPass);
      reset();
      onComplete?.();
    } catch (err) {
      logService.warn(`rotate dialog submit failed: ${String(err)}`);
      setErrorMessage("Couldn't change passphrase. Check the old passphrase and try again.");
      setSubmitting(false);
    }
  };

  const handleEnter = () => {
    if (!submitDisabled) void submit();
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} labelledBy="rotate-title" onEscape={cancel} onEnter={handleEnter}>
      <div className="flex flex-col gap-4">
        <h2 id="rotate-title" className="text-xl font-semibold text-[var(--text-primary)] m-0">
          {'Change passphrase'}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] m-0">
          {
            'Your recovery phrase will not change — only the passphrase used to unlock encrypted sync.'
          }
        </p>
        <div className="flex flex-col gap-3">
          <Input
            type="password"
            placeholder={'Current passphrase'}
            value={oldPass}
            onChange={(e) => setOldPass(e.target.value)}
            maxLength={256}
            autoFocus
          />
          <Input
            type="password"
            placeholder={'New passphrase (12+ characters)'}
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            maxLength={256}
          />
          <Input
            type="password"
            placeholder={'Confirm new passphrase'}
            value={confirmNew}
            onChange={(e) => setConfirmNew(e.target.value)}
            maxLength={256}
          />
          {newPass.length > 0 ? (
            <p
              className={`text-xs m-0 ${
                strength.accepted ? 'text-[var(--text-secondary)]' : 'text-[var(--accent-danger)]'
              }`}
            >
              Strength {strength.score}/4
              {strength.reason ? ` — ${strength.reason}` : ''}
            </p>
          ) : null}
          {confirmNew.length > 0 && !confirmsMatch ? (
            <p className="text-xs text-[var(--accent-danger)] m-0">
              {"New passphrases don't match."}
            </p>
          ) : null}
          {errorMessage ? (
            <p className="text-xs text-[var(--accent-danger)] m-0">{errorMessage}</p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button onClick={cancel}>{'Cancel'}</Button>
          <Button variant="primary" disabled={submitDisabled} onClick={() => void submit()}>
            {submitting ? 'Changing…' : 'Change passphrase'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
