import React, { useState, useRef, useEffect } from 'react';
import Modal from '../base/Modal';
import { Button } from '../react/Buttons';
import { Input } from '../react/Inputs';
import { syncEncryptionService } from '../../services/sync/syncEncryptionService';
import { evaluatePassphraseStrength } from './EncryptionEnrolmentDialog.logic';
import { logService } from '../../services/log/logService';

export interface EncryptionEnrolmentDialogProps {
  isOpen?: boolean;
  onComplete?: () => void;
  onCancel?: () => void;
}

export default function EncryptionEnrolmentDialog({
  isOpen = false,
  onComplete,
  onCancel,
}: EncryptionEnrolmentDialogProps) {
  const [stage, setStage] = useState<'passphrase' | 'submitting' | 'phrase'>('passphrase');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pass1InputRef = useRef<HTMLInputElement>(null);
  const strength = evaluatePassphraseStrength(pass1);
  const confirmsMatch = pass1.length > 0 && pass1 === pass2;
  const submitDisabled = !strength.accepted || !confirmsMatch || stage === 'submitting';

  const reset = () => {
    setStage('passphrase');
    setPass1('');
    setPass2('');
    setRecoveryPhrase('');
    setSavedConfirmed(false);
    setCopied(false);
    setErrorMessage(null);
  };

  const cancel = () => {
    reset();
    onCancel?.();
  };

  const submitPassphrase = async () => {
    if (submitDisabled) return;
    setStage('submitting');
    setErrorMessage(null);
    try {
      const phrase = await syncEncryptionService.enrol(pass1);
      setRecoveryPhrase(phrase);
      setStage('phrase');
    } catch (err) {
      logService.warn(`enrolment dialog submit failed: ${String(err)}`);
      setErrorMessage("Couldn't enable encrypted sync. Check your connection and try again.");
      setStage('passphrase');
    }
  };

  const handleEnter = () => {
    if (stage === 'passphrase' && !submitDisabled) {
      void submitPassphrase();
    }
  };

  const copyPhrase = async () => {
    try {
      await navigator.clipboard.writeText(recoveryPhrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      logService.warn(`copy recovery phrase failed: ${String(err)}`);
    }
  };

  const finish = () => {
    onComplete?.();
    reset();
  };

  useEffect(() => {
    if (isOpen && stage === 'passphrase') {
      pass1InputRef.current?.focus();
    }
  }, [isOpen, stage]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} labelledBy="enrol-title" onEscape={cancel} onEnter={handleEnter}>
      {stage === 'passphrase' || stage === 'submitting' ? (
        <div className="flex flex-col gap-4">
          <h2 id="enrol-title" className="text-xl font-semibold text-[var(--text-primary)] m-0">
            Set up encrypted sync
          </h2>
          <p className="text-sm text-[var(--text-secondary)] m-0">
            Choose a passphrase. You'll need this on every other device. Flowkey cannot reset it for
            you.
          </p>
          <div className="flex flex-col gap-3">
            <Input
              ref={pass1InputRef}
              type="password"
              placeholder="Passphrase (12+ characters)"
              value={pass1}
              onChange={(e) => setPass1(e.target.value)}
              maxLength={256}
            />
            <Input
              type="password"
              placeholder="Confirm passphrase"
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
              maxLength={256}
            />
            {pass1.length > 0 ? (
              <p
                className={`text-xs m-0 ${
                  strength.accepted ? 'text-[var(--text-secondary)]' : 'text-[var(--accent-danger)]'
                }`}
              >
                Strength {strength.score}/4
                {strength.reason ? ` — ${strength.reason}` : ''}
              </p>
            ) : null}
            {pass2.length > 0 && !confirmsMatch ? (
              <p className="text-xs text-[var(--accent-danger)] m-0">Passphrases don't match.</p>
            ) : null}
            {errorMessage ? (
              <p className="text-xs text-[var(--accent-danger)] m-0">{errorMessage}</p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button onClick={cancel}>Cancel</Button>
            <Button
              variant="primary"
              disabled={submitDisabled}
              onClick={() => void submitPassphrase()}
            >
              {stage === 'submitting' ? 'Setting up…' : 'Continue'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <h2 id="enrol-title" className="text-xl font-semibold text-[var(--text-primary)] m-0">
            Your recovery phrase
          </h2>
          <p className="text-sm text-[var(--text-secondary)] m-0">
            Save these 24 words somewhere safe — a password manager, encrypted note, or paper. If
            you forget your passphrase, this is the only way to recover your data.
          </p>
          <div className="bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--separator)] rounded-[var(--radius-sm)] p-3 font-mono text-sm leading-relaxed select-text tracking-wider">
            {recoveryPhrase}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void copyPhrase()}>{copied ? 'Copied!' : 'Copy'}</Button>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={savedConfirmed}
              onChange={(e) => setSavedConfirmed(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--border-color)] accent-[var(--accent-primary)]"
            />
            <span className="text-sm text-[var(--text-secondary)]">
              I've saved this somewhere safe.
            </span>
          </label>
          <div className="flex justify-end mt-4">
            <Button variant="primary" disabled={!savedConfirmed} onClick={finish}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
