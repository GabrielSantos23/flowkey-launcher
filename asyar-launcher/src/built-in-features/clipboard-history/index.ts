import { clipboardViewState } from './state';
import DefaultView from './DefaultView';
import { actionService } from '../../services/action/actionService';
import { logService } from '../../services/log/logService';
import { feedbackService } from '../../services/feedback/feedbackService';

import { openUrl } from '@tauri-apps/plugin-opener';
import {
  type Extension,
  type ExtensionContext,
  type ILogService,
  type IExtensionManager,
  type IClipboardHistoryService,
  ActionContext,
  ClipboardItemType,
} from 'asyar-sdk/contracts';
import type { ExtensionAction } from 'asyar-sdk/contracts';
import { snippetUiState } from '../snippets/snippetUiState';

class ClipboardHistoryExtension implements Extension {
  onUnload: any;

  private logService?: ILogService;
  private extensionManager?: IExtensionManager;
  private clipboardService?: IClipboardHistoryService;
  private inView: boolean = false;
  private context?: ExtensionContext;

  async initialize(context: ExtensionContext): Promise<void> {
    try {
      this.context = context;
      this.logService = context.getService<ILogService>('log');
      this.extensionManager = context.getService<IExtensionManager>('extensions');
      this.clipboardService = context.getService<IClipboardHistoryService>('clipboard');

      if (!this.logService || !this.extensionManager || !this.clipboardService) {
        logService.error('Failed to initialize required services for Clipboard History');
        this.logService?.error('Failed to initialize required services for Clipboard History');
        return;
      }

      // Initialize state services
      clipboardViewState.initializeServices(context);

      actionService.setActionExecutor('act_clipboard-history_clear-history', async () => {
        try {
          await this.clipboardService?.clearNonFavorites();
          await this.refreshClipboardData();
        } catch (error) {
          this.logService?.error(`Failed to clear clipboard history: ${error}`);
        }
      });

      this.logService.info('Clipboard History extension initialized with services');
    } catch (error) {
      logService.error(`Clipboard History initialization failed: ${error}`);
      this.logService?.error(`Clipboard History initialization failed: ${error}`);
    }
  }

  async executeCommand(commandId: string, _args?: Record<string, any>): Promise<any> {
    this.logService?.info(`Executing clipboard command: ${commandId}`);

    switch (commandId) {
      case 'show-clipboard':
        this.extensionManager?.navigateToView('clipboard-history/DefaultView');
        this.registerViewActions();
        this.refreshClipboardData().catch((e) => {
          this.logService?.error(`refreshClipboardData failed: ${e}`);
          feedbackService.report({
            source: 'frontend',
            kind: 'manual',
            severity: 'warning',
            retryable: false,
            context: { message: 'Could not refresh clipboard history — list may be stale' },
          });
        });
        return {
          type: 'view',
          viewPath: 'clipboard-history/DefaultView',
        };

      default:
        this.logService?.error(`Received unknown command ID: ${commandId}`);
        throw new Error(`Unknown command: ${commandId}`);
    }
  }

  async viewActivated(viewPath: string): Promise<void> {
    this.inView = true;
    this.logService?.debug(`Clipboard History view activated: ${viewPath}`);

    clipboardViewState.clearMultiSelect();
    window.addEventListener('keydown', this.handleKeydownBound);
    this.extensionManager?.setActiveViewActionLabel('Paste');
  }

  private handleKeydownBound = (event: KeyboardEvent) => this.handleKeydown(event);

  private async handleKeydown(event: KeyboardEvent) {
    if (!this.inView) return;

    const state = clipboardViewState;
    if (!state.filteredItems.length) return;

    if (
      (event.metaKey || event.ctrlKey) &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown')
    ) {
      event.preventDefault();
      event.stopPropagation();
      clipboardViewState.moveSelectionAndExtend(event.key === 'ArrowUp' ? 'up' : 'down');
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      clipboardViewState.moveSelection(event.key === 'ArrowUp' ? 'up' : 'down');
    } else if (event.key === 'Enter' && state.selectedItem) {
      event.preventDefault();
      event.stopPropagation();
      if (state.selectedIds.length >= 2) {
        clipboardViewState.pasteMergedSelection();
      } else {
        clipboardViewState.handleItemAction(state.selectedItem, 'paste');
      }
    }
  }

