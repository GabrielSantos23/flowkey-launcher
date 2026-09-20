import React from 'react';

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

export interface SettingsRadioGroupProps {
  label?: string;
  description?: string;
  name: string;
  options: RadioOption[];
  value: string;
  onchange?: (value: string) => void;
  noBorder?: boolean;
}

export default function SettingsRadioGroup({
  label,
  description,
  name,
  options,
  value,
  onchange,
  noBorder = false,
}: SettingsRadioGroupProps) {
  return (
    <div
      className={`settings-radio-group p-6 ${
        noBorder ? '' : 'border-b border-[var(--border-color)]'
      }`}
    >
      {label ? (
        <div className="font-medium text-[var(--text-primary)] text-base">{label}</div>
      ) : null}
      {description ? (
        <div className="text-sm text-[var(--text-secondary)] mt-1">{description}</div>
      ) : null}

      <div className="options-container mt-4 flex flex-col gap-4">
        {options.map((option) => (
          <label key={option.value} className="option-item flex items-start cursor-pointer gap-3">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onchange?.(option.value)}
              className="mt-1 accent-[var(--accent-primary)]"
            />
            <div className="option-text flex flex-col">
              <div className="font-medium text-[var(--text-primary)]">{option.label}</div>
              {option.description ? (
                <div className="text-sm text-[var(--text-secondary)] mt-0.5">
                  {option.description}
                </div>
              ) : null}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
