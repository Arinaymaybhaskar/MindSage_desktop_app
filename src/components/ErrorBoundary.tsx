import { Component, type ErrorInfo, type ReactNode } from "react";

export interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
}

interface Props {
  children: ReactNode;
  /** Rendered in place of the children once something below has thrown. */
  fallback: (state: ErrorBoundaryState & { reset: () => void }) => ReactNode;
}

/**
 * The only class component in the renderer. React has no hook equivalent of
 * getDerivedStateFromError, so this cannot be a function. The fallback is a
 * render prop rather than a nested component so it stays a function
 * component and can still use hooks.
 */
export default class ErrorBoundary extends Component<
  Props,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The renderer has no logger and no crash reporting, so the console is
    // the ceiling here. The fallback offers the details for copying.
    console.error("[ErrorBoundary] Render failed:", error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  reset = () => {
    this.setState({ error: null, componentStack: null });
  };

  render() {
    if (this.state.error) {
      return this.props.fallback({ ...this.state, reset: this.reset });
    }
    return this.props.children;
  }
}
