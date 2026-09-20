import React from 'react';

export interface SettingsRowProps {
  label: string;
  description?: string;
  children?: React.ReactNode;
}

export default function SettingsRow({ label, description = '', children }: SettingsRowProps) {
  return (
    <div className="settings-row relative flex items-center gap-[var(--space-7)] px-6 py-5 border-b border-[var(--border-color)] last:border-b-0">
      <div className="settings-row-text flex-1 min-w-0">
        <div className="settings-row-label text-[var(--font-size-md)] font-medium text-[var(--text-primary)]">
          {label}
        </div>
        {description ? (
          <div className="settings-row-description mt-1 text-xs text-[var(--text-secondary)] leading-normal">
            {description}
          </div>
        ) : null}
      </div>
      <div className="settings-row-control shrink-0">{children}</div>
    </div>
  );
}
