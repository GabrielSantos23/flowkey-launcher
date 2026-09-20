// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';

const commandMocks = vi.hoisted(() => ({
  pauseAllShortcuts: vi.fn().mockResolvedValue(undefined),
  resumeAllShortcuts: vi.fn().mockResolvedValue(undefined),
  getValidShortcutKeys: vi.fn().mockResolvedValue(['A', 'B', 'K']),
}));

vi.mock('../../../lib/ipc/commands', () => ({
  pauseAllShortcuts: commandMocks.pauseAllShortcuts,
  resumeAllShortcuts: commandMocks.resumeAllShortcuts,
  getValidShortcutKeys: commandMocks.getValidShortcutKeys,
  getAliasConflicts: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../../services/extension/extensionIframeManager', () => ({
  extensionIframeManager: { hasInputFocus: false },
}));
vi.mock('./shortcutService', () => ({
  shortcutService: { isConflict: vi.fn().mockResolvedValue(null) },
}));
vi.mock('./shortcutStore', () => ({
  shortcutStore: { isCapturing: false },
}));

import ShortcutCapture from './ShortcutCapture';

describe('ShortcutCapture', () => {
  it('captures Ctrl+Shift+B pressed on the window', async () => {
    const onsave = vi.fn().mockResolvedValue(true);
    render(<ShortcutCapture onsave={onsave} />);

    fireEvent.keyDown(window, {
      key: 'B',
      code: 'KeyB',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
    });

    await waitFor(() => expect(onsave).toHaveBeenCalled(), { timeout: 2000 });
    expect(onsave).toHaveBeenCalledWith({ modifier: 'Control+Shift', key: 'B' });
  });

  it('captures Alt+B', async () => {
    const onsave = vi.fn().mockResolvedValue(true);
    render(<ShortcutCapture onsave={onsave} />);

    fireEvent.keyDown(window, {
      key: 'b',
      code: 'KeyB',
      altKey: true,
      bubbles: true,
    });

    await waitFor(() => expect(onsave).toHaveBeenCalled(), { timeout: 2000 });
    expect(onsave).toHaveBeenCalledWith({ modifier: 'Alt', key: 'B' });
  });

  it('still captures when the valid-keys table has not loaded (fail-open)', async () => {
    commandMocks.getValidShortcutKeys.mockResolvedValue([]); // empty table
    const onsave = vi.fn().mockResolvedValue(true);
    render(<ShortcutCapture onsave={onsave} />);

    fireEvent.keyDown(window, {
      key: 'B',
      code: 'KeyB',
      ctrlKey: true,
      bubbles: true,
    });

    await waitFor(() => expect(onsave).toHaveBeenCalled(), { timeout: 2000 });
  });
});
