import type {
  ExtensionContext,
  Extension,
  IExtensionManager,
  ILogService,
} from 'asyar-sdk/contracts';
import { ActionContext } from 'asyar-sdk/contracts';
import * as commands from '../../lib/ipc/commands';
import DefaultView from './DefaultView';
import { actionService } from '../../services/action/actionService';
import { permissionConsentService } from '../../services/extension/permissionConsentService';
import { feedbackService } from '../../services/feedback/feedbackService';

export { DefaultView };

const EXTENSION_ID = 'store';
const ACTION_ID_INSTALL_FILE = 'app.asyar.extensions:install-file';
const ACTION_ID_INSTALL_FOLDER = 'app.asyar.extensions:install-folder';

/**
 * Local extensions manager. Installs come from the user's own downloads —
 * `.asyar` packages through the native file picker, or unpacked folders
 * registered live on disk — never from a remote marketplace.
 */
class ExtensionsManagerExtension implements Extension {
  private extensionManager?: IExtensionManager;
  private logService?: ILogService;
  private inView: boolean = false;
  private viewActionsRegistered: boolean = false;

  async initialize(context: ExtensionContext): Promise<void> {
    this.logService = context.getService<ILogService>('log');
    this.extensionManager = context.getService<IExtensionManager>('extensions');
    this.logService?.info('Extensions manager initialized.');
  }

  async activate(): Promise<void> {}

  async deactivate(): Promise<void> {
    this.viewActionsRegistered = false;
    actionService.unregisterAction(ACTION_ID_INSTALL_FILE);
    actionService.unregisterAction(ACTION_ID_INSTALL_FOLDER);
  }

  async executeCommand(commandId: string, _args?: Record<string, any>): Promise<any> {
    if (commandId === 'browse') {
      this.extensionManager?.navigateToView('store/DefaultView');
      this.registerViewActions();
      return {
        type: 'view',
        viewPath: 'store/DefaultView',
      };
    }
    this.logService?.error(`Received unknown command ID: ${commandId}`);
    throw new Error(`Unknown command: ${commandId}`);
  }

  async viewActivated(_viewPath: string): Promise<void> {
    this.inView = true;
  }

  async viewDeactivated(_viewPath: string): Promise<void> {
    this.inView = false;
    this.viewActionsRegistered = false;
    actionService.unregisterAction(ACTION_ID_INSTALL_FILE);
    actionService.unregisterAction(ACTION_ID_INSTALL_FOLDER);
  }

  private registerViewActions() {
    if (this.viewActionsRegistered) return;
    this.viewActionsRegistered = true;
    actionService.registerAction({
      id: ACTION_ID_INSTALL_FILE,
      title: 'Install from file…',
      description: 'Pick an .asyar package and install it',
      icon: 'icon:download',
      extensionId: EXTENSION_ID,
      context: ActionContext.EXTENSION_VIEW,
      visible: () => this.inView,
      execute: () => this.installFromFile(),
    });
    actionService.registerAction({
      id: ACTION_ID_INSTALL_FOLDER,
      title: 'Install from folder…',
      description: 'Register an unpacked extension folder',
      icon: 'icon:folder',
      extensionId: EXTENSION_ID,
      context: ActionContext.EXTENSION_VIEW,
      visible: () => this.inView,
      execute: () => this.installFromFolder(),
    });
  }

  /** Native picker → install a packaged `.asyar` extension. */
  async installFromFile(): Promise<void> {
    const filePath = await commands.showOpenExtensionDialog();
    if (!filePath) return;
    try {
      await commands.installExtensionFromFile(filePath);
      await this.extensionManager?.reloadExtensions();
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'success',
        retryable: false,
        context: { message: 'Extension installed' },
      });
    } catch (err) {
      this.logService?.error(`Install from file failed: ${err}`);
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'error',
        retryable: false,
        context: { message: `Install failed: ${err}` },
      });
    }
  }

  /** Folder picker → inspect → consent → register an unpacked extension. */
  async installFromFolder(): Promise<void> {
    const folder = await commands.showOpenFolderDialog();
    if (!folder) return;

    const inspection = await commands.inspectExtensionFolder(folder);
    if (!inspection) {
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'error',
        retryable: false,
        context: { message: 'Could not read that folder — is there a manifest.json in it?' },
      });
      return;
    }

    const { manifest, compatibility } = inspection;
    if (
      compatibility.status === 'sdkMismatch' ||
      compatibility.status === 'appVersionTooOld' ||
      compatibility.status === 'platformNotSupported'
    ) {
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'error',
        retryable: false,
        context: {
          message: `${manifest.name} is not compatible with this app (${compatibility.status})`,
        },
      });
      return;
    }

    const permissions = manifest.permissions ?? [];
    if (permissions.length > 0) {
      const accepted = await permissionConsentService.requestConsent({
        extensionId: manifest.id,
        extensionName: manifest.name,
        reason: 'install',
        permissions,
        permissionArgs: (manifest.permissionArgs ?? {}) as Record<string, unknown>,
        runtimeDownloads: [],
      });
      if (!accepted) {
        this.logService?.info(`Folder install of ${manifest.name} declined at permission consent`);
        return;
      }
    }

    const registered = await commands.registerDevExtension(manifest.id, folder);
    if (!registered) {
      feedbackService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'error',
        retryable: false,
        context: { message: `Could not register ${manifest.name} — check the path` },
      });
      return;
    }

    await this.extensionManager?.reloadExtensions();
    feedbackService.report({
      source: 'frontend',
      kind: 'manual',
      severity: 'success',
      retryable: false,
      context: { message: `${manifest.name} installed from folder` },
    });
  }
}

export const extensionsManager = new ExtensionsManagerExtension();
export default extensionsManager;
