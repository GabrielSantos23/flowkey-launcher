import React from 'react';
import type { ExtensionManifest } from 'asyar-sdk/contracts';
import { viewManager } from '../../services/extension/viewManager';
import { isIconImage, isBuiltInIcon, getBuiltInIconName } from '../../lib/iconUtils';
import { Icon } from '../react/Icon';

export interface InformationPanelProps {
  activeViewManifest?: ExtensionManifest | null;
}

export default function InformationPanel({ activeViewManifest = null }: InformationPanelProps) {
  if (!activeViewManifest) return null;

  const icon = activeViewManifest.icon ?? '🧩';
  const name = activeViewManifest.name ?? '';

  return (
    <div className="info-chip inline-flex items-center gap-[var(--space-2)] min-w-0 overflow-hidden whitespace-nowrap text-[var(--text-secondary)] text-[var(--font-size-sm)]">
      <span className="info-chip-badge inline-flex items-center justify-center w-[var(--size-md)] h-[var(--size-md)] shrink-0 rounded-[var(--radius-sm)] bg-[var(--accent-primary-fill)] text-[var(--text-on-accent)]">
        {isBuiltInIcon(icon) ? (
          <Icon name={getBuiltInIconName(icon)} size={14} />
        ) : isIconImage(icon) ? (
          <img src={icon} alt="" className="w-[var(--size-xs)] h-[var(--size-xs)] object-contain" />
        ) : (
          <span className="text-[var(--font-size-md)] leading-none">{icon}</span>
        )}
      </span>
      <span className="info-chip-label font-semibold text-[var(--text-primary)] min-w-0 overflow-hidden text-ellipsis">
        {name}
      </span>
      {viewManager.activeViewSubtitle ? (
        <span className="info-chip-subtitle text-[var(--font-size-xs)] font-medium text-[var(--text-secondary)] shrink-0">
          {viewManager.activeViewSubtitle}
        </span>
      ) : null}
    </div>
  );
}
