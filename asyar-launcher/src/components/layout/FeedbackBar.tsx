import React, { useState } from 'react';
import { Spinner } from '../react/Spinner';
import { StatusDot, KeyboardHint } from '../react/Indicators';
import { feedbackService } from '../../services/feedback/feedbackService';
import { DIAGNOSTIC_MESSAGES } from '../../services/diagnostics/messages';
import type { DiagnosticKind } from '../../services/diagnostics/kinds';
import FeedbackDetailsDialog from '../feedback/FeedbackDetailsDialog';
import FeedbackMessage from '../feedback/FeedbackMessage';

export default function FeedbackBar() {
  const current = feedbackService.current;
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!current) return null;

  const dotColor: 'success' | 'warning' | 'danger' | 'info' = (() => {
    switch (current?.severity) {
      case 'success':
        return 'success';
      case 'warning':
        return 'warning';
      case 'error':
      case 'fatal':
        return 'danger';
      default:
        return 'info';
    }
  })();

  const message = (() => {
    if (!current) return '';
    if (current.progress) return current.progress.title;
    const template = DIAGNOSTIC_MESSAGES[current.kind as DiagnosticKind];
    return template
      ? template(current.context ?? {})
      : (current.context?.message ?? current.developerDetail ?? 'Feedback');
  })();

  const showDetails = current?.severity !== 'progress';

  const onRetry = async () => {
    if (!current?.retryActionId) return;
    await feedbackService.triggerRetry(current.retryActionId);
    await feedbackService.dismiss(current.id);
  };

  const onDismiss = async () => {
    if (!current) return;
    await feedbackService.dismiss(current.id);
  };

  return (
    <div
      className="feedback flex items-center gap-[var(--space-2)] min-w-0 w-full text-[var(--text-secondary)] text-[var(--font-size-xs)]"
      data-severity={current.severity}
    >
      {current.severity === 'progress' ? <Spinner size="inline" /> : <StatusDot color={dotColor} />}
      <FeedbackMessage
        message={message}
        interactive={showDetails}
        onclick={() => setDetailsOpen(true)}
      />
      {current.progress?.completed != null && current.progress.total != null ? (
        <span className="progress-count shrink-0 text-[var(--text-tertiary)] tabular-nums">
          {current.progress.completed}/{current.progress.total}
        </span>
      ) : null}
      {current.retryable && current.retryActionId ? (
        <button
          type="button"
          className="feedback-action shrink-0 border-0 py-[var(--space-0-5)] px-[var(--space-1)] rounded-[var(--radius-xs)] bg-transparent text-inherit font-inherit cursor-pointer hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
          onClick={onRetry}
        >
          <KeyboardHint keys={['⌘', 'R']} action="Retry" />
        </button>
      ) : null}
      {current.severity === 'error' ? (
        <button
          type="button"
          className="feedback-action shrink-0 border-0 py-[var(--space-0-5)] px-[var(--space-1)] rounded-[var(--radius-xs)] bg-transparent text-inherit font-inherit cursor-pointer hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      ) : null}
      {detailsOpen ? (
        <FeedbackDetailsDialog
          isOpen={detailsOpen}
          onOpenChange={setDetailsOpen}
          feedback={current}
        />
      ) : null}
    </div>
  );
}
