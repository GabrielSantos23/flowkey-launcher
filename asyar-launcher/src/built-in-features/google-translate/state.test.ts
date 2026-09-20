import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translateViewState } from './state';
import * as simpleTranslateModule from './simpleTranslate';
import { writeText } from 'tauri-plugin-clipboard-x-api';
import * as commands from '../../lib/ipc/commands';
import { openUrl } from '@tauri-apps/plugin-opener';
import { resetLauncherState } from '../../lib/launcher/launcherReset';

vi.mock('tauri-plugin-clipboard-x-api', () => ({
  writeText: vi.fn(),
}));

vi.mock('../../lib/ipc/commands', () => ({
  hideWindow: vi.fn(),
  simulatePaste: vi.fn(),
}));

vi.mock('../../lib/launcher/launcherReset', () => ({
  resetLauncherState: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
}));

describe('Google Translate - TranslateViewState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translateViewState.reset();
    translateViewState.selectedLanguageSet = { langFrom: 'auto', langTo: ['pt'] };
  });

  it('initializes with default values', () => {
    expect(translateViewState.query).toBe('');
    expect(translateViewState.selectedLanguageSet.langFrom).toBe('auto');
    expect(translateViewState.selectedLanguageSet.langTo).toEqual(['pt']);
    expect(translateViewState.selectedItem).toBeNull();
  });

  it('moves selection correctly and wraps around', () => {
    translateViewState.results = [
      { originalText: 'test', translatedText: 'teste', langFrom: 'en', langTo: 'pt' },
      { originalText: 'test', translatedText: 'test', langFrom: 'pt', langTo: 'en' },
    ];

    expect(translateViewState.selectedIndex).toBe(0);
    translateViewState.moveSelection('down');
    expect(translateViewState.selectedIndex).toBe(1);

    translateViewState.moveSelection('down');
    expect(translateViewState.selectedIndex).toBe(0);

    translateViewState.moveSelection('up');
    expect(translateViewState.selectedIndex).toBe(1);
  });

  it('toggles detail view', () => {
    expect(translateViewState.isShowingDetail).toBe(false);
    translateViewState.toggleShowingDetail();
    expect(translateViewState.isShowingDetail).toBe(true);
    translateViewState.toggleShowingDetail();
    expect(translateViewState.isShowingDetail).toBe(false);
  });

  it('updates language pair string correctly', () => {
    translateViewState.setLanguagePairString('en:es');
    expect(translateViewState.selectedLanguageSet.langFrom).toBe('en');
    expect(translateViewState.selectedLanguageSet.langTo).toEqual(['es']);
  });

  it('copies translation to clipboard, hides window and resets launcher', async () => {
    translateViewState.results = [
      { originalText: 'hello', translatedText: 'olá', langFrom: 'en', langTo: 'pt' },
    ];

    await translateViewState.copyTranslation();
    expect(writeText).toHaveBeenCalledWith('olá');
    expect(commands.hideWindow).toHaveBeenCalled();
    expect(resetLauncherState).toHaveBeenCalled();
  });

  it('pastes translation to active window', async () => {
    translateViewState.results = [
      { originalText: 'hello', translatedText: 'olá', langFrom: 'en', langTo: 'pt' },
    ];

    await translateViewState.pasteTranslation();
    expect(writeText).toHaveBeenCalledWith('olá');
    expect(commands.hideWindow).toHaveBeenCalled();
    expect(commands.simulatePaste).toHaveBeenCalled();
    expect(resetLauncherState).toHaveBeenCalled();
  });

  it('resets query, results, index and status on reset()', () => {
    translateViewState.query = 'test';
    translateViewState.results = [
      { originalText: 'test', translatedText: 'teste', langFrom: 'en', langTo: 'pt' },
    ];
    translateViewState.selectedIndex = 1;
    translateViewState.isLoading = true;
    translateViewState.isShowingDetail = true;
    translateViewState.error = 'err';

    translateViewState.reset();

    expect(translateViewState.query).toBe('');
    expect(translateViewState.results).toEqual([]);
    expect(translateViewState.selectedIndex).toBe(0);
    expect(translateViewState.isLoading).toBe(false);
    expect(translateViewState.isShowingDetail).toBe(false);
    expect(translateViewState.error).toBeNull();
  });

  it('opens translation in browser', async () => {
    translateViewState.results = [
      { originalText: 'hello', translatedText: 'olá', langFrom: 'en', langTo: 'pt' },
    ];

    await translateViewState.openInBrowser();
    expect(openUrl).toHaveBeenCalledWith(
      expect.stringContaining('https://translate.google.com/?sl=en&tl=pt&text=hello'),
    );
  });

  it('plays TTS for selected translation', () => {
    const playTtsSpy = vi.spyOn(simpleTranslateModule, 'playTTS').mockImplementation(() => {});
    translateViewState.results = [
      { originalText: 'hello', translatedText: 'olá', langFrom: 'en', langTo: 'pt' },
    ];

    translateViewState.playSelectedTTS();
    expect(playTtsSpy).toHaveBeenCalledWith('olá', 'pt');
    playTtsSpy.mockRestore();
  });
});
