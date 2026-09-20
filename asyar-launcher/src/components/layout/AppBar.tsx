import React from 'react';

export interface AppBarProps {
  title?: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
}

export default function AppBar({ title, subtitle, leading, trailing, children }: AppBarProps) {
  return (
    <div className="app-bar flex items-center justify-between px-4 min-h-[var(--shell-header-h)] border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <div className="flex items-center gap-3 min-w-0">
        {leading}
        {title ? (
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-sm text-[var(--text-primary)] truncate">
              {title}
            </span>
            {subtitle ? (
              <span className="text-xs text-[var(--text-secondary)] truncate">{subtitle}</span>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
      {trailing ? <div className="flex items-center gap-2 shrink-0">{trailing}</div> : null}
    </div>
  );
}
