import React, { useEffect } from 'react';
import ExtensionIframe from './ExtensionIframe';
import { isBuiltInFeature } from '../../services/extension/extensionDiscovery';
import { searchBarAccessoryService } from '../../services/search/searchBarAccessoryService';
import { applyAccessoryFromCommand } from '../../services/search/applyAccessoryFromCommand';
import type { ExtensionCommand } from 'asyar-sdk/contracts';

export interface ExtensionViewContainerProps {
  activeView: string;
  extensionManager: any;
}

export default function ExtensionViewContainer({
  activeView,
  extensionManager,
}: ExtensionViewContainerProps) {
  const extensionId = activeView.split('/')[0];
  const viewName = activeView.split('/')[1] || 'DefaultView';
  const isBuiltIn = isBuiltInFeature(extensionId);
  const manifest = extensionManager?.getManifestById
    ? extensionManager.getManifestById(extensionId)
    : null;
  const module = extensionManager?.getLoadedExtensionModule
    ? extensionManager.getLoadedExtensionModule(extensionId)
    : null;

  const ActiveComponent = (() => {
    if (!isBuiltIn || !module) return null;
    const direct = module[viewName] ?? module.default?.[viewName];
    if (typeof direct === 'function') return direct;
    if (viewName === 'DefaultView' && typeof module.default === 'function') {
      return module.default;
    }
    return null;
  })();

  useEffect(() => {
    if (!extensionId || !viewName) return;
    const command = manifest?.commands?.find((c: ExtensionCommand) => c.component === viewName);
    if (!command) return;
    const commandId = command.id;
    void applyAccessoryFromCommand(command, extensionId, commandId);
    return () => {
      const active = searchBarAccessoryService.active;
      if (active && active.extensionId === extensionId && active.commandId === commandId) {
        searchBarAccessoryService.clear();
      }
    };
  }, [extensionId, viewName, manifest]);

  return (
    <div className="min-h-full flex flex-col flex-1 h-full" data-extension-view={activeView}>
      {isBuiltIn ? (
        ActiveComponent ? (
          <ActiveComponent extensionManager={extensionManager} />
        ) : (
          <div className="p-4 text-center text-[var(--accent-danger)] font-mono text-sm">
            Error: Built-in feature {extensionId} has no export matching '{viewName}'
          </div>
        )
      ) : (
        <ExtensionIframe extensionId={extensionId} view={activeView} manifest={manifest ?? null} />
      )}
    </div>
  );
}
