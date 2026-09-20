import React, { useRef, useEffect } from 'react';
import type { CommandArgument } from 'asyar-sdk/contracts';
import ArgumentDropdownChip from './ArgumentDropdownChip';

export interface CommandArgInputProps {
  arg: CommandArgument;
  value: string;
  focused: boolean;
  needsValue?: boolean;
  needsAny?: boolean;
  touched?: boolean;
  confirmed?: boolean;
  readonly?: boolean;
  onInput: (value: string) => void;
  onKeydown?: (e: React.KeyboardEvent) => void;
  onFocus?: () => void;
  onReset?: () => void;
  onClick?: () => void;
}

export default function CommandArgInput({
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
  onClick,
}: CommandArgInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!readonly && focused && inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [focused, readonly]);

  if (arg.type === 'dropdown') {
    return (
      <ArgumentDropdownChip
        arg={arg}
        value={value}
        focused={focused}
        needsValue={needsValue}
        needsAny={needsAny}
        touched={touched}
        confirmed={confirmed}
        readonly={readonly}
        onInput={onInput}
        onKeydown={onKeydown}
        onFocus={onFocus}
        onReset={onReset}
        onClick={onClick}
      />
    );
  }

  const placeholder = arg.placeholder?.trim() || arg.name;

  // Read-only "ghost" chip: shows the resumed value, or the placeholder hint
  // when nothing was filled. Rendered as text — never an editable input —
  // because a read-only argument can't be focused or edited here.
  if (readonly) {
    const isHint = value === '';
    const text = isHint ? placeholder : arg.type === 'password' ? '•••••••' : value;
    return (
      <div
        className="relative inline-flex items-center rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-secondary)]"
        onClick={onClick}
      >
        <span
          className={`arg-ghost-text px-2 py-0.5 text-xs ${
            isHint
              ? 'arg-ghost-text--hint text-[var(--text-tertiary)] italic'
              : 'text-[var(--text-primary)]'
          }`}
        >
          {text}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`relative inline-flex items-center rounded-[var(--radius-sm)] border text-xs transition-colors ${
        needsValue
          ? 'border-[var(--accent-danger)]'
          : needsAny
            ? 'border-dashed border-[var(--text-tertiary)]'
            : focused
              ? 'border-[var(--accent-primary)] bg-[var(--bg-hover)]'
              : 'border-[var(--border-color)] bg-[var(--bg-secondary)]'
      }`}
      onClick={onClick}
    >
      <input
        ref={inputRef}
        type={arg.type === 'password' ? 'password' : 'text'}
        value={value}
        readOnly={readonly}
        placeholder={placeholder}
        onChange={(e) => onInput(e.target.value)}
        onKeyDown={onKeydown}
        onFocus={onFocus}
        className="arg-input px-2 py-0.5 bg-transparent border-0 text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-xs focus:outline-none min-w-[60px] max-w-[200px]"
      />
    </div>
  );
}
