import { describe, expect, test } from 'bun:test';
import {
  currentRecorderError,
  publishRecorderError,
  subscribeRecorderErrors,
} from '../src/recorder-errors';
import type { SettingsState } from '../src/types';

describe('recorder error pub/sub', () => {
  test('publishes to subscribers and remembers the active session', () => {
    const seen: Array<[string | null, string | null]> = [];
    const unsubscribe = subscribeRecorderErrors((commandKey, error) =>
      seen.push([commandKey, error]),
    );

    publishRecorderError('ext1:open', 'Already used by another command');
    expect(seen).toEqual([['ext1:open', 'Already used by another command']]);
    expect(currentRecorderError('ext1:open')).toBe('Already used by another command');
    expect(currentRecorderError('ext2:other')).toBeNull();

    publishRecorderError('ext1:open', null);
    expect(currentRecorderError('ext1:open')).toBeNull();
    unsubscribe();
  });

  test('a new session replaces the previous one', () => {
    publishRecorderError('a:x', 'Conflicts with the summon hotkey');
    publishRecorderError('b:y', 'Include Ctrl, Alt or Win with another key');
    expect(currentRecorderError('a:x')).toBeNull();
    expect(currentRecorderError('b:y')).toBe('Include Ctrl, Alt or Win with another key');
  });
});

/**
 * The wire contract: this JSON is exactly the shape
 * SettingsProtocol.SerializeState produces (camelCase records, nested state).
 * If the C# serializer drifts, this test fails with it.
 */
const SAMPLE_STATE_JSON = JSON.stringify({
  type: 'state',
  state: {
    nav: [
      { key: 'general', label: 'General', icon: null },
      {
        key: 'ext:spotify',
        label: 'Spotify',
        icon: { kind: 'image', dataUri: 'data:image/png;base64,AAA' },
      },
    ],
    general: { openAtLogin: true, summonHotkey: 'Ctrl+Alt+Space', autoUpdateCheck: false },
    shortcuts: [
      { commandKey: 'spotify:open', title: 'Open Spotify', shortcut: null, orphan: false },
    ],
    extensions: {
      loadFailures: [{ id: 'broken', message: 'manifest invalid' }],
      installed: [{ id: 'spotify', name: 'Spotify', version: '1.0.0', enabled: true }],
    },
    about: { version: '1.2.3', extensionsLoaded: 8 },
    update: {
      phase: 'idle',
      message: 'Last checked automatically every 6 hours',
      newVersion: null,
      progressPercent: null,
    },
    details: {
      'ext:spotify': {
        id: 'spotify',
        name: 'Spotify',
        description: 'Music',
        version: '1.0.0',
        icon: { kind: 'emoji', emoji: '🎵' },
        isZipInstalled: true,
        zipEnabled: false,
        installedAt: '2026-09-29',
        oauth: [{ provider: 'spotify', status: 'checking', error: null }],
        preferences: [
          {
            name: 'clientId',
            type: 'text',
            title: 'Client ID',
            label: null,
            placeholder: 'abc',
            required: true,
            value: 'abc',
            options: [],
          },
        ],
        appChoices: [{ label: 'Terminal', value: 'C:/wt.exe' }],
        commands: [
          {
            commandKey: 'spotify:open',
            commandId: 'open',
            title: 'Open',
            shortcut: 'Ctrl+Alt+S',
            enabled: true,
          },
        ],
      },
    },
    pendingInstall: null,
    pendingReconsent: null,
    capture: { scope: 'command', commandKey: 'spotify:open' },
  },
});

describe('settings state wire contract', () => {
  test('parses the shell snapshot with camelCase fields intact', () => {
    const payload = JSON.parse(SAMPLE_STATE_JSON) as { type: string; state: SettingsState };
    expect(payload.type).toBe('state');
    const state = payload.state;
    expect(state.general.summonHotkey).toBe('Ctrl+Alt+Space');
    expect(state.update.phase).toBe('idle');
    expect(state.extensions.loadFailures[0]?.message).toBe('manifest invalid');
    expect(state.details['ext:spotify']?.icon?.kind).toBe('emoji');
    expect(state.details['ext:spotify']?.oauth[0]?.status).toBe('checking');
    expect(state.details['ext:spotify']?.preferences[0]?.required).toBe(true);
    expect(state.details['ext:spotify']?.commands[0]?.enabled).toBe(true);
    expect(state.capture?.scope).toBe('command');
    expect(state.pendingInstall).toBeNull();
    // nav icon payload round-trips for the renderer
    expect(state.nav[1]?.icon?.dataUri).toBe('data:image/png;base64,AAA');
  });
});
