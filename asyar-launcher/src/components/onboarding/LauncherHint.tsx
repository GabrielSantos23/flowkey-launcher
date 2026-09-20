import React from 'react';

export interface LauncherHintProps {
  steps: string[];
}

export default function LauncherHint({ steps }: LauncherHintProps) {
  return (
    <div className="flex flex-col gap-2 border border-[var(--separator)] rounded-[var(--radius-md)] p-3 bg-[var(--bg-tertiary)]">
      <span className="self-start text-xs font-semibold uppercase tracking-wider text-[var(--asyar-brand)]">
        Try it in the launcher
      </span>
      <ol className="m-0 pl-4 text-[var(--text-secondary)] text-sm leading-relaxed">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
