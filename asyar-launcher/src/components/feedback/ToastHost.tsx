import React from 'react';
import { feedbackService } from '../../services/feedback/feedbackService';
import { IconButton } from '../react/Interactive';

export default function ToastHost() {
  const announcement = feedbackService.activeAnnouncement;
  if (!announcement) return null;

  const content = (
    <>
      <span className="toast-icon shrink-0 w-4 h-4 flex items-center justify-center text-[var(--accent-primary)]">
        <span className="text-base font-bold leading-none">✦</span>
      </span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-[var(--text-primary)] leading-snug truncate">
          {announcement.title}
        </span>
        {announcement.message ? (
          <span className="text-xs text-[var(--text-secondary)] leading-snug truncate">
            {announcement.message}
          </span>
        ) : null}
      </div>
    </>
  );

  return (
    <div
      className={`toast-host fixed left-1/2 -translate-x-1/2 flex items-center gap-4 max-w-[min(560px,calc(100vw-32px))] px-4 py-2.5 rounded-[var(--radius-lg)] border border-[var(--border-color)] shadow-xl z-50 backdrop-blur-xl bg-[var(--bg-popup)] ${
        announcement.onClick ? 'cursor-pointer hover:border-[var(--accent-primary)]' : ''
      }`}
      style={{ bottom: 'calc(var(--shell-footer-h) + var(--space-6))' }}
      role="status"
      aria-live="polite"
    >
      {announcement.onClick ? (
        <button
          type="button"
          className="flex items-center gap-4 min-w-0 bg-transparent border-0 p-0 text-inherit text-left cursor-pointer flex-1"
          onClick={() => feedbackService.onAnnouncementClicked()}
        >
          {content}
        </button>
      ) : (
        <div className="flex items-center gap-4 min-w-0 flex-1">{content}</div>
      )}
      <IconButton
        ariaLabel="Dismiss announcement"
        title="Dismiss announcement"
        size="sm"
        onClick={() => feedbackService.onAnnouncementDismissed()}
      >
        ×
      </IconButton>
    </div>
  );
}
