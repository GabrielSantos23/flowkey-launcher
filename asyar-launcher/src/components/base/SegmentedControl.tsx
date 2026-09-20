import React from 'react';

export function segmentIsActive(current: string, optionValue: string): boolean {
  return current === optionValue;
}

export function selectSegment(
  current: string,
  next: string,
  onChange?: (val: string) => void,
): string {
  if (current !== next && onChange) {
    onChange(next);
  }
  return next;
}

export interface SegmentedControlProps {
  options: { value: string; label: string }[];
  value: string;
  onchange?: (value: string) => void;
  onfocus?: () => void;
  onblur?: () => void;
}

export default function SegmentedControl({
  options,
  value = '',
  onchange,
  onfocus,
  onblur,
}: SegmentedControlProps) {
  const select = (next: string) => {
    selectSegment(value, next, onchange);
  };

  return (
    <div
      className="segmented-control flex items-center p-1 rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] border border-[var(--border-color)]"
      role="radiogroup"
    >
      {options.map((option) => {
        const isActive = segmentIsActive(value, option.value);
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={`segment px-3 py-1 text-xs font-medium rounded-[var(--radius-sm)] border-0 cursor-pointer transition-colors ${
              isActive
                ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-xs'
                : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            onClick={() => select(option.value)}
            onFocus={onfocus}
            onBlur={onblur}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
