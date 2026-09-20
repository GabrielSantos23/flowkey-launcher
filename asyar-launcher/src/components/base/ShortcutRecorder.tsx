import React, { useState, useEffect, useRef } from 'react';
import { useShortcutCapture } from '../../lib/useShortcutCapture';
import { MODIFIER_ORDER } from '../../built-in-features/shortcuts/shortcutFormatter';

export interface ShortcutRecorderProps {
  modifier?: string;
  keyName?: string;
  placeholder?: string;
  disabled?: boolean;
  autoRecord?: boolean;
  onsave?: (detail: { modifier: string; key: string }) => Promise<string | true>;
  oncancel?: () => void;
  ondone?: () => void;
  conflictChecker?: (shortcut: string) => Promise<{ name: string } | null>;
}

export default function ShortcutRecorder({
  modifier = '',
  keyName = '',
  placeholder = 'Click to record shortcut',
  disabled = false,
  autoRecord = false,
  onsave,
  oncancel,
  ondone,
  conflictChecker,
}: ShortcutRecorderProps) {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const [currentMod, setCurrentMod] = useState(modifier);
  const [currentKey, setCurrentKey] = useState(keyName);

  useEffect(() => {
    setCurrentMod(modifier);
  }, [modifier]);

  useEffect(() => {
    setCurrentKey(keyName);
  }, [keyName]);

  const captureRef = useRef<ReturnType<typeof useShortcutCapture> | null>(null);
  if (!captureRef.current) {
    captureRef.current = useShortcutCapture({
      conflictChecker,
      onCapture: async (result) => {
        const prevMod = currentMod;
        const prevKey = currentKey;
        setCurrentMod(result.modifier);
        setCurrentKey(result.key);

        if (onsave) {
          const saveResult = await onsave(result);
          if (saveResult !== true) {
            setCurrentMod(prevMod);
            setCurrentKey(prevKey);
          }
          rerender();
          return saveResult;
        }
        rerender();
        return true;
      },
      onCancel: () => {
        oncancel?.();
        rerender();
      },
      onDone: () => {
        ondone?.();
        rerender();
      },
    });
  }
  const capture = captureRef.current;

  const handleStartRecording = () => {
    if (disabled || capture.state.saveState === 'saving') return;
    capture.startRecording();
    buttonRef.current?.focus();
    rerender();
  };

  useEffect(() => {
    if (autoRecord) {
      handleStartRecording();
    }
    return () => {
      capture.stopRecording();
    };
  }, [autoRecord]);

  const idleChips = (() => {
    if (currentKey) {
      if (currentMod) {
        const mods = currentMod
          .split('+')
          .sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b))
          .map((m) => capture.modifierSymbol(m));
        return [...mods, capture.displayKey(currentKey)];
      }
      return [capture.displayKey(currentKey)];
    }
    return [];
  })();

  const isRecording = capture.state.isRecording;
  const saveState = capture.state.saveState;
  const errorType = capture.state.errorType;

  return (
    <div
      className={`shortcut-recorder relative w-full ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <button
        ref={buttonRef}
        type="button"
        className={`recorder-button w-full bg-[var(--bg-primary)] border rounded-[var(--radius-md)] px-6 py-4 cursor-pointer transition-all min-h-[var(--size-2xl)] flex items-center justify-center ${
          isRecording
            ? 'border-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_8%,var(--bg-primary))]'
            : saveState === 'error'
              ? 'border-[var(--accent-danger)] bg-[color-mix(in_srgb,var(--accent-danger)_8%,var(--bg-primary))]'
              : saveState === 'success'
                ? 'border-[var(--accent-success)] bg-[color-mix(in_srgb,var(--accent-success)_8%,var(--bg-primary))]'
                : 'border-[var(--border-color)] hover:bg-[var(--bg-hover)]'
        }`}
        onClick={handleStartRecording}
        disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        aria-label="Press keys to set shortcut"
      >
        {isRecording ? (
          <div className="recorder-content flex items-center justify-center gap-3">
            {errorType === 'conflict' && capture.state.failedChips.length > 0 ? (
              <div className="key-chips flex items-center gap-3">
                {capture.state.failedChips.map((chip, i) => (
                  <React.Fragment key={i}>
                    {i === capture.state.failedChips.length - 1 &&
                    capture.state.failedChips.length > 1 ? (
                      <span className="text-[var(--accent-danger)] font-semibold text-base">+</span>
                    ) : null}
                    <span className="px-3 py-1 bg-[color-mix(in_srgb,var(--accent-danger)_15%,var(--bg-hover))] text-[var(--accent-danger)] border border-[var(--accent-danger)] rounded-[var(--radius-xs)] font-semibold text-base">
                      {chip}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            ) : capture.state.rejectedKeys.length > 0 &&
              capture.rejectedModifierChips.length > 0 ? (
              <div className="key-chips flex items-center gap-3">
                {capture.rejectedModifierChips.map((chip, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-[color-mix(in_srgb,var(--accent-primary)_15%,var(--bg-hover))] text-[var(--accent-primary)] border border-[var(--accent-primary)] rounded-[var(--radius-xs)] font-semibold text-base"
                  >
                    {chip}
                  </span>
                ))}
                <span
                  className={`font-semibold text-base ${capture.hasValidRejectedKeys ? 'text-[var(--accent-primary)]' : 'text-[var(--text-tertiary)]'}`}
                >
                  +
                </span>
                {capture.state.rejectedKeys
                  .filter((k) => !capture.state.invalidKeys.has(k))
                  .map((rk) => (
                    <span
                      key={rk}
                      className="px-3 py-1 bg-[color-mix(in_srgb,var(--accent-primary)_15%,var(--bg-hover))] text-[var(--accent-primary)] border border-[var(--accent-primary)] rounded-[var(--radius-xs)] font-semibold text-base"
                    >
                      {capture.displayKey(rk)}
                    </span>
                  ))}
                {capture.state.rejectedKeys
                  .filter((k) => capture.state.invalidKeys.has(k))
                  .map((rk) => (
                    <span
                      key={rk}
                      className="px-3 py-1 bg-[color-mix(in_srgb,var(--accent-danger)_15%,var(--bg-hover))] text-[var(--accent-danger)] border border-[var(--accent-danger)] rounded-[var(--radius-xs)] font-semibold text-base"
                    >
                      {capture.displayKey(rk)}
                    </span>
                  ))}
              </div>
            ) : capture.partialChips.length > 0 ? (
              <div className="key-chips flex items-center gap-3">
                {capture.partialChips.map((chip, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-[color-mix(in_srgb,var(--accent-primary)_15%,var(--bg-hover))] text-[var(--accent-primary)] border border-[var(--accent-primary)] rounded-[var(--radius-xs)] font-semibold text-base"
                  >
                    {chip}
                  </span>
                ))}
                <span className="text-[var(--text-tertiary)] font-semibold text-base">+</span>
                <span className="px-3 py-1 bg-[var(--bg-hover)] text-[var(--text-tertiary)] border border-[var(--border-color)] rounded-[var(--radius-xs)] font-semibold text-base">
                  B
                </span>
              </div>
            ) : (
              <div className="key-chips flex items-center gap-3">
                <span className="text-[var(--text-tertiary)] text-sm">e.g.</span>
                <span className="px-3 py-1 bg-[var(--bg-hover)] text-[var(--text-tertiary)] border border-[var(--border-color)] rounded-[var(--radius-xs)] font-semibold text-base">
                  ⇧
                </span>
                <span className="px-3 py-1 bg-[var(--bg-hover)] text-[var(--text-tertiary)] border border-[var(--border-color)] rounded-[var(--radius-xs)] font-semibold text-base">
                  ⊞
                </span>
                <span className="text-[var(--text-tertiary)] font-semibold text-base">+</span>
                <span className="px-3 py-1 bg-[var(--bg-hover)] text-[var(--text-tertiary)] border border-[var(--border-color)] rounded-[var(--radius-xs)] font-semibold text-base">
                  B
                </span>
              </div>
            )}
          </div>
        ) : saveState === 'success' ? (
          <div className="recorder-content flex items-center justify-center gap-3">
            <div className="key-chips flex items-center gap-3">
              {idleChips.map((chip, i) => (
                <React.Fragment key={i}>
                  {i === idleChips.length - 1 && idleChips.length > 1 ? (
                    <span className="text-[var(--accent-success)] font-semibold text-base">+</span>
                  ) : null}
                  <span className="px-3 py-1 bg-[color-mix(in_srgb,var(--accent-success)_15%,var(--bg-hover))] text-[var(--accent-success)] border border-[var(--accent-success)] rounded-[var(--radius-xs)] font-semibold text-base">
                    {chip}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
        ) : saveState === 'saving' ? (
          <div className="recorder-content flex items-center justify-center">
            <span className="text-[var(--text-secondary)] text-sm">Saving...</span>
          </div>
        ) : (
          <div className="recorder-content flex items-center justify-center gap-3">
            {idleChips.length > 0 ? (
              <div className="key-chips flex items-center gap-3">
                {idleChips.map((chip, i) => (
                  <React.Fragment key={i}>
                    {i === idleChips.length - 1 && idleChips.length > 1 ? (
                      <span className="text-[var(--text-secondary)] font-semibold text-base">
                        +
                      </span>
                    ) : null}
                    <span className="px-3 py-1 bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-[var(--radius-xs)] font-semibold text-base">
                      {chip}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <span className="text-[var(--text-tertiary)] text-base">{placeholder}</span>
            )}
          </div>
        )}
      </button>

      <div
        className={`message-slot overflow-hidden flex items-center justify-center transition-all ${
          saveState === 'success' || (errorType !== '' && errorType !== 'no-modifier')
            ? 'h-10 opacity-100'
            : 'h-0 opacity-0'
        }`}
      >
        {saveState === 'success' ? (
          <div className="text-sm font-medium text-[var(--text-primary)]">Saved</div>
        ) : errorType === 'invalid-key' ? (
          <div className="text-sm font-medium text-[var(--accent-danger)]">
            Invalid {capture.state.invalidKeys.size > 1 ? 'keys' : 'key'}
          </div>
        ) : errorType === 'conflict' ? (
          <div className="text-sm font-medium text-[var(--accent-danger)]">
            Already assigned to '{capture.state.conflictInfo}'
          </div>
        ) : errorType === 'generic' ? (
          <div className="text-sm font-medium text-[var(--accent-danger)]">
            {capture.state.errorMessage}
          </div>
        ) : null}
      </div>
    </div>
  );
}
