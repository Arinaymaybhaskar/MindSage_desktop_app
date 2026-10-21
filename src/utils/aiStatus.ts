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
 * When two states apply, the first in this list wins. Failures and states the
 * user must act on come before progress; downloading beats setup (the setup is
 * being done) and beats working (a model download is the longer wait).
 */
export const AI_STATE_PRIORITY: readonly AIState[] = [
  "error",
  "starting",
  "paused",
  "stopped",
  "downloading",
  "setup",
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
    starting: f.restart === "starting",
    paused: f.downloadPaused,
    stopped: f.stopped,
    downloading: f.downloading,
    setup: f.needsSetup,
    working: f.working,
    ready: true,
  };
  return AI_STATE_PRIORITY.find((s) => applies[s]) ?? "ready";
}
