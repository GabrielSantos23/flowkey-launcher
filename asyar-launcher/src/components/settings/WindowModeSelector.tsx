import React from 'react';

export type LaunchView = 'default' | 'compact';

export interface WindowModeSelectorProps {
  value?: LaunchView;
  onchange?: (v: LaunchView) => void;
  wellBackground?: 'tertiary' | 'primary';
}

export default function WindowModeSelector({
  value = 'default',
  onchange,
  wellBackground = 'tertiary',
}: WindowModeSelectorProps) {
  const options: { id: LaunchView; label: string }[] = [
    { id: 'default', label: 'Default' },
    { id: 'compact', label: 'Compact' },
  ];

  return (
    <div className="window-mode-selector flex gap-5" role="radiogroup" aria-label="Window mode">
      {options.map((option) => {
        const isSelected = value === option.id;
        return (
          <button
            key={option.id}
            className={`mode-option flex flex-col items-center gap-2 bg-transparent border-0 cursor-pointer p-0 transition-colors ${
              isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
            }`}
            role="radio"
            aria-checked={isSelected}
            aria-label={`${option.label} window mode`}
            type="button"
            onClick={() => onchange?.(option.id)}
          >
            <div
              className={`mode-thumbnail w-24 h-[76px] rounded-[var(--radius-lg)] border-2 p-3 flex items-start justify-center transition-colors ${
                wellBackground === 'primary' ? 'bg-[var(--bg-primary)]' : 'bg-[var(--bg-tertiary)]'
              } ${isSelected ? 'border-[var(--accent-primary)]' : 'border-[var(--border-color)]'}`}
            >
              {option.id === 'default' ? (
                <div className="inner-window w-full rounded-[var(--radius-sm)] overflow-hidden bg-[var(--bg-secondary)] shadow-xs border border-[var(--border-color)] flex flex-col">
                  <div className="win-search-bar h-3 bg-[var(--bg-tertiary)] mx-2 my-1 rounded-[var(--radius-xs)] border border-[var(--separator)] shrink-0" />
                  <div className="win-results px-2 flex flex-col gap-1 flex-1">
                    <div className="win-row h-2 bg-[var(--bg-selected)] rounded-[var(--radius-xs)]" />
                    <div className="win-row h-2 bg-[var(--bg-hover)] rounded-[var(--radius-xs)]" />
                    <div className="win-row h-2 bg-[var(--bg-hover)] rounded-[var(--radius-xs)]" />
                  </div>
                  <div className="win-footer flex items-center justify-end gap-1 px-2 py-1 border-t border-[var(--separator)] shrink-0">
                    <div className="win-dot w-1 h-1 rounded-full bg-[var(--border-color)]" />
                    <div className="win-dot w-1 h-1 rounded-full bg-[var(--border-color)]" />
                  </div>
                </div>
              ) : (
                <div className="inner-window w-full rounded-[var(--radius-sm)] overflow-hidden bg-[var(--bg-secondary)] shadow-xs border border-[var(--border-color)] flex flex-col">
                  <div className="win-search-bar h-3 bg-[var(--bg-tertiary)] mx-2 my-1 rounded-[var(--radius-xs)] border border-[var(--separator)] shrink-0" />
                  <div className="win-footer flex items-center justify-end gap-1 px-2 py-1 border-t border-[var(--separator)] shrink-0 mt-auto">
                    <div className="win-dot w-1 h-1 rounded-full bg-[var(--border-color)]" />
                  </div>
                </div>
              )}
            </div>
            <span
              className={`mode-label text-[var(--font-size-2xs)] font-[var(--font-ui)] ${
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
