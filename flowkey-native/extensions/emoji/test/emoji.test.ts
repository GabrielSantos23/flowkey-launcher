import { describe, expect, test } from 'bun:test';
import emoji from '../src/index.ts';

describe('emoji extension', () => {
  test('declares exactly one picker command', () => {
    const commands = emoji.manifest.commands;
    expect(commands.length).toBe(1);
    expect(commands[0].id).toBe('open');
  });

  test('search returns the grid for the open command', async () => {
    const ctx = { commandId: 'open' } as any;
    const view = await emoji.handlers!.search!('', ctx as any);
    expect((view as any).type).toBe('grid');
  });
});
