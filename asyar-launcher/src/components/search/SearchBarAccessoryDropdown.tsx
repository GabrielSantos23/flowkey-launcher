import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Input } from '../react/Inputs';
import { EmptyState } from '../react/Feedback';
import { KeyboardHint } from '../react/Indicators';

export type Option = { value: string; title: string };

export interface SearchBarAccessoryDropdownHandle {
  focus: () => void;
  openPopover: () => void;
  togglePopover: () => void;
}

export interface SearchBarAccessoryDropdownProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  onclose?: () => void;
}

const SearchBarAccessoryDropdown = forwardRef<
  SearchBarAccessoryDropdownHandle,
  SearchBarAccessoryDropdownProps
>(({ options, value, onChange, onclose }, ref) => {
  const [open, setOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  const currentTitle = options.find((o) => o.value === value)?.title ?? options[0]?.title ?? '';
  const filteredOptions =
    filterQuery.trim() === ''
      ? options
      : options.filter((o) => o.title.toLowerCase().includes(filterQuery.trim().toLowerCase()));

  useImperativeHandle(ref, () => ({
    focus: () => {
      buttonRef.current?.focus();
    },
    openPopover: () => {
      if (open) return;
      setFilterQuery('');
      setOpen(true);
      setHighlightedIndex(
        Math.max(
          0,
          options.findIndex((o) => o.value === value),
        ),
      );
      setTimeout(() => filterInputRef.current?.focus(), 0);
    },
    togglePopover: () => {
      if (open) {
        setOpen(false);
        buttonRef.current?.focus();
        onclose?.();
      } else {
        setFilterQuery('');
        setOpen(true);
        setHighlightedIndex(
          Math.max(
            0,
            options.findIndex((o) => o.value === value),
          ),
        );
        setTimeout(() => filterInputRef.current?.focus(), 0);
      }
    },
  }));

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        open &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        onclose?.();
      }
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [open, onclose]);

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    buttonRef.current?.focus();
    onclose?.();
  };

  return (
    <div className="relative inline-block text-xs">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false);
            onclose?.();
          } else {
            setFilterQuery('');
            setOpen(true);
            setHighlightedIndex(
              Math.max(
                0,
                options.findIndex((o) => o.value === value),
              ),
            );
            setTimeout(() => filterInputRef.current?.focus(), 0);
          }
        }}
        className="accessory-button flex items-center gap-1 px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      >
        <span className="truncate max-w-[120px]">{currentTitle}</span>
        <KeyboardHint keys={['⌘', 'P']} />
      </button>

      {open ? (
        <div
          ref={popoverRef}
          className="absolute top-full right-0 mt-1 w-48 rounded-[var(--radius-md)] bg-[var(--bg-popup)] border border-[var(--border-color)] shadow-lg z-50 p-1 flex flex-col max-h-60 overflow-y-auto"
        >
          <div className="p-1">
            <input
              ref={filterInputRef}
              type="text"
              value={filterQuery}
              onChange={(e) => {
                setFilterQuery(e.target.value);
                setHighlightedIndex(0);
              }}
              placeholder="Filter..."
              className="w-full px-2 py-1 rounded-[var(--radius-xs)] bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="flex flex-col gap-0.5 mt-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, idx) => (
                <button
                  key={opt.value}
                  type="button"
                  data-index={idx}
                  onClick={() => handleSelect(opt.value)}
                  className={`px-2 py-1.5 rounded-[var(--radius-xs)] text-left text-xs truncate ${
                    idx === highlightedIndex
                      ? 'bg-[var(--bg-selected)] text-[var(--text-primary)] font-medium'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {opt.title}
                </button>
              ))
            ) : (
              <div className="p-2 text-center text-xs text-[var(--text-tertiary)]">No options</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
});

export default SearchBarAccessoryDropdown;
