// The Local AI status card's state (KAN-64). Pure: the card feeds it what the
// main process reports and shows the one state it returns.

export type AIState =
  | "error"
  | "starting"
  | "paused"
  | "stopped"
  | "downloading"
  | "setup"
  | "working"
  | "ready";

/**
 * When two states apply, the first in this list wins (KAN-64): failures and
 * states the user must act on come before progress.
 */
export const AI_STATE_PRIORITY: readonly AIState[] = [
  "error",
  "setup",
  "stopped",
  "paused",
  "downloading",
  "starting",
  "working",
  "ready",
];

/** The states the compact rail shows: the ones that need the user. */
export const NEEDS_ATTENTION: readonly AIState[] = [
  "error",
  "paused",
  "stopped",
  "setup",
];

export interface AIStatusFacts {
  restart: "starting" | "ready" | "error";
  /** A download stopped by a failure (not a cancel). */
  downloadFailed: boolean;
  downloadPaused: boolean;
  downloading: boolean;
  /** Ollama is the chosen engine and is not running. */
  stopped: boolean;
  /** No writing model is installed yet. */
  needsSetup: boolean;
  /** Entry jobs (title, summary, index) are running. */
  working: boolean;
}

export function deriveAIState(f: AIStatusFacts): AIState {
  const applies: Record<AIState, boolean> = {
    error: f.restart === "error" || f.downloadFailed,
    setup: f.needsSetup,
    stopped: f.stopped,
    paused: f.downloadPaused,
    downloading: f.downloading,
    starting: f.restart === "starting",
    working: f.working,
    ready: true,
  };
  return AI_STATE_PRIORITY.find((s) => applies[s]) ?? "ready";
}
