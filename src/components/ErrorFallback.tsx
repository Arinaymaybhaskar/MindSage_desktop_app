import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { errorMessage } from "../utils/errors";
import type { ErrorBoundaryState } from "./ErrorBoundary";

interface Props extends ErrorBoundaryState {
  reset: () => void;
  /**
   * "route" sits inside the router and can offer navigation. "root" wraps
   * everything, so it must not touch the router, the toast provider or any
   * colour the theme sets at runtime.
   */
  variant: "route" | "root";
}

function details({ error, componentStack }: ErrorBoundaryState): string {
  return [
    errorMessage(error),
    error?.stack ?? "",
    componentStack ? `\nComponent stack:${componentStack}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export default function ErrorFallback({
  error,
  componentStack,
  reset,
  variant,
}: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border-light bg-surface-light p-6 shadow-xl sm:p-8 dark:border-border-dark dark:bg-surface-dark">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle size={20} />
        </div>

        <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-text-light dark:text-text-dark">
          This page stopped responding
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-text-light-sub dark:text-text-dark-sub">
          Your entries are safe on disk. Nothing was written or deleted, and any
          draft you had is still saved.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            onClick={reset}
            className="rounded-xl bg-light1 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 dark:bg-dark1"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl border border-border-light px-5 py-2.5 text-sm font-medium text-text-light transition-colors hover:bg-tertiary-light dark:border-border-dark dark:text-text-dark dark:hover:bg-tertiary-dark"
          >
            Reload the app
          </button>
          {variant === "route" && <GoToDashboard />}
        </div>

        <div className="mt-5 border-t border-border-light pt-4 dark:border-border-dark">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowDetails((v) => !v)}
              className="text-sm text-text-light-sub underline-offset-4 hover:underline dark:text-text-dark-sub"
            >
              {showDetails ? "Hide details" : "Show details"}
            </button>
            <button
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(details({ error, componentStack }))
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
              className="text-sm text-text-light-sub underline-offset-4 hover:underline dark:text-text-dark-sub"
            >
              {copied ? "Copied" : "Copy error details"}
            </button>
          </div>

          {showDetails && (
            <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-secondary-light p-3 text-xs whitespace-pre-wrap text-text-light-sub dark:bg-secondary-dark dark:text-text-dark-sub">
              {details({ error, componentStack })}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Split out so the root fallback, which renders outside the router, never
 * calls useNavigate. Never window.location.href either: the packaged build
 * loads over file://, where an absolute path goes nowhere.
 */
function GoToDashboard() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate("/dashboard")}
      className="rounded-xl border border-border-light px-5 py-2.5 text-sm font-medium text-text-light transition-colors hover:bg-tertiary-light dark:border-border-dark dark:text-text-dark dark:hover:bg-tertiary-dark"
    >
      Go to dashboard
    </button>
  );
}

/**
 * The root fallback replaces AppLayout, which is what normally tells the main
 * process the renderer is up. Without this the splash window stays in front
 * of a crash screen nobody can see for fifteen seconds.
 */
export function RootErrorFallback(
  props: ErrorBoundaryState & { reset: () => void },
) {
  useEffect(() => {
    window.electron?.send?.("renderer:visually-ready");
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-light dark:bg-base-dark">
      <ErrorFallback {...props} variant="root" />
    </div>
  );
}
