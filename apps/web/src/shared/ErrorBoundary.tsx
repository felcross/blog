import { Component, type ErrorInfo, type ReactNode } from "react";
import { strings } from "./strings";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) {
        return this.props.fallback(error, this.reset);
      }
      return (
        <div
          role="alert"
          className="flex min-h-screen items-center justify-center bg-light-bg p-6 text-text-on-light"
        >
          <div className="max-w-md text-center">
            <h1 className="mb-4 font-[family-name:var(--font-inter)] text-2xl font-bold">
              {strings.errorBoundary.title}
            </h1>
            <p className="mb-8 text-text-on-light-muted">{strings.errorBoundary.message}</p>
            <button
              type="button"
              onClick={this.reset}
              className="min-h-11 rounded-full bg-accent px-6 font-medium text-text-on-dark transition-opacity hover:opacity-90"
            >
              {strings.errorBoundary.retry}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
