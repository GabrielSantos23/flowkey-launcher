import React from 'react';

export interface MeterBarProps {
  value?: number;
  variant?: 'brand' | 'neutral';
  className?: string;
}

export default function MeterBar({ value = 0, variant = 'brand', className = '' }: MeterBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className={`h-1.5 w-full bg-[var(--bg-tertiary)] rounded-full overflow-hidden ${className}`}
    >
      <div
        className={`h-full rounded-full transition-all duration-300 ${
          variant === 'brand' ? 'bg-[var(--accent-primary)]' : 'bg-[var(--text-tertiary)]'
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
