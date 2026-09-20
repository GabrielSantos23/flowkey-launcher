import React, { useState } from 'react';
import type { CommandArgument } from 'asyar-sdk/contracts';

export interface ArgumentDropdownChipProps {
  arg: CommandArgument;
  value: string;
  focused: boolean;
  needsValue?: boolean;
  needsAny?: boolean;
  /** True once the user explicitly picked an option (vs a seeded default). */
  touched?: boolean;
  confirmed?: boolean;
  readonly?: boolean;
  onInput: (value: string) => void;
  onKeydown?: (e: React.KeyboardEvent) => void;
  onFocus?: () => void;
  onReset?: () => void;
  onSelect?: (value: string) => void;
  onClick?: () => void;
}

export default function ArgumentDropdownChip({
  arg,
  value,
  focused,
  needsValue = false,
  needsAny = false,
  touched = false,
  confirmed = false,
  readonly = false,
  onInput,
  onKeydown,
  onFocus,
  onReset,
  onSelect,
  onClick,
}: ArgumentDropdownChipProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  // Highlight index while walking the closed list with arrows. `null` means
  // no arrow walk yet — an untouched chip starts "above" the list so the
  // first ArrowDown picks the first option, and ArrowUp is a no-op.
  const [hl, setHl] = useState<number | null>(null);
  const options = arg.data ?? [];
  const selectedIdx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const highlightIdx = hl ?? (touched ? selectedIdx : -1);

  const selectedOption = options.find((o) => o.value === value);
  // Seeded-but-untouched chips show their seed; a picked value shows itself;
  // an empty value falls back to the placeholder hint.
  const displayLabel = touched
    ? (selectedOption?.title ?? value)
    : (selectedOption?.title ?? arg.placeholder ?? arg.name);

  function handleKeydown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (highlightIdx < options.length - 1) {
          const next = highlightIdx + 1;
          setHl(next);
          onInput(options[next].value);
          onSelect?.(options[next].value);
        }
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (highlightIdx > 0) {
          const next = highlightIdx - 1;
          setHl(next);
          onInput(options[next].value);
          onSelect?.(options[next].value);
        } else if (touched) {
          // Off the top of a picked chip: release the pick back to the hint.
          setHl(-1);
          onReset?.();
        }
        return;
      }
    }
    onKeydown?.(e);
  }

  const visibleOptions = filter.trim()
    ? options.filter((o) => o.title.toLowerCase().includes(filter.trim().toLowerCase()))
    : options;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        disabled={readonly}
        onClick={() => {
          if (!readonly) {
            setOpen((prev) => !prev);
            setFilter('');
            onClick?.();
          }
        }}
        onFocus={onFocus}
        onKeyDown={handleKeydown}
        className={`arg-trigger px-2 py-0.5 rounded-[var(--radius-sm)] text-xs flex items-center gap-1 border transition-colors ${
          touched ? 'arg-trigger--touched' : ''
        } ${
          needsValue
            ? 'border-[var(--accent-danger)] text-[var(--accent-danger)]'
            : needsAny
              ? 'border-dashed border-[var(--text-tertiary)]'
              : focused
                ? 'border-[var(--accent-primary)] text-[var(--text-primary)] bg-[var(--bg-hover)]'
                : 'border-[var(--border-color)] text-[var(--text-secondary)] bg-[var(--bg-secondary)]'
        }`}
      >
        <span>{displayLabel}</span>
        <span className="text-[9px] opacity-70">▾</span>
      </button>

      {open && !readonly ? (
        <div className="arg-popover absolute top-full left-0 mt-1 min-w-[120px] rounded-[var(--radius-md)] bg-[var(--bg-popup)] border border-[var(--border-color)] shadow-lg z-50 p-1 flex flex-col max-h-48 overflow-y-auto">
          <div className="arg-popover-search p-1">
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={arg.placeholder ?? arg.name}
              className="w-full px-2 py-0.5 rounded-[var(--radius-xs)] bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs focus:outline-none"
            />
          </div>
          <div className="arg-popover-list flex flex-col">
            {visibleOptions.map((opt) => {
              const isHighlighted = options[highlightIdx]?.value === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onInput(opt.value);
                    onSelect?.(opt.value);
                    setOpen(false);
                  }}
                  className={`result-title flex items-center justify-between px-2 py-1 rounded-[var(--radius-xs)] text-left text-xs truncate ${
                    opt.value === value || isHighlighted
                      ? 'selected-result bg-[var(--bg-selected)] text-[var(--text-primary)] font-medium'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span>{opt.title}</span>
                  {opt.value === value && touched ? (
                    <span className="text-[9px] text-[var(--text-tertiary)]">✓</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
