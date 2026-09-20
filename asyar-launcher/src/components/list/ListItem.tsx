import React from 'react';

export interface ListItemProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  leading?: React.ReactNode;
  icon?: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  accessory?: React.ReactNode;
  actions?: React.ReactNode;
}

export default function ListItem({
  selected = false,
  leading,
  icon,
  title,
  subtitle,
  trailing,
  accessory,
  actions,
  className = '',
  ...restProps
}: ListItemProps) {
  const lead = leading ?? icon;
  const trail = trailing ?? accessory ?? actions;

  return (
    <div
      className={`list-row flex items-center gap-[var(--space-5)] px-[var(--space-6)] py-[var(--space-5)] rounded-[var(--radius-xl)] mb-[var(--space-0-5)] cursor-default select-none relative overflow-hidden shrink-0 ${
        selected
          ? 'selected bg-[var(--bg-selected)] shadow-[inset_0_0_2px_0.5px_var(--kbd-rim)]'
          : ''
      } ${className}`}
      role="option"
      aria-selected={selected}
      {...restProps}
    >
      {lead ? <div className="flex items-center justify-center shrink-0">{lead}</div> : null}

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="truncate text-title font-medium text-[var(--text-primary)]">{title}</div>
        {subtitle ? (
          <div className="truncate text-caption text-xs text-[var(--text-secondary)]">
            {subtitle}
          </div>
        ) : null}
      </div>

      {trail ? (
        <div className="flex items-center gap-[var(--space-3)] shrink-0">{trail}</div>
      ) : null}
    </div>
  );
}
