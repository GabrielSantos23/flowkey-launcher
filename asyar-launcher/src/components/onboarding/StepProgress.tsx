import React from 'react';

export interface StepProgressProps {
  total: number;
  position: number;
}

export default function StepProgress({ total, position }: StepProgressProps) {
  return (
    <ol
      className="flex items-center gap-2 list-none p-0 m-0"
      aria-label={`Step ${position} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <li
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i + 1 === position
              ? 'w-[22px] bg-[var(--asyar-brand)] shadow-[0_0_12px_var(--asyar-brand)]'
              : 'w-1.5 bg-[var(--border-color)]'
          }`}
        />
      ))}
    </ol>
  );
}
