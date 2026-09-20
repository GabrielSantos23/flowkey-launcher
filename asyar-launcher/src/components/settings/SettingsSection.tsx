import React from 'react';

export interface SettingsSectionProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export default function SettingsSection({
  title,
  description = '',
  children,
}: SettingsSectionProps) {
  return (
    <section className="settings-section border border-[var(--separator)] rounded-[var(--radius-lg)] bg-[var(--bg-secondary)] shadow-[var(--shadow-xs)] overflow-hidden">
      <div className="settings-section-header p-6 border-b border-[var(--separator)]">
        <h2 className="settings-section-title text-base font-semibold text-[var(--text-primary)] m-0">
          {title}
        </h2>
        {description ? (
          <p className="settings-section-description text-sm text-[var(--text-secondary)] mt-2 mb-0">
            {description}
          </p>
        ) : null}
      </div>
      <div className="settings-section-content p-0">{children}</div>
    </section>
  );
}
