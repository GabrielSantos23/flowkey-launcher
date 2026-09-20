import React from 'react';

export interface ExpansionDemoProps {
  trigger: string;
  result: string;
  note?: string;
}

export default function ExpansionDemo({ trigger, result, note = '' }: ExpansionDemoProps) {
  return (
    <div className="border border-[var(--separator)] rounded-[var(--radius-md)] p-3 bg-[var(--bg-tertiary)]">
      <div className="flex items-center gap-3">
        <code className="font-mono bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-[var(--radius-md)] px-3 py-0.5 text-[var(--text-primary)]">
          {trigger}
        </code>
        <span className="text-[var(--text-tertiary)]">→</span>
        <span className="text-lg">{result}</span>
      </div>
      {note ? <p className="mt-2 mb-0 text-xs text-[var(--text-secondary)]">{note}</p> : null}
    </div>
  );
}
