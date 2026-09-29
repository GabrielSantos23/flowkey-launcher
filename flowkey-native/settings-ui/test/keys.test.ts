import { describe, expect, test } from 'bun:test';
import {
  comboToString,
  isRecorderReservedKey,
  keyNameFromEvent,
  isModifierKey,
  type KeyboardEventLike,
} from '../src/keys';

/**
 * The combo table must stay in lockstep with the shell's HotkeyCombo.Describe
 * / HotkeyCombo.TryParse (Native/HotkeyCombo.cs): the web recorder formats
 * with these helpers and the shell re-parses the string. Shell-side cases
 * mirror Native/HotkeyComboTests.
 */

function fakeEvent(init: { code: string; key: string }): KeyboardEventLike {
  return init as unknown as KeyboardEventLike;
}

describe('keyNameFromEvent', () => {
  test('letters', () => {
    expect(keyNameFromEvent(fakeEvent({ code: 'KeyA', key: 'a' }))).toBe('A');
    expect(keyNameFromEvent(fakeEvent({ code: 'KeyZ', key: 'z' }))).toBe('Z');
  });

  test('digits', () => {
    expect(keyNameFromEvent(fakeEvent({ code: 'Digit0', key: '0' }))).toBe('0');
    expect(keyNameFromEvent(fakeEvent({ code: 'Digit9', key: '9' }))).toBe('9');
    expect(keyNameFromEvent(fakeEvent({ code: 'Numpad5', key: '5' }))).toBe('5');
  });

  test('function keys F1-F24', () => {
    expect(keyNameFromEvent(fakeEvent({ code: 'F1', key: 'F1' }))).toBe('F1');
    expect(keyNameFromEvent(fakeEvent({ code: 'F24', key: 'F24' }))).toBe('F24');
  });

  test('named keys match the Describe table', () => {
    expect(keyNameFromEvent(fakeEvent({ code: 'Space', key: ' ' }))).toBe('Space');
    expect(keyNameFromEvent(fakeEvent({ code: 'ArrowLeft', key: 'ArrowLeft' }))).toBe('Left');
    expect(keyNameFromEvent(fakeEvent({ code: 'ArrowUp', key: 'ArrowUp' }))).toBe('Up');
    expect(keyNameFromEvent(fakeEvent({ code: 'ArrowRight', key: 'ArrowRight' }))).toBe('Right');
    expect(keyNameFromEvent(fakeEvent({ code: 'ArrowDown', key: 'ArrowDown' }))).toBe('Down');
    expect(keyNameFromEvent(fakeEvent({ code: 'Period', key: '.' }))).toBe('.');
    expect(keyNameFromEvent(fakeEvent({ code: 'Comma', key: ',' }))).toBe(',');
    expect(keyNameFromEvent(fakeEvent({ code: 'Minus', key: '-' }))).toBe('-');
    expect(keyNameFromEvent(fakeEvent({ code: 'Equal', key: '=' }))).toBe('=');
    expect(keyNameFromEvent(fakeEvent({ code: 'Slash', key: '/' }))).toBe('/');
    expect(keyNameFromEvent(fakeEvent({ code: 'Semicolon', key: ';' }))).toBe(';');
    expect(keyNameFromEvent(fakeEvent({ code: 'Quote', key: "'" }))).toBe("'");
    expect(keyNameFromEvent(fakeEvent({ code: 'BracketLeft', key: '[' }))).toBe('[');
    expect(keyNameFromEvent(fakeEvent({ code: 'BracketRight', key: ']' }))).toBe(']');
  });

  test('unusable keys return null (backslash has no TryParse case shell-side)', () => {
    expect(keyNameFromEvent(fakeEvent({ code: 'Backslash', key: '\\' }))).toBeNull();
    expect(keyNameFromEvent(fakeEvent({ code: 'Tab', key: 'Tab' }))).toBeNull();
    expect(keyNameFromEvent(fakeEvent({ code: 'F25', key: 'F25' }))).toBeNull();
  });
});

describe('isModifierKey', () => {
  test('maps to the canonical modifier names', () => {
    expect(isModifierKey(fakeEvent({ code: 'ControlLeft', key: 'Control' }))).toBe('Ctrl');
    expect(isModifierKey(fakeEvent({ code: 'AltLeft', key: 'Alt' }))).toBe('Alt');
    expect(isModifierKey(fakeEvent({ code: 'AltRight', key: 'AltGraph' }))).toBe('Alt');
    expect(isModifierKey(fakeEvent({ code: 'MetaLeft', key: 'Meta' }))).toBe('Win');
    expect(isModifierKey(fakeEvent({ code: 'ShiftLeft', key: 'Shift' }))).toBe('Shift');
    expect(isModifierKey(fakeEvent({ code: 'KeyA', key: 'a' }))).toBeNull();
  });
});

describe('comboToString', () => {
  test('orders modifiers Ctrl, Alt, Win, Shift like Describe', () => {
    expect(comboToString(['Ctrl', 'Alt'], 'Space')).toBe('Ctrl+Alt+Space');
    expect(comboToString(['Shift', 'Win', 'Ctrl'], 'K')).toBe('Ctrl+Win+Shift+K');
    expect(comboToString([], 'X')).toBe('X');
  });

  test('deduplicates modifiers', () => {
    expect(comboToString(['Ctrl', 'Ctrl', 'Alt'], 'P')).toBe('Ctrl+Alt+P');
  });
});

describe('isRecorderReservedKey', () => {
  test('reserved and capturable keys are swallowed', () => {
    expect(isRecorderReservedKey(fakeEvent({ code: 'ControlLeft', key: 'Control' }))).toBe(true);
    expect(isRecorderReservedKey(fakeEvent({ code: 'Backspace', key: 'Backspace' }))).toBe(true);
    expect(isRecorderReservedKey(fakeEvent({ code: 'Escape', key: 'Escape' }))).toBe(true);
    expect(isRecorderReservedKey(fakeEvent({ code: 'Enter', key: 'Enter' }))).toBe(true);
    expect(isRecorderReservedKey(fakeEvent({ code: 'KeyG', key: 'g' }))).toBe(true);
  });

  test('unusable keys pass through', () => {
    expect(isRecorderReservedKey(fakeEvent({ code: 'Tab', key: 'Tab' }))).toBe(false);
  });
});
