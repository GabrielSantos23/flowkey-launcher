import React from 'react';
import { Spinner } from '../react/Spinner';
import type { FeedbackItem } from '../../services/feedback/internal/feedbackCommands';
import { actionService } from '../../services/action/actionService';
import { DIAGNOSTIC_MESSAGES } from '../../services/diagnostics/messages';
import type { DiagnosticKind } from '../../services/diagnostics/kinds';
import { Button } from '../react/Buttons';
import Modal from '../base/Modal';

export interface FeedbackDetailsDialogProps {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  feedback: FeedbackItem;
}

export default function FeedbackDetailsDialog({
  isOpen = false,
  onOpenChange,
  feedback,
}: FeedbackDetailsDialogProps) {
  const message = (() => {
    if (feedback.progress) return feedback.progress.title;
    const template = DIAGNOSTIC_MESSAGES[feedback.kind as DiagnosticKind];
    return template
      ? template(feedback.context || {})
      : feedback.developerDetail || 'Diagnostic item';
  })();

  const handleCopyDiagnostic = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(feedback, null, 2));
    } catch {
      // ignore
    }
  };

  const handleRetry = async () => {
    if (feedback.retryActionId) {
      await actionService.executeAction(feedback.retryActionId);
      onOpenChange?.(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      title={feedback.progress ? 'Task in progress' : 'Diagnostic details'}
      onClose={() => onOpenChange?.(false)}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          {feedback.progress && <Spinner size="sm" />}
          <p className="text-sm text-[var(--text-primary)] leading-relaxed">{message}</p>
        </div>

        {feedback.developerDetail && (
          <pre className="p-3 bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)] text-xs font-mono text-[var(--text-secondary)] whitespace-pre-wrap max-h-48 overflow-y-auto">
            {feedback.developerDetail}
          </pre>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button size="sm" variant="ghost" onClick={handleCopyDiagnostic}>
            Copy Details
          </Button>
          <div className="flex items-center gap-2">
            {feedback.retryable && (
              <Button size="sm" variant="primary" onClick={handleRetry}>
                Retry
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => onOpenChange?.(false)}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
