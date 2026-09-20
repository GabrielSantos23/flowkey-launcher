import React from 'react';

export interface SettingsCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export default function SettingsCard({ children, className = '', ...rest }: SettingsCardProps) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border border-[var(--separator)] bg-[var(--bg-secondary)] overflow-hidden ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
