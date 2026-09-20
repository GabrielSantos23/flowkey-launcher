import type { FeedbackItem } from '../../services/feedback/internal/feedbackCommands';
import { DIAGNOSTIC_MESSAGES } from '../../services/diagnostics/messages';
import type { DiagnosticKind } from '../../services/diagnostics/kinds';

export function resolveFeedbackMessage(status: FeedbackItem | null): string {
  if (!status) return '';
  const t = DIAGNOSTIC_MESSAGES[status.kind as DiagnosticKind];
  return t ? t(status.context ?? {}) : (status.developerDetail ?? 'Error');
}

export function isFeedbackRetryable(status: FeedbackItem | null): boolean {
  return !!status?.retryable && !!status?.retryActionId;
}
