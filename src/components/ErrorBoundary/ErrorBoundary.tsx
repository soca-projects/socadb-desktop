import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-surface-canvas p-8">
          <p className="text-sm font-medium text-secondary">Something went wrong</p>
          <p className="max-w-md text-center font-mono text-xs text-tertiary">
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-[13px] font-medium text-secondary transition-all hover:bg-surface-muted"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
