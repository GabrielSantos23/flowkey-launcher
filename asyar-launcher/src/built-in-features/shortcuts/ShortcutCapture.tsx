import React, { useEffect, useState } from 'react';
import Modal from '../../components/base/Modal';
import { shortcutService } from './shortcutService';
import { extensionIframeManager } from '../../services/extension/extensionIframeManager';
import { shortcutStore } from './shortcutStore';
import ShortcutRecorder from '../../components/base/ShortcutRecorder';
import { KeyboardHint } from '../../components/react/Badge';
import { initValidKeys, normalizeShortcut } from './shortcutFormatter';

export interface ShortcutCaptureProps {
  onsave?: (detail: { modifier: string; key: string }) => Promise<string | true>;
  oncancel?: () => void;
  ondone?: () => void;
  excludeObjectId?: string;
}

export default function ShortcutCapture({
  onsave,
  oncancel,
  ondone,
  excludeObjectId,
}: ShortcutCaptureProps) {
  const [modifier, setModifier] = useState('');
  const [key, setKey] = useState('');

  const conflictChecker = async (shortcut: string): Promise<{ name: string } | null> => {
    const conflict = await shortcutService.isConflict(normalizeShortcut(shortcut), excludeObjectId);
    if (conflict) return { name: conflict.itemName };
    return null;
  };

  useEffect(() => {
    shortcutStore.isCapturing = true;
    extensionIframeManager.hasInputFocus = true;
    (document.activeElement as HTMLElement)?.blur();
    // Ensure the valid-keys table is loaded before the recorder starts —
    // an empty table rejects every key as 'invalid' (silent dead recorder).
    void initValidKeys();

    return () => {
      shortcutStore.isCapturing = false;
      extensionIframeManager.hasInputFocus = false;
    };
  }, []);

  return (
    <Modal
      isOpen={true}
      title={'Assign Shortcut'}
      subtitle={'Press the combination you want to use'}
      onEscape={oncancel}
    >
      <div className="mb-5">
        <ShortcutRecorder
          modifier={modifier}
          keyName={key}
          autoRecord={true}
          onsave={onsave}
          oncancel={oncancel}
          ondone={ondone}
          conflictChecker={conflictChecker}
        />
      </div>

      <div className="text-[var(--text-tertiary)] text-sm mt-6 flex items-center justify-center gap-1">
        Press <KeyboardHint keys="Esc" /> to cancel
      </div>
    </Modal>
  );
}
