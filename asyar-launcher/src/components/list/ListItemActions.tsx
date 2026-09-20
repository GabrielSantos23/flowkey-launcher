import React from 'react';

export interface ListItemActionsProps {
  children?: React.ReactNode;
}

export default function ListItemActions({ children }: ListItemActionsProps) {
  return (
    <div className="list-item-actions flex items-center gap-[var(--space-1)] shrink-0">
      {children}
    </div>
  );
}
