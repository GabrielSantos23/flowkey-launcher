import { notifyReact } from '../../lib/reactive';
import {
  doubleWayTranslate,
  playTTS,
  getGoogleTranslateWebUrl,
  type LanguageCodeSet,
  type SimpleTranslateResult,
  AUTO_DETECT,
} from './simpleTranslate';
import { getLanguageName } from './languages';
import { writeText } from 'tauri-plugin-clipboard-x-api';
import * as commands from '../../lib/ipc/commands';
import { openUrl } from '@tauri-apps/plugin-opener';
import { feedbackService } from '../../services/feedback/feedbackService';
import { logService } from '../../services/log/logService';
import { resetLauncherState } from '../../lib/launcher/launcherReset';

export class TranslateViewStateClass {
  query: string = '';
  selectedLanguageSet: LanguageCodeSet = {
    langFrom: 'auto',
    langTo: ['pt'],
  };
  results: SimpleTranslateResult[] = [];
  selectedIndex: number = 0;
  isLoading: boolean = false;
  isShowingDetail: boolean = false;
  error: string | null = null;

  private debounceTimer: any = null;
  private currentRequestId: number = 0;

  reset(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.currentRequestId++;
    this.query = '';
    this.results = [];
    this.selectedIndex = 0;
    this.isLoading = false;
    this.isShowingDetail = false;
    this.error = null;
    notifyReact();
  }

  get selectedItem(): SimpleTranslateResult | null {
    if (!this.results.length) return null;
    return this.results[this.selectedIndex] ?? this.results[0];
  }

  setQuery(text: string): void {
    this.query = text;
    this.selectedIndex = 0;
    this.error = null;

    if (!text || !text.trim()) {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      this.results = [];
      this.isLoading = false;
      notifyReact();
      return;
    }

    this.isLoading = true;
    notifyReact();

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.triggerTranslate();
    }, 300);
  }

  setLanguagePairString(pair: string): void {
    if (!pair) return;
    const parts = pair.split(':');
    const from = parts[0] || 'auto';
    const to = parts[1] || 'en';

    this.selectedLanguageSet = {
      langFrom: from,
      langTo: [to],
    };

    if (this.query.trim()) {
      this.triggerTranslate();
    } else {
      notifyReact();
    }
  }

  async triggerTranslate(): Promise<void> {
    const text = this.query.trim();
    if (!text) {
      this.results = [];
      this.isLoading = false;
      notifyReact();
      return;
    }

    const requestId = ++this.currentRequestId;
    this.isLoading = true;
    this.error = null;
    notifyReact();

    try {
      const res = await doubleWayTranslate(text, this.selectedLanguageSet);
      if (this.currentRequestId === requestId) {
        this.results = res;
        this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, res.length - 1));
        this.isLoading = false;
        notifyReact();
      }
    } catch (err: any) {
      if (this.currentRequestId === requestId) {
        this.error = err?.message || 'Translation failed';
        this.isLoading = false;
        notifyReact();
      }
    }
  }

  moveSelection(direction: 'up' | 'down'): void {
    if (!this.results.length) return;
    if (direction === 'down') {
      this.selectedIndex = (this.selectedIndex + 1) % this.results.length;
    } else {
      this.selectedIndex = (this.selectedIndex - 1 + this.results.length) % this.results.length;
    }
    notifyReact();
  }

  toggleShowingDetail(): void {
    this.isShowingDetail = !this.isShowingDetail;
    notifyReact();
  }

  async copyTranslation(item?: SimpleTranslateResult): Promise<void> {
    const target = item || this.selectedItem;
    if (!target || !target.translatedText) return;

    try {
      await writeText(target.translatedText);
      await commands.hideWindow();
      resetLauncherState();
    } catch (err) {
      logService.error(`Failed to copy translation: ${err}`);
    }
  }

  async pasteTranslation(item?: SimpleTranslateResult): Promise<void> {
    const target = item || this.selectedItem;
    if (!target || !target.translatedText) return;

    try {
      await writeText(target.translatedText);
      await commands.hideWindow();
      await commands.simulatePaste();
      resetLauncherState();
    } catch (err) {
      logService.error(`Failed to paste translation: ${err}`);
    }
  }

  playSelectedTTS(item?: SimpleTranslateResult): void {
    const target = item || this.selectedItem;
    if (!target || !target.translatedText) return;
    playTTS(target.translatedText, target.langTo);
  }

  async openInBrowser(item?: SimpleTranslateResult): Promise<void> {
    const target = item || this.selectedItem;
    const from = target?.langFrom || this.selectedLanguageSet.langFrom || AUTO_DETECT;
    const to = target?.langTo || this.selectedLanguageSet.langTo[0] || 'en';
    const text = target?.originalText || this.query;
    const url = getGoogleTranslateWebUrl(text, from, to);

    try {
      await openUrl(url);
    } catch (err) {
      logService.error(`Failed to open Google Translate in browser: ${err}`);
    }
  }

  formatLanguagesFlow(langFrom: string, langTo: string): string {
    const fromName = getLanguageName(langFrom);
    const toName = getLanguageName(langTo);
    return `${fromName} → ${toName}`;
  }
}

export const translateViewState = new TranslateViewStateClass();
