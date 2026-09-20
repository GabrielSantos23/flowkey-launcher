import React from 'react';

export interface SettingsRangeSliderProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  suffix?: string;
  onchange?: (value: number) => void;
}

export default function SettingsRangeSlider({
  min,
  max,
  step = 1,
  value,
  suffix = '',
  onchange,
}: SettingsRangeSliderProps) {
  return (
    <div className="settings-range-slider flex items-center gap-4">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onchange?.(parseInt(e.currentTarget.value, 10))}
        className="w-32 h-1.5 rounded-full cursor-pointer bg-[var(--bg-secondary)] accent-[var(--accent-primary)]"
      />
      <span className="value-display text-sm font-mono min-w-8 text-right text-[var(--text-primary)]">
        {value}
        {suffix}
      </span>
    </div>
  );
}
