// Sends the window's warnings and errors to the main process's log (KAN-170),
// through one channel, "log:renderer". The main process checks the size and
// redacts it before it is written. Nothing is sent from console.log or info.

type Level = "warn" | "error";

const MAX_STRING = 500;
const MAX_STACK_LINES = 8;
const MAX_ARGS = 6;

/** A small, JSON-safe version of anything a console call may be given. */
export function toLoggable(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.slice(0, MAX_STRING);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) {
    return {
      error: value.name,
      message: value.message.slice(0, MAX_STRING),
      stack: (value.stack ?? "")
        .split("\n")
        .slice(0, MAX_STACK_LINES)
        .join("\n"),
    };
  }
  if (depth >= 2) return "[…]";
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((v) => toLoggable(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as object).slice(0, 20)) {
      out[k] = toLoggable(v, depth + 1);
    }
    return out;
  }
  return `[${typeof value}]`;
}

export function reportToMain(level: Level, args: unknown[]): void {
  try {
    window.electron?.send("log:renderer", {
      level,
      args: args.slice(0, MAX_ARGS).map((a) => toLoggable(a)),
    });
  } catch {
    // Logging must never throw into the page.
  }
}

let installed = false;

/** Forwards console.warn / console.error and uncaught errors. Call once. */
export function installRendererLogging(): () => void {
  if (installed) return () => {};
  installed = true;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = (...args: unknown[]) => {
    reportToMain("warn", args);
    originalWarn.apply(console, args);
  };
  console.error = (...args: unknown[]) => {
    reportToMain("error", args);
    originalError.apply(console, args);
  };
  const onError = (event: ErrorEvent) =>
    reportToMain("error", ["Uncaught error", event.error ?? event.message]);
  const onRejection = (event: PromiseRejectionEvent) =>
    reportToMain("error", ["Unhandled promise rejection", event.reason]);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    console.warn = originalWarn;
    console.error = originalError;
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    installed = false;
  };
}
