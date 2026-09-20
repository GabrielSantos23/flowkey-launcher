import React from 'react';

export type Theme = 'light' | 'dark' | 'system';

export interface AppearanceThemeSelectorProps {
  value?: Theme;
  onchange?: (v: Theme) => void;
  wellBackground?: 'tertiary' | 'secondary';
}

export default function AppearanceThemeSelector({
  value = 'system',
  onchange,
  wellBackground = 'tertiary',
}: AppearanceThemeSelectorProps) {
  const options: { id: Theme; label: string }[] = [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'system', label: 'System' },
  ];

  return (
    <div className="theme-selector flex gap-5" role="radiogroup" aria-label="Appearance theme">
      {options.map((option) => {
        const isSelected = value === option.id;
        return (
          <button
            key={option.id}
            className={`theme-option flex flex-col items-center gap-2 bg-transparent border-0 cursor-pointer p-0 transition-colors ${
              isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
            }`}
            role="radio"
            aria-checked={isSelected}
            aria-label={`${option.label} theme`}
            type="button"
            onClick={() => onchange?.(option.id)}
          >
            <div
              className={`theme-circle w-11 h-11 rounded-full border-2 flex items-center justify-center transition-colors ${
                wellBackground === 'secondary'
                  ? 'bg-[var(--bg-secondary)]'
                  : 'bg-[var(--bg-tertiary)]'
              } ${
                isSelected
                  ? 'bg-[var(--text-primary)] border-[var(--text-primary)] text-[var(--bg-primary)]'
                  : 'border-transparent hover:bg-[var(--bg-hover)] hover:border-[var(--border-color)]'
              }`}
            >
              {option.id === 'light' ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="4" />
                  <line x1="12" y1="2" x2="12" y2="5" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" />
                  <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
                  <line x1="2" y1="12" x2="5" y2="12" />
                  <line x1="19" y1="12" x2="22" y2="12" />
                  <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
                  <line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
                </svg>
              ) : option.id === 'dark' ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 3a9 9 0 0 1 0 18V3z" fill="currentColor" />
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    fill="none"
                  />
                </svg>
              )}
            </div>
            <span
              className={`theme-label text-[var(--font-size-2xs)] font-[var(--font-ui)] ${
                isSelected ? 'font-semibold' : 'font-medium'
              }`}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
