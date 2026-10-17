import { Component, type ErrorInfo, type ReactNode } from "react";
import { strings } from "./strings";

const CHUNK_ERROR_RE =
  /chunk|dynamically imported module|Failed to fetch dynamically imported module|Importing a module script failed/i;

const RELOAD_KEY = "chunk-error-reload-at";

function isChunkError(error: Error): boolean {
  return CHUNK_ERROR_RE.test(error.message) || CHUNK_ERROR_RE.test(error.name);
}

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (isChunkError(error)) {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? "0");
        const now = Date.now();
        if (now - last > 30_000) {
          sessionStorage.setItem(RELOAD_KEY, String(now));
          window.location.reload();
          return;
        }
      } catch {
        // sessionStorage unavailable — fall through to fallback UI
      }
    }
    console.error("Chunk load error:", error, info.componentStack);
  }

  reset = (): void => {
    try {
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      // ignore
    }
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
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
