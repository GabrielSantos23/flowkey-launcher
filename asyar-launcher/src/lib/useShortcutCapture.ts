import { resumeAllShortcuts, pauseAllShortcuts } from './ipc/commands';
import {
  MODIFIER_KEYS,
  MODIFIER_ORDER,
  MODIFIER_SYMBOL,
  CODE_TO_KEY,
  KEY_DISPLAY,
  DOM_TO_MODIFIER,
  VALID_KEYS,
  isBareKeyAllowed,
} from '../built-in-features/shortcuts/shortcutFormatter';

export interface CaptureConfig {
  conflictChecker?: (shortcut: string) => Promise<{ name: string } | null>;
  onCapture: (result: { modifier: string; key: string }) => Promise<string | true>;
  onCancel?: () => void;
  onDone?: () => void;
}

export interface CaptureState {
  isRecording: boolean;
  saveState: 'idle' | 'saving' | 'success' | 'error';
  errorMessage: string;
  errorType: 'no-modifier' | 'invalid-key' | 'conflict' | 'generic' | '';
  partialModifiers: string[];
  rejectedKeys: string[];
  invalidKeys: Set<string>;
  rejectedKeysHeld: Set<string>;
  failedChips: string[];
  conflictInfo: string | null;
}

function modifierSymbol(mod: string): string {
  return MODIFIER_SYMBOL[mod] ?? mod;
}

function displayKey(k: string): string {
  return KEY_DISPLAY[k] ?? k;
}

