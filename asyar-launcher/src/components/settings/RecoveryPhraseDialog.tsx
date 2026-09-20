import React, { useState, useRef, useEffect } from 'react';
import Modal from '../base/Modal';
import { Button } from '../react/Buttons';
import { Input } from '../react/Inputs';
import { syncEncryptionService } from '../../services/sync/syncEncryptionService';
import { logService } from '../../services/log/logService';

export interface RecoveryPhraseDialogProps {
  isOpen?: boolean;
  onComplete?: () => void;
  onCancel?: () => void;
}

export default function RecoveryPhraseDialog({
  isOpen = false,
  onComplete,
  onCancel,
}: RecoveryPhraseDialogProps) {
  const [stage, setStage] = useState<'passphrase' | 'submitting' | 'phrase'>('passphrase');
  const [passphrase, setPassphrase] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const passphraseInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStage('passphrase');
    setPassphrase('');
    setRecoveryPhrase('');
    setSavedConfirmed(false);
    setCopied(false);
    setErrorMessage(null);
  };

  const cancel = () => {
    reset();
    onCancel?.();
  };

  const submit = async () => {
    if (passphrase.length === 0) return;
    setStage('submitting');
    setErrorMessage(null);
    try {
      const phrase = await syncEncryptionService.showRecoveryPhrase(passphrase);
      setRecoveryPhrase(phrase);
      setStage('phrase');
    } catch (err) {
      logService.warn(`recovery phrase dialog failed: ${String(err)}`);
      setErrorMessage('Incorrect passphrase. Try again.');
      setStage('passphrase');
    }
  };

  const handleEnter = () => {
    if (stage === 'passphrase' && passphrase.length > 0) {
      void submit();
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
    reset();
    onComplete?.();
  };

  useEffect(() => {
    if (isOpen && stage === 'passphrase') {
      passphraseInputRef.current?.focus();
    }
  }, [isOpen, stage]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} labelledBy="phrase-title" onEscape={cancel} onEnter={handleEnter}>
      {stage === 'passphrase' || stage === 'submitting' ? (
        <div className="flex flex-col gap-4">
          <h2 id="phrase-title" className="text-xl font-semibold text-[var(--text-primary)] m-0">
            View recovery phrase
          </h2>
          <p className="text-sm text-[var(--text-secondary)] m-0">
            Enter your current passphrase to view your 24-word recovery phrase.
          </p>
          <Input
            ref={passphraseInputRef}
            type="password"
            placeholder="Passphrase"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            maxLength={256}
          />
          {errorMessage ? (
            <p className="text-xs text-[var(--accent-danger)] m-0">{errorMessage}</p>
          ) : null}
          <div className="flex justify-end gap-2 mt-4">
            <Button onClick={cancel}>Cancel</Button>
            <Button
              variant="primary"
              disabled={passphrase.length === 0 || stage === 'submitting'}
              onClick={() => void submit()}
            >
              {stage === 'submitting' ? 'Verifying…' : 'View'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <h2 id="phrase-title" className="text-xl font-semibold text-[var(--text-primary)] m-0">
            Your recovery phrase
          </h2>
          <p className="text-sm text-[var(--text-secondary)] m-0">
            Save these 24 words somewhere safe — a password manager, encrypted note, or paper. If
            you forget your passphrase, this is the only way to get your data back.
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
