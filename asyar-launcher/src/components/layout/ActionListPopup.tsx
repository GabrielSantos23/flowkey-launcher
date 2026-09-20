import React, { useState, useRef, useEffect } from 'react';
import { logService } from '../../services/log/logService';
import LauncherListRow from '../list/LauncherListRow';
import { EmptyState } from '../react/Feedback';
import { actionService, type ApplicationAction } from '../../services/action/actionService';
import { feedbackService } from '../../services/feedback/feedbackService';
import { filterActions } from './actionFilter';
import { scrollSelectedIntoView, resetListScroll } from '../../lib/listScroll';
import { groupActionsForDisplay } from './actionListOrdering';

export interface ActionListPopupProps {
  availableActions?: ApplicationAction[];
  selectedItemName?: string | null;
  inExtensionView?: boolean;
  onclose?: () => void;
}

export default function ActionListPopup({
  availableActions = [],
  selectedItemName = null,
  inExtensionView = false,
  onclose,
}: ActionListPopupProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showHeader = !inExtensionView && !!selectedItemName;
  const filteredForSearch = filterActions(availableActions, searchQuery);
  const groupedActions = groupActionsForDisplay(filteredForSearch);
  const flatActions = groupedActions.flatMap((g) => g.actions);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (selectedIndex >= flatActions.length) {
      setSelectedIndex(Math.max(0, flatActions.length - 1));
    }
  }, [flatActions.length, selectedIndex]);

  useEffect(() => {
    if (popupRef.current && selectedIndex >= 0) {
      requestAnimationFrame(() => {
        if (popupRef.current) scrollSelectedIntoView(popupRef.current, selectedIndex);
      });
    }
  }, [selectedIndex]);

  const handleActionSelect = async (actionId: string) => {
    logService.debug(`[ActionListPopup] Action selected: ${actionId}`);
    const action = flatActions.find((a) => a.id === actionId);
    if (!action) return;

    onclose?.();

    if (action.confirm) {
      const confirmed = await feedbackService.confirmAlert({
        title: 'Confirm Action',
        message: `Are you sure you want to run '${action.label}'? This cannot be undone.`,
        confirmText: 'Confirm',
        variant: 'danger',
      });
      if (!confirmed) return;
    }

    try {
      await actionService.executeAction(action.id);
    } catch (err) {
      logService.error(`Failed to execute action ${action.id}: ${err}`);
    }
  };

  const handleKeydown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (searchQuery.length > 0) {
        setSearchQuery('');
      } else {
        onclose?.();
      }
      return;
    }

    if (flatActions.length === 0) return;

    if ((event.metaKey || event.ctrlKey) && event.key === 'Backspace') {
      event.preventDefault();
      event.stopPropagation();
      const deleteAction = flatActions.find(
        (a) => a.shortcut === 'Super+Backspace' || a.id.includes('delete'),
      );
      if (deleteAction) {
        void handleActionSelect(deleteAction.id);
        return;
      }
    }

    const isDown = event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey);
    const isUp = event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey);

    if (isDown || isUp) {
      event.preventDefault();
      event.stopPropagation();
      setSelectedIndex((prev) => {
        if (isDown) {
          return prev < flatActions.length - 1 ? prev + 1 : 0;
        } else {
          return prev > 0 ? prev - 1 : flatActions.length - 1;
        }
      });
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      const action = flatActions[selectedIndex];
      if (action) handleActionSelect(action.id);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end pr-[var(--space-3)] pb-[calc(var(--shell-footer-h)+12px)] pointer-events-none"
      onKeyDown={handleKeydown}
    >
      <div
        ref={popupRef}
        className="pointer-events-auto w-[320px] max-w-[calc(100vw-32px)] max-h-[340px] rounded-[var(--radius-xl)] bg-[var(--bg-popup)] border border-[var(--border-color)] shadow-2xl flex flex-col overflow-hidden backdrop-blur-xl"
      >
        {showHeader ? (
          <div className="px-3 py-1.5 text-xs text-[var(--text-tertiary)] truncate border-b border-[var(--border-color)]">
            {selectedItemName}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto p-1.5 custom-scrollbar">
          {flatActions.length === 0 ? (
            <EmptyState message="No matching actions" />
          ) : (
            groupedActions.map((group) => (
              <div key={group.category} className="mb-1 last:mb-0">
                {groupedActions.length > 1 && (
                  <div className="px-2 py-1 text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                    {group.category}
                  </div>
                )}
                {group.actions.map((act) => {
                  const globalIdx = flatActions.findIndex((a) => a.id === act.id);
                  const isSelected = globalIdx === selectedIndex;
                  return (
                    <LauncherListRow
                      key={act.id}
                      data-index={globalIdx}
                      title={act.label}
                      icon={act.icon}
                      shortcut={act.shortcut}
                      shortcutPlacement="trailing"
                      bareIcon={true}
                      destructive={act.destructive}
                      selected={isSelected}
                      onClick={() => handleActionSelect(act.id)}
                    />
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="px-3 py-2 border-t border-[var(--border-color)]">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search for actions..."
            className="w-full bg-transparent text-[var(--text-primary)] text-sm border-0 focus:outline-none placeholder:text-[var(--text-tertiary)]"
          />
        </div>
      </div>
    </div>
  );
}
