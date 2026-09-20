import React, { useEffect } from 'react';
import type { SearchResult } from '../../services/search/interfaces/SearchResult';
import { logService } from '../../services/log/logService';

import { KeyboardHint } from '../react/Indicators';

export interface PrimaryActionDisplayProps {
  selectedItem?: SearchResult | null;
  activeViewLabel?: string | null;
}

export default function PrimaryActionDisplay({
  selectedItem = null,
  activeViewLabel = null,
}: PrimaryActionDisplayProps) {
  const primaryActionLabel = (() => {
    if (activeViewLabel) return activeViewLabel;
    if (!selectedItem) return null;
    switch (selectedItem.type) {
      case 'application':
        return 'Open';
      case 'command':
        return 'Run';
      default:
        return 'Open';
    }
  })();

  useEffect(() => {
    if (primaryActionLabel) {
      logService.debug(
        `[PrimaryActionDisplay] Action label: ${primaryActionLabel} (View label: ${activeViewLabel})`,
      );
    } else {
      logService.debug(`[PrimaryActionDisplay] No item selected or view label.`);
    }
  }, [primaryActionLabel, activeViewLabel]);

  if (!primaryActionLabel) return null;

  return (
    <div className="flex items-center justify-end pl-3 text-[var(--text-secondary)] gap-[var(--space-5-5)]">
      <span
        className="font-semibold text-[var(--text-primary)]"
        style={{ fontSize: 'var(--font-size-sm)' }}
      >
        {primaryActionLabel}
      </span>
      <KeyboardHint keys="↵" />
    </div>
  );
}
