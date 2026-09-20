import { translateViewState } from './state';
import DefaultView from './DefaultView';
import { actionService } from '../../services/action/actionService';
import { searchBarAccessoryService } from '../../services/search/searchBarAccessoryService';
import { searchStores } from '../../services/search/stores/search';
import { logService } from '../../services/log/logService';
import {
  type Extension,
  type ExtensionContext,
  type ILogService,
  type IExtensionManager,
  ActionContext,
} from 'asyar-sdk/contracts';

class GoogleTranslateExtension implements Extension {
  onUnload: any;

  private logService?: ILogService;
  private extensionManager?: IExtensionManager;
  private inView: boolean = false;
  private context?: ExtensionContext;
  private unsubscribeAccessory?: () => void;

  async initialize(context: ExtensionContext): Promise<void> {
    try {
      this.context = context;
      this.logService = context.getService<ILogService>('log');
      this.extensionManager = context.getService<IExtensionManager>('extensions');

      this.logService?.info('Google Translate extension initialized');
    } catch (error) {
      logService.error(`Google Translate initialization failed: ${error}`);
    }
  }

  async executeCommand(commandId: string, _args?: Record<string, any>): Promise<any> {
    this.logService?.info(`Executing translate command: ${commandId}`);

    switch (commandId) {
      case 'translate':
      case 'DefaultView':
        this.extensionManager?.navigateToView('google-translate/DefaultView');
        return {
          type: 'view',
          viewPath: 'google-translate/DefaultView',
        };

      default:
        this.logService?.error(`Received unknown command ID: ${commandId}`);
        throw new Error(`Unknown command: ${commandId}`);
    }
  }

  async viewActivated(viewPath: string): Promise<void> {
    this.inView = true;
    this.logService?.debug(`Google Translate view activated: ${viewPath}`);

    translateViewState.reset();
    if (searchStores.query) {
      translateViewState.setQuery(searchStores.query);
    }

    window.addEventListener('keydown', this.handleKeydownBound);
    this.extensionManager?.setActiveViewActionLabel('Copy Translation');

    // Subscribe to search bar accessory dropdown selections
    if (
      searchBarAccessoryService.active?.extensionId === 'google-translate' &&
      searchBarAccessoryService.active.value
    ) {
      translateViewState.setLanguagePairString(searchBarAccessoryService.active.value);
    }

    this.unsubscribeAccessory = searchBarAccessoryService.subscribe(
      'google-translate',
      'translate',
      (val) => {
        translateViewState.setLanguagePairString(val);
      },
    );

    this.registerViewActions();
  }

  private handleKeydownBound = (event: KeyboardEvent) => this.handleKeydown(event);

  private async handleKeydown(event: KeyboardEvent) {
    if (!this.inView) return;

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      translateViewState.moveSelection(event.key === 'ArrowUp' ? 'up' : 'down');
      return;
    }

    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (translateViewState.selectedItem) {
        event.preventDefault();
        event.stopPropagation();
        await translateViewState.copyTranslation();
      }
    }
  }

  private registerViewActions(): void {
    actionService.registerAction({
      id: 'google-translate:copy',
      title: 'Copy Translation',
      description: 'Copy selected translation to clipboard',
      icon: 'icon:copy',
      shortcut: 'Ctrl+Shift+C',
      category: 'translate-action',
      extensionId: 'google-translate',
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        await translateViewState.copyTranslation();
      },
    });

    actionService.registerAction({
      id: 'google-translate:paste',
      title: 'Paste Translation',
      description: 'Paste selected translation to active app',
      icon: 'icon:clipboard',
      shortcut: 'Ctrl+Enter',
      category: 'translate-action',
      extensionId: 'google-translate',
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        await translateViewState.pasteTranslation();
      },
    });

    actionService.registerAction({
      id: 'google-translate:toggle-detail',
      title: 'Toggle Full Text',
      description: 'Toggle full text detail view',
      icon: 'icon:type',
      shortcut: 'Ctrl+F',
      category: 'translate-action',
      extensionId: 'google-translate',
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        translateViewState.toggleShowingDetail();
      },
    });

    actionService.registerAction({
      id: 'google-translate:tts',
      title: 'Play Text-To-Speech',
      description: 'Play audio pronunciation of translated text',
      icon: 'icon:globe',
      shortcut: 'Ctrl+T',
      category: 'translate-action',
      extensionId: 'google-translate',
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        translateViewState.playSelectedTTS();
      },
    });

    actionService.registerAction({
      id: 'google-translate:open-browser',
      title: 'Open in Google Translate',
      description: 'Open translation on Google Translate website',
      icon: 'icon:globe',
      shortcut: 'Alt+Enter',
      category: 'translate-action',
      extensionId: 'google-translate',
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        await translateViewState.openInBrowser();
      },
    });
  }

  private unregisterViewActions(): void {
    actionService.unregisterAction('google-translate:copy');
    actionService.unregisterAction('google-translate:paste');
    actionService.unregisterAction('google-translate:toggle-detail');
    actionService.unregisterAction('google-translate:tts');
    actionService.unregisterAction('google-translate:open-browser');
  }

  async viewDeactivated(viewPath: string): Promise<void> {
    window.removeEventListener('keydown', this.handleKeydownBound);
    if (this.unsubscribeAccessory) {
      this.unsubscribeAccessory();
      this.unsubscribeAccessory = undefined;
    }
    this.unregisterViewActions();
    this.extensionManager?.setActiveViewActionLabel(null);
    translateViewState.reset();
    this.inView = false;
    this.logService?.debug(`Google Translate view deactivated: ${viewPath}`);
  }

  async onViewSearch(query: string): Promise<void> {
    translateViewState.setQuery(query);
  }

  async activate(): Promise<void> {}
  async deactivate(): Promise<void> {
    if (this.inView) {
      this.unregisterViewActions();
    }
  }
}

export default new GoogleTranslateExtension();
export { DefaultView };
