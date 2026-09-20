import React, { useEffect, useState } from 'react';
import { EmptyState } from '../../components/react/Feedback';
import type { Note } from './noteStore';

export interface WikilinkPickerProps {
  candidates: Note[];
  query: string;
  onInsert: (title: string) => void;
  onClose: () => void;
}

export default function WikilinkPicker({
  candidates,
  query,
  onInsert,
  onClose,
}: WikilinkPickerProps) {
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useEffect(() => {
    if (highlightedIndex >= candidates.length) {
      setHighlightedIndex(Math.max(0, candidates.length - 1));
    }
  }, [candidates.length, highlightedIndex]);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setHighlightedIndex((prev) => Math.min(prev + 1, Math.max(0, candidates.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        const c = candidates[highlightedIndex];
        if (c) {
          e.preventDefault();
          e.stopPropagation();
          onInsert(c.title);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeydown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeydown, { capture: true });
  }, [candidates, highlightedIndex, onInsert, onClose]);

  return (
    <div className="absolute z-50 bottom-[calc(100%+4px)] left-0 min-w-[240px] max-w-[360px] bg-[var(--bg-popup)] border border-[var(--border-color)] rounded-[var(--radius-md)] shadow-lg overflow-hidden">
      <div className="py-2 px-5 text-xs text-[var(--text-secondary)] font-semibold border-b border-[var(--border-color)] uppercase tracking-wider">
        {'Link to note'}
      </div>
      {candidates.length === 0 ? (
        <EmptyState message={query.trim() ? 'No notes yet' : 'No other notes yet'} />
      ) : (
        <ul className="list-none m-0 py-1 max-h-[240px] overflow-y-auto" role="listbox">
          {candidates.map((note, i) => (
            <li
              key={note.id}
              className={`py-2 px-5 min-h-[32px] flex items-center text-sm cursor-pointer ${
                i === highlightedIndex
                  ? 'bg-[var(--bg-hover)] text-[var(--asyar-brand)]'
                  : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
              role="option"
              aria-selected={i === highlightedIndex}
              onClick={() => onInsert(note.title)}
              onMouseEnter={() => setHighlightedIndex(i)}
            >
              {note.title || 'Untitled Note'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
