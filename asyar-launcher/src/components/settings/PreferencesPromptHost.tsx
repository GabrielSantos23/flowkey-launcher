import React from 'react';
import RequiredPreferencesDialog from './RequiredPreferencesDialog';
import { preferencesPromptStore } from '../../services/extension/preferencesPromptStore';
import { extensionPreferencesService } from '../../services/extension/extensionPreferencesService';
import { commandService } from '../../services/extension/commandService';
import { logService } from '../../services/log/logService';

export default function PreferencesPromptHost() {
  const active = preferencesPromptStore.active;
  if (!active) return null;

  const { extensionId, commandId, commandObjectId, missing } = active;

  const handleSave = async (values: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(values)) {
      const decl = missing.find((p) => p.name === key);
      if (!decl) continue;

      const decls = extensionPreferencesService.getDeclarations(extensionId);
      const isExtensionLevel = decls?.extension.some((p) => p.name === key) ?? false;
      const scope: string | null = isExtensionLevel ? null : commandId;

      try {
        await extensionPreferencesService.set(extensionId, scope, key, value);
      } catch (err) {
        logService.error(
          `PreferencesPromptHost: failed to save '${key}' for ${extensionId}: ${err}`,
        );
        return;
      }
    }

    preferencesPromptStore.close();

    try {
      await commandService.executeCommand(commandObjectId);
    } catch (err) {
      logService.error(
        `PreferencesPromptHost: command re-invocation failed for ${commandObjectId}: ${err}`,
      );
    }
  };

  const handleCancel = () => {
    preferencesPromptStore.close();
  };

  return (
    <RequiredPreferencesDialog
      extensionId={extensionId}
      commandId={commandId}
      missing={missing}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );
}
