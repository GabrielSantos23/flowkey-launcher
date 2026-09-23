import { describe, expect, test } from 'bun:test';
import manifest from '../manifest.json';

const BACKGROUND_COMMANDS = new Set([
  'toggle-play-pause',
  'next',
  'previous',
  'just-play',
  'like',
  'dislike',
  'toggle-shuffle',
  'cycle-repeat',
  'replay',
  'volume-0',
  'volume-25',
  'volume-50',
  'volume-75',
  'volume-100',
  'volume-up',
  'volume-down',
  'start-radio',
  'copy-url',
  'copy-artist-and-title',
  'copy-embed',
  'skip-15',
  'back-15',
]);

const VIEW_COMMANDS = new Set([
  'search',
  'your-library',
  'now-playing',
  'queue',
  'devices',
  'current-track',
  'add-playing-to-playlist',
  'remove-playing-from-playlist',
  'find-lyrics',
]);

describe('spotify manifest modes', () => {
  test('direct player actions run in the background', () => {
    const commands = new Map(manifest.commands.map((command) => [command.id, command]));
    for (const id of BACKGROUND_COMMANDS) {
      expect(commands.get(id)?.mode).toBe('background');
    }
  });

  test('interactive commands keep the view mode', () => {
    const commands = new Map(manifest.commands.map((command) => [command.id, command]));
    for (const id of VIEW_COMMANDS) {
      const mode = commands.get(id)?.mode;
      expect(mode === 'view' || mode === undefined).toBe(true);
    }
  });

  test('every command has a mode assignment and no extras exist', () => {
    const ids = manifest.commands.map((command) => command.id);
    for (const id of ids) {
      expect(BACKGROUND_COMMANDS.has(id) || VIEW_COMMANDS.has(id)).toBe(true);
    }
    expect(ids.length).toBe(BACKGROUND_COMMANDS.size + VIEW_COMMANDS.size);
  });
});
