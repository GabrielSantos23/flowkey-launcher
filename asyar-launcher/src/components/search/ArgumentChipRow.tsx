import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import CommandArgInput from './CommandArgInput';
import {
  fieldNeedsValue,
  fieldNeedsAnyOf,
  type ActiveArgumentMode,
} from '../../services/search/commandArgumentsService';

export interface ArgumentChipRowProps {
  active: ActiveArgumentMode;
  onValueChange: (name: string, value: string) => void;
  onValueReset?: (name: string) => void;
  onFocusField: (idx: number) => void;
  onNext?: () => void;
  onPrev?: () => void;
  onSubmit?: () => void;
  onExit?: () => void;
  onMoveToQuery?: () => void;
}

export interface ArgumentChipRowHandle {
  focusFieldSelected: (idx: number) => void;
}

const ArgumentChipRow = forwardRef<ArgumentChipRowHandle, ArgumentChipRowProps>(
  (
    {
      active,
      onValueChange,
      onValueReset,
      onFocusField,
      onNext,
      onPrev,
      onSubmit,
      onExit,
      onMoveToQuery,
    },
    ref,
  ) => {
    const rowRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      focusFieldSelected: (idx: number) => {
        if (idx < 0 || idx >= active.args.length) return;
        onFocusField(idx);
        setTimeout(() => {
          const inputs = rowRef.current?.querySelectorAll<HTMLElement>('.arg-input, .arg-trigger');
          const target = inputs?.[idx];
          if (target) {
            target.focus();
            if (target instanceof HTMLInputElement) target.select();
          }
        }, 0);
      },
    }));

    return (
      <div ref={rowRef} className="flex items-center gap-1.5 flex-wrap">
        {active.args.map((arg, idx) => {
          const val = active.values[arg.name] ?? '';
          const focused = active.currentFieldIdx === idx;
          const needsVal = fieldNeedsValue(active, idx);
          const needsAny = fieldNeedsAnyOf(active, idx);

          return (
            <CommandArgInput
              key={arg.name}
              arg={arg}
              value={val}
              focused={focused}
              needsValue={needsVal}
              needsAny={needsAny}
              touched={active.edited.has(arg.name)}
              confirmed={active.confirmed.has(arg.name)}
              onInput={(v) => onValueChange(arg.name, v)}
              onFocus={() => onFocusField(idx)}
              onReset={() => onValueReset?.(arg.name)}
              onKeydown={(e) => {
                const el = e.currentTarget as HTMLElement;
                const isDropdown = arg.type === 'dropdown';
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSubmit?.();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onExit?.();
                } else if (e.key === 'Tab') {
                  e.preventDefault();
                  if (e.shiftKey) {
                    if (idx > 0) {
                      onPrev?.();
                    } else {
                      onMoveToQuery?.();
                    }
                  } else {
                    if (idx < active.args.length - 1) {
                      onNext?.();
                    } else {
                      onMoveToQuery?.();
                    }
                  }
                } else if (e.key === 'ArrowRight') {
                  const input = el instanceof HTMLInputElement ? el : null;
                  if (!isDropdown && input) {
                    const allSelected =
                      input.value.length > 0 &&
                      input.selectionStart === 0 &&
                      input.selectionEnd === input.value.length;
                    if (allSelected) {
                      // First press drops the caret to the end instead of stepping.
                      e.preventDefault();
                      input.setSelectionRange(input.value.length, input.value.length);
                      return;
                    }
                    const atEnd = input.selectionStart === input.value.length;
                    if (!atEnd) return; // caret movement inside the value
                  }
                  e.preventDefault();
                  if (idx < active.args.length - 1) onFocusField(idx + 1);
                } else if (e.key === 'ArrowLeft') {
                  const input = el instanceof HTMLInputElement ? el : null;
                  if (!isDropdown && input) {
                    const allSelected =
                      input.value.length > 0 &&
                      input.selectionStart === 0 &&
                      input.selectionEnd === input.value.length;
                    if (allSelected) {
                      // Fully-selected value: one press steps to the previous field.
                      e.preventDefault();
                      if (idx > 0) onFocusField(idx - 1);
                      return;
                    }
                    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
                    if (!atStart) return; // caret movement inside the value
                  }
                  e.preventDefault();
                  if (idx > 0) onFocusField(idx - 1);
                  else onMoveToQuery?.();
                }
              }}
            />
          );
        })}
      </div>
    );
  },
);

export default ArgumentChipRow;
