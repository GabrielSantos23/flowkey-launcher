import React from 'react';
import { actionService, type ApplicationAction } from '../../services/action/actionService';
import type { SearchResult } from '../../services/search/interfaces/SearchResult';
import { viewManager } from '../../services/extension/viewManager';
import extensionManager from '../../services/extension/extensionManager';
import { feedbackService } from '../../services/feedback/feedbackService';
import PrimaryActionDisplay from './PrimaryActionDisplay';
import BottomBarButton from './BottomBarButton';
import FeedbackBar from './FeedbackBar';
import { StatusDot } from '../react/Indicators';
import InformationPanel from './InformationPanel';
import ShowMoreBarHuds from './ShowMoreBarHuds';

export interface BottomActionBarProps {
  selectedItem?: SearchResult | null;
  isActionListOpen: boolean;
  isCompactIdle?: boolean;
  argumentValidationError?: string | null;
  onactionListToggled: () => void;
  onactionListClosed: () => void;
  onexpand?: () => void;
}

export interface BottomActionBarHandle {
  getEnrichedActions: () => (ApplicationAction & { displayCategory: string })[];
  toggleActionList: () => void;
  closeActionList: () => void;
  isOpen: () => boolean;
}

export default function BottomActionBar({
  selectedItem = null,
  isActionListOpen,
  isCompactIdle = false,
  argumentValidationError = null,
  onactionListToggled,
  onactionListClosed,
  onexpand,
}: BottomActionBarProps) {
  const activeView = viewManager.activeView;
  const extensionId = activeView ? activeView.split('/')[0] : null;
  const activeViewManifest = extensionId
    ? (extensionManager.getManifestById(extensionId) ?? null)
    : null;
  const hasFeedback = feedbackService.current !== null;

  return (
    <>
      <div
        className={`fixed bottom-0 left-0 right-0 border-t border-[var(--border-color)] flex items-center justify-between px-3 bottom-action-bar ${
          isCompactIdle ? 'hidden' : ''
        }`}
        style={{
          height: 'var(--shell-footer-h)',
          zIndex: 'var(--z-footer)',
          backgroundColor: 'var(--bg-secondary-full-opacity)',
        }}
      >
        <div className="flex-1 min-w-0 flex items-center gap-3">
          {argumentValidationError ? (
            <div
              className="arg-validation flex items-center gap-[var(--space-2)] min-w-0 px-[var(--space-3)] py-[var(--space-1)] rounded-full bg-[color-mix(in_srgb,var(--accent-danger)_12%,transparent)] text-[var(--accent-danger)] text-[var(--font-size-xs)]"
              role="status"
            >
              <StatusDot color="danger" />
              {argumentValidationError.startsWith('Required  ') ? (
                <span className="arg-validation-text overflow-hidden text-ellipsis whitespace-pre">
                  <strong>Required</strong>
                  {argumentValidationError.slice('Required'.length)}
                </span>
              ) : (
                <span className="arg-validation-text overflow-hidden text-ellipsis whitespace-pre">
                  {argumentValidationError}
                </span>
              )}
            </div>
          ) : hasFeedback ? (
            <FeedbackBar />
          ) : activeViewManifest ? (
            <InformationPanel activeViewManifest={activeViewManifest} />
          ) : null}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <PrimaryActionDisplay
            selectedItem={selectedItem}
            activeViewLabel={viewManager.activeViewPrimaryActionLabel}
          />

          {selectedItem || viewManager.activeViewPrimaryActionLabel ? (
            <span
              aria-hidden="true"
              className="bottom-bar-separator inline-block w-[2px] h-[11px] rounded-full bg-[var(--separator)] shrink-0"
            />
          ) : null}

          <BottomBarButton
            label={'Actions'}
            keyHint={['⌘', 'K']}
            onclick={onactionListToggled}
            ariaHaspopup="true"
            ariaExpanded={isActionListOpen}
          />
        </div>
      </div>

      <div
        className={`fixed left-0 right-0 flex items-center justify-between gap-3 px-3 show-more-bar ${
          isCompactIdle ? 'visible' : 'invisible'
        }`}
        style={{
          top: 'var(--shell-header-h)',
          height: 'var(--shell-footer-h)',
          zIndex: 'var(--z-footer)',
          backgroundColor: 'var(--bg-secondary-full-opacity)',
        }}
      >
        <ShowMoreBarHuds />
        <BottomBarButton label={'Show More'} keyHint="↓" onclick={() => onexpand?.()} />
      </div>
    </>
  );
}