  private registerViewActions() {
    if (!this.clipboardService) {
      this.logService?.warn('ClipboardService not available, cannot register view actions.');
      return;
    }

    actionService.registerAction({
      id: 'clipboard-history:paste-plain',
      title: 'Paste as Plain Text',
      description: 'Paste without rich formatting',
      icon: 'icon:clipboard',
      category: 'clipboard-action',
      extensionId: 'clipboard-history',
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        const item = clipboardViewState.selectedItem;
        if (!item) return;
        const plainText = await clipboardViewState.getPlainText(item);
        await this.clipboardService?.pasteItem({
          ...item,
          type: ClipboardItemType.Text,
          content: plainText,
        });
      },
    });

    actionService.registerAction({
      id: 'clipboard-history:toggle-favorite',
      title: 'Toggle Favorite',
      description: 'Star or unstar this item',
      icon: 'icon:star',
      category: 'clipboard-action',
      extensionId: 'clipboard-history',
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        const item = clipboardViewState.selectedItem;
        if (item) {
          await clipboardViewState.handleItemAction(item, 'favorite');
        }
      },
    });

    actionService.registerAction({
      id: 'clipboard-history:save-as-snippet',
      title: 'Save as Snippet',
      icon: 'icon:scissors',
      description: 'Open this clipboard item in the snippet editor',
      category: 'clipboard-action',
      extensionId: 'clipboard-history',
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        const item = clipboardViewState.selectedItem;
        if (!item || item.type === ClipboardItemType.Image || item.type === ClipboardItemType.Files)
          return;
        snippetUiState.prefillExpansion = await clipboardViewState.getPlainText(item);
        snippetUiState.editorTrigger = 'add';
        this.extensionManager?.navigateToView('snippets/DefaultView');
      },
    });

    actionService.registerAction({
      id: 'clipboard-history:delete',
      title: 'Delete',
      description: 'Delete this item from clipboard history',
      icon: 'icon:trash',
      destructive: true,
      shortcut: 'Super+Backspace',
      category: 'clipboard-action',
      extensionId: 'clipboard-history',
      context: ActionContext.EXTENSION_VIEW,
      execute: async () => {
        const item = clipboardViewState.selectedItem;
        if (item) {
          await clipboardViewState.handleItemAction(item, 'delete');
        }
      },
    });
  }

  private unregisterViewActions() {
    actionService.unregisterAction('clipboard-history:paste-plain');
    actionService.unregisterAction('clipboard-history:toggle-favorite');
    actionService.unregisterAction('clipboard-history:save-as-snippet');
    actionService.unregisterAction('clipboard-history:delete');
  }

  async viewDeactivated(viewPath: string): Promise<void> {
    window.removeEventListener('keydown', this.handleKeydownBound);
    this.unregisterViewActions();
    this.extensionManager?.setActiveViewActionLabel(null);
    this.inView = false;
    this.logService?.debug(`Clipboard History view deactivated: ${viewPath}`);
  }

  async onViewSearch(query: string): Promise<void> {
    clipboardViewState.setSearch(query);
  }

  private async refreshClipboardData() {
    if (this.clipboardService) {
      try {
        const items = await this.clipboardService.getRecentItems(100);
        clipboardViewState.items = items || [];
      } catch (error) {
        this.logService?.error(`Failed to load clipboard data: ${error}`);
      }
    }
  }

  async activate(): Promise<void> {}
  async deactivate(): Promise<void> {
    if (this.inView) {
      this.unregisterViewActions();
    }
  }
}

export default new ClipboardHistoryExtension();
export { DefaultView };
