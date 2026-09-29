/**
 * Hotkey combo capture and formatting for the settings recorder. The wire
 * format is the shell's canonical "Ctrl+Alt+Space" style (HotkeyCombo.Describe);
 * the shell re-validates and parses every committed string with
 * HotkeyCombo.TryParse, and test/keys.test.ts pins this table to those cases.
 */

export const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Win', 'Shift'] as const;

export type ModifierName = (typeof MODIFIER_ORDER)[number];

/** The subset of KeyboardEvent the recorder needs; tests pass plain objects. */
export type KeyboardEventLike = Pick<KeyboardEvent, 'code' | 'key'>;

export function isModifierKey(event: KeyboardEventLike): ModifierName | null {
  switch (event.key) {
    case 'Control':
      return 'Ctrl';
    case 'Alt':
    case 'AltGraph':
      return 'Alt';
    case 'Meta':
      return 'Win';
    case 'Shift':
      return 'Shift';
    default:
      return null;
  }
}

/** Maps a KeyboardEvent to the shell's canonical key name, or null if unusable. */
export function keyNameFromEvent(event: KeyboardEventLike): string | null {
  const code = event.code;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) {
    return letter[1];
  }
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) {
    return digit[1];
  }
  const numpadDigit = /^Numpad([0-9])$/.exec(code);
  if (numpadDigit) {
    return numpadDigit[1];
  }
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) {
    return code;
  }
  const named: Record<string, string> = {
    Space: 'Space',
    ArrowLeft: 'Left',
    ArrowUp: 'Up',
    ArrowRight: 'Right',
    ArrowDown: 'Down',
    Period: '.',
    Comma: ',',
    Minus: '-',
    Equal: '=',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
  };
  return named[code] ?? null;
}

/** Formats modifiers + key in Describe order (Ctrl, Alt, Win, Shift) + key. */
export function comboToString(modifiers: readonly string[], key: string): string {
  const parts: string[] = MODIFIER_ORDER.filter((modifier) => modifiers.includes(modifier));
  parts.push(key);
  return parts.join('+');
}

/** True when the event should be swallowed by the recorder (never reach the page). */
export function isRecorderReservedKey(event: KeyboardEventLike): boolean {
  return (
    isModifierKey(event) !== null ||
    event.key === 'Backspace' ||
    event.key === 'Escape' ||
    event.key === 'Enter' ||
    keyNameFromEvent(event) !== null
  );
}
