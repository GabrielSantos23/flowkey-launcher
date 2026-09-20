import React from 'react';

export interface ToggleProps {
  checked?: boolean;
  disabled?: boolean;
  id?: string;
  onChange?: (checked: boolean) => void;
  onchange?: (e: any) => void;
}

export default function Toggle({
  checked = false,
  disabled = false,
  id,
  onChange,
  onchange,
}: ToggleProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.checked);
    onchange?.(e);
  };

  return (
    <label
      className={`relative inline-flex items-center cursor-pointer ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      }`}
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
        className="sr-only peer"
      />
      <div className="w-10 h-6 bg-[var(--bg-tertiary)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--accent-primary)]" />
    </label>
  );
}

export { Toggle };
