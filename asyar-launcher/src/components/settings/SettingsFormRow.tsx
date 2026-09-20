import React from 'react';

export interface SettingsFormRowProps {
  label: string;
  hint?: string;
  error?: string;
  children?: React.ReactNode;
}

export default function SettingsFormRow({ label, hint, error, children }: SettingsFormRowProps) {
  return (
    <div className="settings-form-row flex flex-col gap-1">
      <label className="text-sm font-medium text-[var(--text-primary)]">{label}</label>
      {children}
      {error ? (
        <span className="text-xs text-[var(--accent-danger)]">{error}</span>
      ) : hint ? (
        <span className="text-xs text-[var(--text-secondary)]">{hint}</span>
      ) : null}
    </div>
  );
}
