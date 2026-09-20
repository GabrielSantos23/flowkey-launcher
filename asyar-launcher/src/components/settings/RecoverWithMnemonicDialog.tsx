import React, { useState } from 'react';
import Modal from '../base/Modal';
import { Button } from '../react/Buttons';
import { Input } from '../react/Inputs';
import { Textarea } from '../react/Inputs';
import { syncEncryptionService } from '../../services/sync/syncEncryptionService';
import { evaluatePassphraseStrength } from './EncryptionEnrolmentDialog.logic';
import { parsePhraseInput, joinPhraseForWire } from './RecoverWithMnemonicDialog.logic';
import { logService } from '../../services/log/logService';

export interface RecoverWithMnemonicDialogProps {
  isOpen?: boolean;
  onComplete?: () => void;
  onCancel?: () => void;
}

export default function RecoverWithMnemonicDialog({
  isOpen = false,
  onComplete,
  onCancel,
}: RecoverWithMnemonicDialogProps) {
  const [stage, setStage] = useState<'words' | 'passphrase' | 'submitting'>('words');
  const [phraseInput, setPhraseInput] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmNew, setConfirmNew] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parsed = parsePhraseInput(phraseInput);
  const strength = evaluatePassphraseStrength(newPass);
  const confirmsMatch = newPass.length > 0 && newPass === confirmNew;
  const submitDisabled = !strength.accepted || !confirmsMatch || stage === 'submitting';

  const reset = () => {
    setStage('words');
    setPhraseInput('');
    setNewPass('');
    setConfirmNew('');
    setErrorMessage(null);
  };

  const cancel = () => {
    reset();
    onCancel?.();
  };

  const continueToPassphrase = () => {
    if (parsed.isValid) setStage('passphrase');
  };

  const submit = async () => {
    if (submitDisabled) return;
    setStage('submitting');
    setErrorMessage(null);
    try {
      const phrase = joinPhraseForWire(parsed.words);
      await syncEncryptionService.recoverWithMnemonic(phrase, newPass);
      reset();
      onComplete?.();
    } catch (err) {
      logService.warn(`recover dialog submit failed: ${String(err)}`);
      setErrorMessage(
        String(err).includes('match')
          ? "Recovery phrase doesn't match your account. Re-check the words you typed."
          : "Couldn't recover. Check your connection and try again.",
      );
      setStage('passphrase');
    }
  };

  const handleEnter = () => {
    if (stage === 'passphrase' && !submitDisabled) {
      void submit();
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} labelledBy="recover-title" onEscape={cancel} onEnter={handleEnter}>
      {stage === 'words' ? (
        <div className="flex flex-col gap-4">
          <h2 id="recover-title" className="text-xl font-semibold text-[var(--text-primary)] m-0">
            Recover with your 24-word phrase
          </h2>
          <p className="text-sm text-[var(--text-secondary)] m-0">
            Paste your recovery phrase below. Words can be separated by spaces or new lines.
          </p>
          <Textarea
            value={phraseInput}
            onChange={(e) => setPhraseInput(e.target.value)}
            placeholder="abandon ability able about ..."
            rows={5}
            autoFocus
          />
          <div className="min-h-5">
            {parsed.words.length === 0 ? (
              <span className="text-xs text-[var(--text-secondary)]">0 / 24 words</span>
            ) : parsed.unknownWords.length > 0 ? (
              <span className="text-xs text-[var(--accent-danger)]">
                Unknown {parsed.unknownWords.length === 1 ? 'word' : 'words'}:{' '}
                {parsed.unknownWords.slice(0, 3).join(', ')}
                {parsed.unknownWords.length > 3 ? '…' : ''}
              </span>
            ) : parsed.words.length !== 24 ? (
              <span
                className={`text-xs ${
                  parsed.words.length > 24
                    ? 'text-[var(--accent-danger)]'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                {parsed.words.length} / 24 words
              </span>
            ) : (
              <span className="text-xs text-[var(--accent-success)]">All 24 words look valid.</span>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button onClick={cancel}>Cancel</Button>
            <Button variant="primary" disabled={!parsed.isValid} onClick={continueToPassphrase}>
              Continue
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <h2 id="recover-title" className="text-xl font-semibold text-[var(--text-primary)] m-0">
            Choose a new passphrase
          </h2>
          <p className="text-sm text-[var(--text-secondary)] m-0">
            This passphrase will replace your forgotten one. Your recovery phrase stays the same.
          </p>
          <div className="flex flex-col gap-3">
            <Input
              type="password"
              placeholder="New passphrase (12+ characters)"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              maxLength={256}
            />
            <Input
              type="password"
              placeholder="Confirm new passphrase"
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
              <p className="text-xs text-[var(--accent-danger)] m-0">Passphrases don't match.</p>
            ) : null}
            {errorMessage ? (
              <p className="text-xs text-[var(--accent-danger)] m-0">{errorMessage}</p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button onClick={() => setStage('words')} disabled={stage === 'submitting'}>
              Back
            </Button>
            <Button variant="primary" disabled={submitDisabled} onClick={() => void submit()}>
              {stage === 'submitting' ? 'Recovering…' : 'Recover'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
