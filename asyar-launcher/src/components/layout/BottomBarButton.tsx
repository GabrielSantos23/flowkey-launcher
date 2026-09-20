import React from 'react';
import { KeyboardHint } from '../react/Indicators';

export interface BottomBarButtonProps {
  label: string;
  keyHint?: string | string[];
  onclick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  ariaHaspopup?: boolean | 'true' | 'false' | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
  ariaExpanded?: boolean;
  className?: string;
}

export default function BottomBarButton({
  label,
  keyHint,
  onclick,
  disabled = false,
  ariaHaspopup,
  ariaExpanded,
  className = '',
}: BottomBarButtonProps) {
  return (
    <button
      type="button"
      onClick={onclick}
      disabled={disabled}
      aria-haspopup={ariaHaspopup}
      aria-expanded={ariaExpanded}
      className={`bottom-bar-button inline-flex items-center gap-[var(--space-2-5)] py-[var(--space-1)] bg-transparent border-0 rounded-[var(--radius-sm)] text-[var(--text-secondary)] font-[var(--font-ui)] cursor-pointer hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      <span className="text-[var(--font-size-sm)] font-semibold">{label}</span>
      {keyHint !== undefined ? <KeyboardHint keys={keyHint} /> : null}
    </button>
  );
}
