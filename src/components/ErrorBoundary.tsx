import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * "page" sits inside the router around the routes, so the title bar and dock
   * stay usable and the user can navigate away. "app" is the last resort at
   * the root, where nothing around it can be trusted to render.
   */
  scope: "page" | "app";
  /**
   * Clears the error when it changes. The page boundary passes the route, so
   * leaving the broken page recovers without a reload.
   */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
  resetKey?: string;
}

/**
 * Catches render errors so one exception no longer white-screens the app.
 *
 * It deliberately does nothing to localStorage. New-entry drafts are already
 * autosaved there by the journal form and by Quick Capture, so they survive the
 * crash, and a reload brings them back.
 */
export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[ErrorBoundary:${this.props.scope}]`,
      error,
      info.componentStack,
    );
  }

  private retry = () => this.setState({ error: null });

  private goToDashboard = () => {
    window.location.hash = "#/dashboard";
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        className={`flex flex-col items-center justify-center gap-4 bg-base-light px-6 text-center dark:bg-base-dark ${
          this.props.scope === "app" ? "h-screen" : "h-full"
        }`}
      >
        <p className="text-lg text-text-light dark:text-text-dark">
          Something went wrong on this screen.
        </p>
        <p className="max-w-md text-sm text-text-light-sub dark:text-text-dark-sub">
          Your saved entries are untouched, and an unsaved new entry is kept as
          a draft.
        </p>
        <pre className="max-w-md overflow-x-auto whitespace-pre-wrap rounded-lg bg-tertiary-light p-3 text-left text-xs text-text-light-sub dark:bg-tertiary-dark dark:text-text-dark-sub">
          {error.message}
        </pre>
        <div className="flex gap-2">
          <button
            onClick={this.retry}
            className="rounded-lg bg-light1 px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 dark:bg-dark1"
          >
            Try again
          </button>
          <button
            onClick={this.goToDashboard}
            className="rounded-lg border border-border-light px-4 py-2 text-sm font-medium text-text-light transition-opacity hover:opacity-80 dark:border-border-dark dark:text-text-dark"
          >
            Go to the dashboard
          </button>
        </div>
      </div>
    );
  }
}
