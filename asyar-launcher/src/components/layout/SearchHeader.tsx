import React, { useRef, useEffect } from 'react';
import { isIconImage, isBuiltInIcon, getBuiltInIconName } from '../../lib/iconUtils';
import { Icon } from '../react/Icon';
import { KeyboardHint } from '../react/Indicators';
import ArgumentChipRow, { type ArgumentChipRowHandle } from '../search/ArgumentChipRow';
import SearchBarAccessoryDropdown, {
  type SearchBarAccessoryDropdownHandle,
} from '../search/SearchBarAccessoryDropdown';
import type { CommandArgument } from 'asyar-sdk/contracts';
import type { ActiveArgumentMode } from '../../services/search/commandArgumentsService';
import { searchBarAccessoryService } from '../../services/search/searchBarAccessoryService';
import { logService } from '../../services/log/logService';
import { createWindowDragController } from '../../services/launcher/windowDragController';

export interface SearchHeaderProps {
  value?: string;
  showBack?: boolean;
  searchable?: boolean;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  accessoryRef?: React.RefObject<SearchBarAccessoryDropdownHandle | null>;
  activeContext?: { id: string; name: string; icon: string; color?: string } | null;
  activeViewId?: string | null;
  contextQuery?: string;
  contextHint?: { id: string; name: string; icon: string; type?: string } | null;
  argumentMode?: ActiveArgumentMode | null;
  argumentHint?: boolean;
  argumentHintFields?: {
    arg: CommandArgument;
    value: string;
    touched?: boolean;
    needsValue?: boolean;
  }[];
  argumentCommandName?: string | null;
  onArgHintClick?: (fieldIdx: number) => void;
  onclick?: () => void;
  oncontextDismiss?: () => void;
  oncontextQueryChange?: (detail: { query: string }) => void;
  onArgValueChange?: (name: string, value: string) => void;
  onArgValueReset?: (name: string) => void;
  onArgFocusField?: (idx: number) => void;
  onArgFieldsBlur?: () => void;
  onArgNext?: () => void;
  onArgPrev?: () => void;
  onArgSubmit?: () => void;
  onArgExit?: () => void;
  onkeydown?: (e: React.KeyboardEvent) => void;
  oninput?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function SearchHeader({
  value = '',
  showBack = false,
  searchable = true,
  placeholder = 'Search applications and commands...',
  inputRef,
  accessoryRef,
  activeContext = null,
  activeViewId = null,
  contextQuery = '',
  contextHint = null,
  argumentMode = null,
  argumentHint = false,
  argumentHintFields = [],
  argumentCommandName = null,
  onArgHintClick,
  onclick,
  oncontextDismiss,
  oncontextQueryChange,
  onArgValueChange,
  onArgValueReset,
  onArgFocusField,
  onArgFieldsBlur,
  onArgNext,
  onArgPrev,
  onArgSubmit,
  onArgExit,
  onkeydown,
  oninput,
}: SearchHeaderProps) {
  const localInputRef = useRef<HTMLInputElement>(null);
  const actualInputRef = inputRef || localInputRef;
  const argRowRef = useRef<ArgumentChipRowHandle>(null);

  const accessory = searchBarAccessoryService.active;
  const chipColor = activeContext?.color ?? 'var(--accent-primary)';

  const drag = createWindowDragController('main');

  const onHeaderPointerDown = (e: React.PointerEvent) => {
    drag.onPointerDown(e.nativeEvent);
    const onMove = (ev: PointerEvent) => drag.onPointerMove(ev);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      drag.onPointerUp();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  const handleQueryKeydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;

    if (argumentMode && e.key === 'Tab') {
      e.preventDefault();
      argRowRef.current?.focusFieldSelected(e.shiftKey ? argumentMode.args.length - 1 : 0);
      return;
    }
    if (argumentMode && e.key === 'Enter') {
      e.preventDefault();
      onArgSubmit?.();
      return;
    }
    onkeydown?.(e);
  };

  return (
    <div className="search-header">
      <div
        className="relative w-full border-b border-[var(--separator)] flex items-center min-h-[var(--shell-header-h)] px-4 gap-3"
        onPointerDown={onHeaderPointerDown}
      >
        {showBack ? (
          <button
            type="button"
            className="back-button-new p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            tabIndex={-1}
            onClick={onclick}
            title="Press Escape to go back"
            aria-label="Go back"
          >
            <KeyboardHint keys="←" />
          </button>
        ) : null}

        {activeContext && !argumentMode ? (
          <div className="context-search-row flex items-center gap-2 flex-1 min-w-0">
            <span
              className="context-chip inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-sm)] text-xs text-[var(--text-on-accent)] font-medium"
              style={{ background: chipColor }}
            >
              <span className="chip-icon">
                {isBuiltInIcon(activeContext.icon) ? (
                  <Icon name={getBuiltInIconName(activeContext.icon)} size={13} />
                ) : isIconImage(activeContext.icon) ? (
                  <img src={activeContext.icon} alt="" className="w-4 h-4 object-contain" />
                ) : (
                  activeContext.icon
                )}
              </span>
              <span className="chip-name truncate max-w-[120px]">{activeContext.name}</span>
              <button
                type="button"
                className="chip-dismiss hover:opacity-80"
                onClick={oncontextDismiss}
                tabIndex={-1}
                aria-label="Exit context mode"
              >
                ×
              </button>
            </span>
            <input
              ref={actualInputRef}
              type="text"
              value={contextQuery}
              placeholder="Query..."
              autoComplete="off"
              className="context-query-input flex-1 bg-transparent border-0 text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-base focus:outline-none"
              onChange={(e) => {
                oncontextQueryChange?.({ query: e.target.value });
              }}
              onKeyDown={handleQueryKeydown}
            />
          </div>
        ) : (
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <input
              ref={actualInputRef}
              type="text"
              value={value}
              placeholder={argumentCommandName || placeholder}
              autoComplete="off"
              disabled={!searchable && !argumentMode}
              className="flex-1 bg-transparent border-0 text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-base focus:outline-none"
              onChange={oninput}
              onKeyDown={handleQueryKeydown}
            />

            {argumentMode ? (
              <ArgumentChipRow
                ref={argRowRef}
                active={argumentMode}
                onValueChange={(name, val) => onArgValueChange?.(name, val)}
                onValueReset={(name) => onArgValueReset?.(name)}
                onFocusField={(idx) => onArgFocusField?.(idx)}
                onNext={onArgNext}
                onPrev={onArgPrev}
                onSubmit={onArgSubmit}
                onExit={onArgExit}
                onMoveToQuery={() => {
                  actualInputRef.current?.focus();
                  actualInputRef.current?.select();
                }}
              />
            ) : null}
          </div>
        )}

        {contextHint && !activeContext && !argumentMode ? (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-sm)] bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] text-xs">
            <span>{contextHint.name}</span>
            <KeyboardHint keys="Tab" />
          </div>
        ) : null}

        {accessory ? (
          <SearchBarAccessoryDropdown
            ref={accessoryRef}
            options={accessory.options}
            value={accessory.value}
            onChange={(val) => {
              searchBarAccessoryService
                .setSelected(accessory.extensionId, accessory.commandId, val)
                .catch((err) =>
                  logService.warn(`[SearchHeader] accessory setSelected failed: ${err}`),
                );
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
