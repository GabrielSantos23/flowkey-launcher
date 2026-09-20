import React from 'react';
import { Icon } from '../react/Icon';

export interface SettingsPageHeaderProps {
  icon: string;
  title: string;
  description?: string;
}

export default function SettingsPageHeader({ icon, title, description }: SettingsPageHeaderProps) {
  return (
    <header className="settings-page-header flex items-center gap-[var(--space-4)] pb-[var(--space-5)] mb-[var(--space-6)] border-b border-[var(--separator)]">
      <div className="w-[var(--size-2xl)] h-[var(--size-2xl)] flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--bg-secondary)] border border-[var(--separator)] shrink-0">
        <Icon name={icon} size={22} />
      </div>
      <div className="min-w-0">
        <h1 className="text-page-title m-0">{title}</h1>
        {description ? (
          <p className="text-body text-[var(--text-secondary)] mt-[var(--space-1)] mb-0">
            {description}
          </p>
        ) : null}
      </div>
    </header>
  );
}