export function useShortcutCapture(config: CaptureConfig) {
  let isRecording = false;
  let saveState: CaptureState['saveState'] = 'idle';
  let errorMessage = '';
  let errorType: CaptureState['errorType'] = '';
  let rejectedKeys: string[] = [];
  let invalidKeys = new Set<string>();
  let partialModifiers: string[] = [];
  let rejectedKeysHeld = new Set<string>();
  let failedChips: string[] = [];
  let conflictInfo: string | null = null;
  let rejectedTimer: ReturnType<typeof setTimeout> | null = null;
  let savedWithoutCancel = false;

  let savedModifier = '';
  let savedKey = '';

  function clearRejectedTimer() {
    if (rejectedTimer) {
      clearTimeout(rejectedTimer);
      rejectedTimer = null;
    }
  }

  function resetRejection() {
    clearRejectedTimer();
    rejectedKeys = [];
    invalidKeys.clear();
    rejectedKeysHeld.clear();
  }

  function scheduleRejectionClear() {
    clearRejectedTimer();
    rejectedTimer = setTimeout(() => {
      resetRejection();
    }, 1200);
  }

  async function startRecording() {
    if (isRecording) return;
    // Flip state synchronously — callers read it right after the call.
    isRecording = true;
    saveState = 'idle';
    errorMessage = '';
    errorType = '';
    partialModifiers = [];
    resetRejection();
    failedChips = [];
    conflictInfo = null;
    savedWithoutCancel = false;
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
  }

  async function stopRecording(skipCancel = false) {
    if (!isRecording) return;
    isRecording = false;
    partialModifiers = [];
    resetRejection();
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('keyup', handleKeyUp, true);
    // Resume OS shortcuts in the background — onCancel must stay synchronous
    // so callers (and the Escape key path) observe the cancel immediately.
    void resumeAllShortcuts().catch(() => {
      // Best-effort
    });
    if (!skipCancel && !savedWithoutCancel) {
      config.onCancel?.();
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!isRecording) return;
    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape' && partialModifiers.length === 0) {
      stopRecording();
      return;
    }

    const currentMods: string[] = [];
    // Canonical names (Control/Alt/Shift/Super) so chip display and the
    // saved modifier string match the formatter's vocabulary.
    if (event.ctrlKey) currentMods.push('Control');
    if (event.altKey) currentMods.push('Alt');
    if (event.shiftKey) currentMods.push('Shift');
    if (event.metaKey) currentMods.push('Super');

    partialModifiers = currentMods;

    if (MODIFIER_KEYS.includes(event.key)) {
      return;
    }

    const mappedKey = CODE_TO_KEY[event.code] ?? event.key;
    // Fail-open: an unloaded VALID_KEYS table (async IPC, settings webview
    // racing app init) must not reject every keypress silently.
    const hasValidKey = VALID_KEYS.size === 0 || VALID_KEYS.has(mappedKey);

    if (currentMods.length === 0 && !isBareKeyAllowed(mappedKey)) {
      if (!hasValidKey) {
        invalidKeys.add(mappedKey);
      }
      if (!rejectedKeysHeld.has(mappedKey)) {
        rejectedKeys.push(mappedKey);
        rejectedKeysHeld.add(mappedKey);
      }
      errorType = 'no-modifier';
      scheduleRejectionClear();
      return;
    }

    if (!hasValidKey) {
      invalidKeys.add(mappedKey);
      if (!rejectedKeysHeld.has(mappedKey)) {
        rejectedKeys.push(mappedKey);
        rejectedKeysHeld.add(mappedKey);
      }
      errorType = 'invalid-key';
      scheduleRejectionClear();
      return;
    }

    // Shift typing a shifted punctuation character (?, !, @, …) is the user
    // typing, not building a shortcut — reject it unless another modifier is
    // also held (Shift+Super+/ IS a shortcut).
    if (
      currentMods.length === 1 &&
      currentMods[0] === 'Shift' &&
      event.key !== mappedKey &&
      event.key.length === 1
    ) {
      errorType = 'no-modifier';
      scheduleRejectionClear();
      return;
    }

    const modStr = currentMods
      .sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b))
      .join('+');
    savedModifier = modStr;
    savedKey = mappedKey;

    void processCapture(modStr, mappedKey);
  }

  function handleKeyUp(event: KeyboardEvent) {
    if (!isRecording) return;
    event.preventDefault();
    event.stopPropagation();

    const currentMods: string[] = [];
    if (event.ctrlKey) currentMods.push('Control');
    if (event.altKey) currentMods.push('Alt');
    if (event.shiftKey) currentMods.push('Shift');
    if (event.metaKey) currentMods.push('Super');
    partialModifiers = currentMods;

    const mappedKey = CODE_TO_KEY[event.code] ?? event.key.toLowerCase();
    rejectedKeysHeld.delete(mappedKey);
  }

  async function processCapture(modStr: string, key: string) {
    saveState = 'saving';
    savedWithoutCancel = true;
    await stopRecording(true);

    if (config.conflictChecker) {
      const fullShortcut = modStr ? `${modStr}+${key}` : key;
      const conflict = await config.conflictChecker(fullShortcut);
      if (conflict) {
        saveState = 'error';
        errorType = 'conflict';
        conflictInfo = conflict.name;
        failedChips = modStr
          ? [...modStr.split('+').map((m) => modifierSymbol(m)), displayKey(key)]
          : [displayKey(key)];
        setTimeout(() => {
          saveState = 'idle';
          errorType = '';
        }, 3000);
        return;
      }
    }

    const result = await config.onCapture({ modifier: modStr, key });
    if (result === true) {
      saveState = 'success';
      config.onDone?.();
      setTimeout(() => {
        saveState = 'idle';
      }, 1500);
    } else {
      saveState = 'error';
      errorType = 'generic';
      errorMessage = typeof result === 'string' ? result : 'Failed to save shortcut';
      failedChips = modStr
        ? [...modStr.split('+').map((m) => modifierSymbol(m)), displayKey(key)]
        : [displayKey(key)];
      setTimeout(() => {
        saveState = 'idle';
        errorType = '';
      }, 3000);
    }
  }

  return {
    get state(): CaptureState {
      return {
        isRecording,
        saveState,
        errorMessage,
        errorType,
        partialModifiers,
        rejectedKeys,
        invalidKeys,
        rejectedKeysHeld,
        failedChips,
        conflictInfo,
      };
    },
    get partialChips() {
      return partialModifiers.map((m) => modifierSymbol(m));
    },
    get rejectedModifierChips() {
      return partialModifiers.map((m) => modifierSymbol(m));
    },
    get hasValidRejectedKeys() {
      return rejectedKeys.some((k) => !invalidKeys.has(k));
    },
    modifierSymbol,
    displayKey,
    startRecording,
    stopRecording,
  };
}
