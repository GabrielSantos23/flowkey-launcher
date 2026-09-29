import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke, useSettingsState } from '@/bridge';
import { publishRecorderError } from '@/recorder-errors';
import { comboToString, isModifierKey, keyNameFromEvent } from '@/keys';
import { ExtensionIcon } from '@/components/extension-icon';
import { Keycap } from '@/components/settings-row';
import type { SettingsCaptureState } from '@/types';

/**
 * The hotkey recorder overlay, mounted while the shell has a capture session
 * open (state.capture). Port of the former WPF recorder popup: modifier
 * tracking, Backspace to delete, Escape/blur to cancel, commit on releasing
 * all modifiers or Enter. The shell validates the committed combo string and
 * answers with an inline error, or clears the capture session on success.
 */
export function HotkeyRecorder() {
  const state = useSettingsState();
  const capture = state?.capture ?? null;
  if (!state || !capture) {
    return null;
  }
  return (
    <RecorderCard
      key={`${capture.scope}:${capture.commandKey ?? ''}`}
      capture={capture}
      commandTitle={commandTitleFor(state, capture)}
      commandIcon={commandIconFor(state, capture)}
    />
  );
}

function commandTitleFor(
  state: NonNullable<ReturnType<typeof useSettingsState>>,
  capture: SettingsCaptureState,
) {
  if (capture.scope !== 'command' || !capture.commandKey) {
    return null;
  }
  for (const detail of Object.values(state.details)) {
    const command = detail.commands.find(
      (candidate) => candidate.commandKey === capture.commandKey,
    );
    if (command) {
      return command.title;
    }
  }
  return null;
}

function commandIconFor(
  state: NonNullable<ReturnType<typeof useSettingsState>>,
  capture: SettingsCaptureState,
) {
  if (capture.scope !== 'command' || !capture.commandKey) {
    return null;
  }
  const extensionId = capture.commandKey.split(':')[0] ?? '';
  return state.details[extensionId]?.icon ?? null;
}

function RecorderCard({
  capture,
  commandTitle,
  commandIcon,
}: {
  capture: SettingsCaptureState;
  commandTitle: string | null;
  commandIcon: ReturnType<typeof commandIconFor>;
}) {
  const [modifiers, setModifiers] = useState<string[]>([]);
  const [recorded, setRecorded] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const committing = useRef(false);

  const cancel = useCallback(async () => {
    publishRecorderError(capture.commandKey ?? null, null);
    await invoke('cancelHotkeyCapture');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture.commandKey]);

  const commit = useCallback(
    async (mods: readonly string[], key: string) => {
      if (committing.current) {
        return;
      }
      committing.current = true;
      try {
        const result = await invoke('commitHotkeyCapture', { combo: comboToString(mods, key) });
        if (!result.ok) {
          const message = result.error ?? 'Could not save this combination';
          setError(message);
          publishRecorderError(capture.commandKey ?? null, message);
        }
        // on ok the shell clears the capture session and the overlay unmounts
      } finally {
        committing.current = false;
      }
    },
    [capture.commandKey],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const modifier = isModifierKey(event);
      if (modifier) {
        setError(null);
        setModifiers((current) =>
          current.includes(modifier) || current.length >= 2 ? current : [...current, modifier],
        );
        return;
      }
      if (event.key === 'Escape') {
        void cancel();
        return;
      }
      if (event.key === 'Backspace') {
        setError(null);
        if (recorded !== null) {
          setRecorded(null);
        } else if (modifiers.length > 0) {
          setModifiers((current) => current.slice(0, -1));
        }
        return;
      }
      if (event.key === 'Enter') {
        if (recorded !== null) {
          void commit(snapshot, recorded);
        }
        return;
      }
      const name = keyNameFromEvent(event);
      if (name === null) {
        return;
      }
      setError(null);
      setRecorded(name);
      setSnapshot([...modifiers]);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const modifier = isModifierKey(event);
      if (modifier) {
        event.preventDefault();
        if (modifiers.includes(modifier)) {
          const remaining = modifiers.filter((candidate) => candidate !== modifier);
          setModifiers(remaining);
          if (recorded !== null && remaining.length === 0) {
            void commit(snapshot, recorded);
          }
        }
        return;
      }
      const name = keyNameFromEvent(event);
      if (name !== null && name === recorded && modifiers.length === 0) {
        event.preventDefault();
        void commit(snapshot, recorded);
      }
    };
    const onBlur = () => {
      void cancel();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [modifiers, recorded, snapshot, cancel, commit]);

  const hint = error
    ? error
    : recorded !== null
      ? 'Release the keys to save'
      : modifiers.length > 0
        ? 'Press Backspace to delete'
        : 'Press keys to record (Ctrl, Alt or Win required)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/40"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          void cancel();
        }
      }}
    >
      <div className="w-[440px] rounded-lg border border-keycap-border bg-popover px-3.5 py-3 shadow-lg">
        <div
          className={`text-[13px] text-center ${error ? 'text-destructive' : 'text-text-secondary'}`}
        >
          {hint}
        </div>
        <div className="flex items-center justify-center gap-1 my-2.5 min-h-7">
          {modifiers.map((modifier) => (
            <Keycap key={modifier} label={modifier} />
          ))}
          {recorded !== null && <Keycap label={recorded} />}
        </div>
        <div className="h-px bg-border -mx-3.5" />
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <ExtensionIcon icon={commandIcon} className="size-4 flex-none" />
            <span className="text-xs font-medium text-foreground truncate">
              {commandTitle ?? (capture.scope === 'summon' ? 'FlowKey Hotkey' : capture.commandKey)}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-text-tertiary">
            <Keycap label="Esc" />
            <span>to cancel</span>
          </div>
        </div>
      </div>
    </div>
  );
}
