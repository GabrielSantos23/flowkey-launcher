import React, { useEffect, useState } from 'react';
import {
  fetchPlaceholders,
  type PlaceholderDefinition,
} from '../../lib/placeholders/placeholderResolver';

export interface PlaceholderPickerProps {
  onInsert: (token: string) => void;
  onClose: () => void;
}

export default function PlaceholderPicker({ onInsert, onClose }: PlaceholderPickerProps) {
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [placeholders, setPlaceholders] = useState<PlaceholderDefinition[]>([]);

  useEffect(() => {
    fetchPlaceholders().then((data) => setPlaceholders(data));
  }, []);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setHighlightedIndex((prev) => Math.min(prev + 1, Math.max(0, placeholders.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const p = placeholders[highlightedIndex];
        if (p) {
          onInsert(p.token);
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeydown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeydown, { capture: true });
  }, [placeholders, highlightedIndex, onInsert, onClose]);

  const handleItemClick = (token: string) => {
    onInsert(token);
    onClose();
  };

  return (
    <div className="absolute z-50 top-[calc(100%+4px)] left-0 right-0 bg-[var(--bg-popup)] border border-[var(--border-color)] rounded-[var(--radius-md)] shadow-lg overflow-hidden">
      <div className="py-2 px-5 text-xs text-[var(--text-secondary)] font-semibold border-b border-[var(--border-color)] uppercase tracking-wider">
        Insert Placeholder
      </div>
      <ul className="list-none m-0 py-1 max-h-[280px] overflow-y-auto" role="listbox">
        {placeholders.map((placeholder, i) => (
          <li
            key={placeholder.id}
            className={`flex flex-col justify-center py-2 px-5 min-h-[40px] cursor-pointer gap-0.5 ${
              i === highlightedIndex ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]'
            }`}
            role="option"
            aria-selected={i === highlightedIndex}
            onClick={() => handleItemClick(placeholder.token)}
            onMouseEnter={() => setHighlightedIndex(i)}
          >
            <span
              className={`font-semibold text-sm ${
                i === highlightedIndex ? 'text-[var(--asyar-brand)]' : 'text-[var(--text-primary)]'
              }`}
            >
              {placeholder.label}
            </span>
            {placeholder.description ? (
              <span className="text-xs text-[var(--text-secondary)] truncate">
                {placeholder.description}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
