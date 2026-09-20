import React from 'react';
import { logService } from '../services/log/logService';

interface Props {
  /** Shown in the log + on screen so the failing tab is identifiable. */
  tab: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * A settings tab that throws during render currently blanks the whole
 * content area with no diagnostic. This boundary catches the throw, logs
 * it (webview console → asyar.log), and renders the message inline.
 */
export class TabErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    logService.error(`[Settings] tab "${this.props.tab}" crashed: ${error}
${info.componentStack ?? ''}`);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="p-6">
          <div className="rounded-[var(--radius-md)] border border-[var(--accent-danger)] bg-[color-mix(in_srgb,var(--accent-danger)_10%,var(--bg-primary))] p-4">
            <p className="m-0 text-sm font-medium text-[var(--accent-danger)]">
              This settings tab failed to render.
            </p>
            <pre className="m-0 mt-2 text-xs text-[var(--text-secondary)] whitespace-pre-wrap font-mono">
              {this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
