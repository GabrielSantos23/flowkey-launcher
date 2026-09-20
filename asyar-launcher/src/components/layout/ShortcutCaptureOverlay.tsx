import React from 'react';
import ShortcutCapture from '../../built-in-features/shortcuts/ShortcutCapture';
import { shortcutService } from '../../built-in-features/shortcuts/shortcutService';
import type { SearchResult } from '../../services/search/interfaces/SearchResult';

export interface ShortcutCaptureOverlayProps {
  target: SearchResult;
  oncapture?: () => void;
  oncancel?: () => void;
}

export default function ShortcutCaptureOverlay({
  target,
  oncapture,
  oncancel,
}: ShortcutCaptureOverlayProps) {
  const handleSave = async (detail: { modifier: string; key: string }): Promise<string | true> => {
    const shortcut = `${detail.modifier}+${detail.key}`;
    const result = await shortcutService.register(
      target.objectId,
      target.name,
      target.type === 'application' || target.type === 'command' ? target.type : 'command',
      shortcut,
      target.path ?? undefined,
      target.icon ?? undefined,
    );

    if (!result.ok) {
      const reason = result.conflict?.itemName ?? 'Unsupported key or OS error';
      return `Could not assign: ${reason}`;
    }

    return true;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <ShortcutCapture
        onsave={handleSave}
        oncancel={oncancel}
        ondone={() => oncapture?.()}
        excludeObjectId={target.objectId}
      />
    </div>
  );
}
