import React from 'react';
import Card from '../layout/Card';

export interface GuidanceStepProps {
  kicker?: string;
  title: string;
  children?: React.ReactNode;
}

export default function GuidanceStep({ kicker = '', title, children }: GuidanceStepProps) {
  return (
    <Card>
      <div className="flex flex-col gap-3">
        {kicker ? (
          <p className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--asyar-brand)]">
            {kicker}
          </p>
        ) : null}
        <h1 className="m-0 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          {title}
        </h1>
        <div className="text-[var(--text-secondary)] text-sm leading-relaxed flex flex-col gap-3">
          {children}
        </div>
      </div>
    </Card>
  );
}
