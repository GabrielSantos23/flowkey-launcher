import React from 'react';

export interface StatTileProps {
  value: string | number;
  label: string;
  icon?: string;
  accent?: boolean;
  divided?: boolean;
}

export default function StatTile({ value, label, accent = false, divided = false }: StatTileProps) {
  return (
    <div
      className={`flex-1 flex flex-col items-center justify-center p-4 ${
        divided ? 'border-l border-[var(--separator)]' : ''
      }`}
    >
      <div
        className={`text-3xl font-bold tracking-tight mb-1 ${
          accent ? 'text-[var(--accent-primary)]' : 'text-[var(--text-primary)]'
        }`}
      >
        {value}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
        <span>{label}</span>
      </div>
    </div>
  );
}
