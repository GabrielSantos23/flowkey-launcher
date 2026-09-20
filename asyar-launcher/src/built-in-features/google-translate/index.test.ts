/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/action/actionService', () => ({
  actionService: {
    registerAction: vi.fn(),
    unregisterAction: vi.fn(),
  },
}));

vi.mock('../../services/search/searchBarAccessoryService', () => ({
  searchBarAccessoryService: {
    active: {
      extensionId: 'google-translate',
      commandId: 'translate',
      value: 'auto:pt',
    },
    subscribe: vi.fn().mockReturnValue(() => {}),
  },
}));

vi.mock('../../services/log/logService', () => ({
  logService: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import extension, { DefaultView } from './index';
import { actionService } from '../../services/action/actionService';
import { searchBarAccessoryService } from '../../services/search/searchBarAccessoryService';
import { translateViewState } from './state';

function makeContext(manager: any) {
  return {
    getService: <T>(name: string): T => {
      if (name === 'extensions') return manager as unknown as T;
      if (name === 'log') {
        return {
          info: vi.fn(),
          debug: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        } as unknown as T;
      }
      return {} as unknown as T;
    },
  } as any;
}

describe('Google Translate Extension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports DefaultView component and extension singleton', () => {
    expect(typeof extension).toBe('object');
    expect(typeof extension.executeCommand).toBe('function');
    expect(typeof DefaultView).toBe('function');
  });

  it('initializes cleanly with extension context', async () => {
    const ctx = makeContext({ navigateToView: vi.fn() });
    await extension.initialize(ctx);
  });

  it('executes translate command and navigates to DefaultView', async () => {
    const navigateToView = vi.fn();
    const ctx = makeContext({ navigateToView });
    await extension.initialize(ctx);

    const result = await extension.executeCommand('translate');
    expect(result.type).toBe('view');
    expect(result.viewPath).toBe('google-translate/DefaultView');
    expect(navigateToView).toHaveBeenCalledWith('google-translate/DefaultView');
  });

  it('throws error on unknown command', async () => {
    await expect(extension.executeCommand('unknown-command')).rejects.toThrow();
  });

  it('registers and unregisters view actions on activation and deactivation', async () => {
    const setActiveViewActionLabel = vi.fn();
    const ctx = makeContext({ navigateToView: vi.fn(), setActiveViewActionLabel });
    await extension.initialize(ctx);

    await extension.viewActivated('google-translate/DefaultView');
    expect(setActiveViewActionLabel).toHaveBeenCalledWith('Copy Translation');
    expect(actionService.registerAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'google-translate:copy' }),
    );
    expect(actionService.registerAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'google-translate:paste' }),
    );
    expect(actionService.registerAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'google-translate:toggle-detail' }),
    );
    expect(actionService.registerAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'google-translate:tts' }),
    );
    expect(actionService.registerAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'google-translate:open-browser' }),
    );
    expect(searchBarAccessoryService.subscribe).toHaveBeenCalled();

    await extension.viewDeactivated('google-translate/DefaultView');
    expect(setActiveViewActionLabel).toHaveBeenCalledWith(null);
    expect(actionService.unregisterAction).toHaveBeenCalledWith('google-translate:copy');
    expect(actionService.unregisterAction).toHaveBeenCalledWith('google-translate:paste');
    expect(actionService.unregisterAction).toHaveBeenCalledWith('google-translate:toggle-detail');
    expect(actionService.unregisterAction).toHaveBeenCalledWith('google-translate:tts');
    expect(actionService.unregisterAction).toHaveBeenCalledWith('google-translate:open-browser');
  });

  it('updates query state on onViewSearch', async () => {
    const setQuerySpy = vi.spyOn(translateViewState, 'setQuery');
    await extension.onViewSearch('teste');
    expect(setQuerySpy).toHaveBeenCalledWith('teste');
    setQuerySpy.mockRestore();
  });
});
