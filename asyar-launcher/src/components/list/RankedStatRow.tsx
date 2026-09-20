import React from 'react';
import { MeterBar } from '../react/Indicators';

export interface RankedStatRowProps {
  rank: number;
  title: string;
  subtitle?: string;
  value?: string | number;
  count?: number;
  maxCount?: number;
  fraction?: number;
  leading?: React.ReactNode;
}

export default function RankedStatRow({
  rank,
  title,
  subtitle,
  value,
  count,
  maxCount,
  fraction,
  leading,
}: RankedStatRowProps) {
  const displayValue = value ?? count ?? 0;
  const displayFraction = fraction ?? (maxCount && count !== undefined ? count / maxCount : 0);

  return (
    <div className="ranked-row flex items-baseline gap-[var(--space-4)] px-[var(--space-4)] py-[var(--space-3)] rounded-[var(--radius-lg)] hover:bg-[var(--bg-hover)] transition-colors">
      <div className="shrink-0 w-[var(--size-sm)] text-right font-mono tabular-nums text-[var(--font-size-sm)] text-[var(--text-tertiary)]">
        {rank}
      </div>

      {leading ? <div className="flex items-center shrink-0">{leading}</div> : null}

      <div className="flex-1 min-w-0 flex flex-col gap-[var(--space-2)]">
        <div className="flex items-baseline justify-between gap-[var(--space-3)]">
          <span className="min-w-0 text-[var(--font-size-base)] font-semibold text-[var(--text-primary)] truncate">
            {title}
          </span>
          <span className="shrink-0 font-mono tabular-nums text-[var(--font-size-lg)] font-semibold text-[var(--text-primary)]">
            {displayValue}
          </span>
        </div>
        {subtitle ? (
          <span className="font-mono text-[var(--font-size-xs)] text-[var(--text-tertiary)] truncate">
            {subtitle}
          </span>
        ) : null}
        <MeterBar value={displayFraction} />
      </div>
    </div>
  );
}
