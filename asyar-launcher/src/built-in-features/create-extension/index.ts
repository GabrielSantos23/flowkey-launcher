import type { Extension, ExtensionContext, IExtensionManager } from 'asyar-sdk/contracts';
import DefaultView from './CreateExtensionView';

class CreateExtension implements Extension {
  private extensionManager?: IExtensionManager;

  async initialize(context: ExtensionContext) {
    this.extensionManager = context.getService<IExtensionManager>('extensions');

    context.registerCommand('open', {
      execute: async () => {
        this.extensionManager?.navigateToView('create-extension/DefaultView');
      },
    });
  }

  // No lifecycle work needed — required by the Extension contract.
  async activate(): Promise<void> {}

  async deactivate(): Promise<void> {}

  async executeCommand(commandId: string): Promise<any> {
    if (commandId === 'open') {
      this.extensionManager?.navigateToView('create-extension/DefaultView');
    }
    return { type: 'no-view' };
  }
}

export default new CreateExtension();
export { DefaultView };
