import { Component, type ErrorInfo, type ReactNode } from 'react';
import { getHost } from '@/bridge';
import { Button } from '@/components/ui/button';

/**
 * Last-resort boundary around the whole settings app: a render error must
 * never blank the window into the host page's "Loading settings…" state.
 * The error is forwarded to the shell log (visible with FLOWKEY_LOG=1) and
 * rendered inline so it is diagnosable without a debugger.
 */
interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    getHost()?.postMessage({
      type: 'log',
      message: 'settings render error: ' + error.message + ' | ' + info.componentStack,
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <div className="text-sm font-medium text-foreground">Settings hit a rendering error</div>
          <div className="max-w-[560px] break-words text-xs text-text-secondary">
            {this.state.error.message}
          </div>
          <Button onClick={() => this.setState({ error: null })}>Reload</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
