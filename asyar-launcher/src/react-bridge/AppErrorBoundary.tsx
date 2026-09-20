import { Component, type ReactNode } from 'react';
import { extractErrorMessage } from '../lib/errors';
import { feedbackService } from '../services/feedback/feedbackService';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Last-resort boundary around the whole shell: a render error reports to the
 * feedback system instead of leaving a blank window. The legacy Svelte tree
 * had the equivalent via <svelte:boundary> in AppShell.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    feedbackService.report({
      source: 'frontend',
      kind: 'render_error',
      severity: 'error',
      retryable: false,
      developerDetail: error.stack ?? String(error),
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6 text-[var(--text-primary)]">
          <h1 className="text-lg font-semibold mb-2">Something went wrong</h1>
          <p className="text-[var(--text-secondary)] text-sm whitespace-pre-wrap">
            {extractErrorMessage(this.state.error.message)}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
