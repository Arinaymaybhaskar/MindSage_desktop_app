import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Database,
  Loader2,
  Minus,
  RefreshCw,
  Rocket,
  Settings2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import journalService from "../api/journalService";
import { qdrantService } from "../api/qDrantService";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";

/**
 * The Local AI panel in the title bar: one place for everything the local
 * models are doing or failing to do.
 *
 * It covers both halves of that. The engine half is the Ollama install/run
 * state that used to be its own bare icon next to this one. The work half is
 * per-entry enrichment - title/mood, summary and the search-index embedding
 * all land seconds after a save, on background events - plus bulk re-indexing,
 * which is collapsed into a counted row so a few hundred entries cannot become
 * a few hundred rows.
 *
 * The trigger is always mounted, so the engine state is readable at a glance
 * even when nothing is running.
 */

type JobKind = "metadata" | "summary" | "index";
type JobState = "running" | "done" | "failed" | "skipped";

/** Which job each main-process event belongs to, and what it does to it. */
const JOB_EVENTS: Record<string, { job: JobKind; state: JobState }> = {
  "journal:aiStarted": { job: "metadata", state: "running" },
  "journal:aiCompleted": { job: "metadata", state: "done" },
  "journal:aiFailed": { job: "metadata", state: "failed" },
  "ollama:summary-started": { job: "summary", state: "running" },
  "ollama:summary-generated": { job: "summary", state: "done" },
  "ollama:summary-failed": { job: "summary", state: "failed" },
  "ollama:summary-skipped": { job: "summary", state: "skipped" },
  "journal:indexStarted": { job: "index", state: "running" },
  "journal:indexCompleted": { job: "index", state: "done" },
  "journal:indexFailed": { job: "index", state: "failed" },
};

const JOB_LABEL: Record<JobKind, string> = {
  metadata: "Title & mood",
  summary: "Summary",
  index: "Search index",
};

const JOB_ORDER: JobKind[] = ["metadata", "summary", "index"];

/** How long a finished entry or bulk run stays on screen before it clears. */
const SETTLED_TTL_MS = 8000;
const PRUNE_INTERVAL_MS = 1000;

/** Sent by `OllamaEmbeddingModelSetup` on the `status-update` channel. */
type EngineStatus =
  | {
      type:
        | "init"
        | "ollama-not-installed"
        | "ollama-not-running"
        | "downloaded"
        | "system-ready"
        | "pull-failure"
        | "error";
      message?: string;
    }
  | {
      type: "downloading";
      percent: number;
      downloadedMB: number;
      totalMB: number;
    };

interface EntryActivity {
  entryId: number;
  title: string;
  preview: string;
  jobs: Partial<Record<JobKind, JobState>>;
  errors: Partial<Record<JobKind, string>>;
  settledAt: number | null;
}

interface BulkActivity {
  kind: string;
  done: number;
  total: number;
  failed: number;
  settledAt: number | null;
}

interface AIStatusPayload {
  event: string;
  data?: {
    entryId?: number;
    title?: string;
    preview?: string;
    error?: string;
    kind?: string;
    done?: number;
    total?: number;
    failed?: number;
  };
}

const isRunning = (entry: EntryActivity) =>
  Object.values(entry.jobs).some((state) => state === "running");

const hasFailed = (entry: EntryActivity) =>
  Object.values(entry.jobs).some((state) => state === "failed");

/**
 * Progress arrives one item at a time, so animating straight to each new width
 * gives a visible stutter at every tick. A spring carries the bar between
 * values instead, which stays smooth whether items land milliseconds or
 * seconds apart.
 */
const SmoothBar = ({ percent }: { percent: number }) => {
  const value = useSpring(percent, {
    stiffness: 90,
    damping: 20,
    mass: 0.5,
    restDelta: 0.01,
  });
  const width = useTransform(
    value,
    (raw) => `${Math.max(0, Math.min(100, raw))}%`,
  );

  useEffect(() => {
    value.set(percent);
  }, [percent, value]);

  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-tertiary-light dark:bg-tertiary-dark">
      <motion.div
        style={{ width }}
        className="h-full rounded-full bg-dark1 dark:bg-light1"
      />
    </div>
  );
};

const JobChip = ({ job, state }: { job: JobKind; state: JobState }) => {
  const chip = {
    running: {
      icon: <Loader2 size={11} className="animate-spin" />,
      className:
        "bg-tertiary-light dark:bg-tertiary-dark text-text-light dark:text-text-dark",
    },
    done: {
      icon: <Check size={11} />,
      className: "bg-success/15 text-success",
    },
    failed: {
      icon: <AlertCircle size={11} />,
      className: "bg-danger/15 text-danger",
    },
    skipped: {
      icon: <Minus size={11} />,
      className:
        "bg-tertiary-light/60 dark:bg-tertiary-dark/60 text-text-light-sub dark:text-text-dark-sub",
    },
  }[state];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${chip.className}`}
    >
      {chip.icon}
      {JOB_LABEL[job]}
      {state === "skipped" && " skipped"}
    </span>
  );
};

export default function LocalAIPanel() {
  const [entries, setEntries] = useState<EntryActivity[]>([]);
  const [bulks, setBulks] = useState<BulkActivity[]>([]);
  const [engine, setEngine] = useState<EngineStatus>({ type: "init" });
  const [isOpen, setIsOpen] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { showToast } = useToast();

  // Engine state. `check-status` re-runs the whole probe in the main process,
  // which is also how the "Check again" button recovers from a failure.
  useEffect(() => {
    const unsubscribe = window.electron.onStatusUpdate<EngineStatus>((status) =>
      setEngine(status),
    );
    window.electron.send("check-status");
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // One channel carries every AI event: starts, completions, failures, skips
  // and bulk progress. Subscribing to the dedicated onAIStarted/onAICompleted
  // bridges instead would miss the failures, which is what used to leave the
  // indicator spinning for the rest of the session.
  useEffect(() => {
    const handle = (payload: AIStatusPayload) => {
      const { event, data } = payload ?? {};
      if (!data) return;

      if (event?.startsWith("qdrant:bulk")) {
        const kind = data.kind ?? "entries";
        const total = data.total ?? 0;
        if (event === "qdrant:bulkStarted" && total === 0) return;
        setBulks((previous) => {
          const current = previous.find((bulk) => bulk.kind === kind);
          const updated: BulkActivity = {
            kind,
            total: total || current?.total || 0,
            done:
              event === "qdrant:bulkCompleted"
                ? total || current?.total || 0
                : (data.done ?? current?.done ?? 0),
            failed: data.failed ?? current?.failed ?? 0,
            settledAt: event === "qdrant:bulkCompleted" ? Date.now() : null,
          };
          // Update in place: re-appending made the rows reshuffle under the
          // cursor on every progress tick.
          return current
            ? previous.map((bulk) => (bulk.kind === kind ? updated : bulk))
            : [...previous, updated];
        });
        return;
      }

      const transition = event ? JOB_EVENTS[event] : undefined;
      if (!transition || typeof data.entryId !== "number") return;
      const { entryId } = data;

      setEntries((previous) => {
        const existing = previous.find((entry) => entry.entryId === entryId);
        const updated: EntryActivity = {
          entryId,
          // A brand new entry has no title until the model writes one, so keep
          // whatever the latest event knows and fall back to the snippet.
          title: data.title?.trim() || existing?.title || "",
          preview: data.preview || existing?.preview || "",
          jobs: { ...existing?.jobs, [transition.job]: transition.state },
          errors: { ...existing?.errors },
          settledAt: null,
        };
        if (transition.state === "failed") {
          updated.errors[transition.job] = data.error || "Generation failed";
        } else {
          delete updated.errors[transition.job];
        }
        if (!isRunning(updated)) updated.settledAt = Date.now();

        // Same reason as the bulk rows: an entry keeps its place in the list
        // for as long as it is on screen.
        return existing
          ? previous.map((entry) =>
              entry.entryId === entryId ? updated : entry,
            )
          : [...previous, updated];
      });
    };

    return window.electron.ipcRenderer.on<[AIStatusPayload]>(
      "ai-status-event",
      handle,
    );
  }, []);

  // Finished work clears itself; failures stay until they are retried, because
  // they are the only ones the user has to act on.
  useEffect(() => {
    const prune = () => {
      const cutoff = Date.now() - SETTLED_TTL_MS;
      setEntries((previous) =>
        previous.filter(
          (entry) =>
            hasFailed(entry) ||
            entry.settledAt === null ||
            entry.settledAt > cutoff,
        ),
      );
      setBulks((previous) =>
        previous.filter(
          (bulk) => bulk.settledAt === null || bulk.settledAt > cutoff,
        ),
      );
    };
    const timer = setInterval(prune, PRUNE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const runningEntries = entries.filter(isRunning);
  const failedEntries = entries.filter(hasFailed);
  const runningBulks = bulks.filter((bulk) => bulk.settledAt === null);
  const busyCount = runningEntries.length + runningBulks.length;

  const entryLabel = (entry: EntryActivity) =>
    entry.title?.trim() || entry.preview || "New entry";

  /** Engine state as the pill and the panel's first row present it. */
  const engineView = useMemo(() => {
    switch (engine.type) {
      case "downloading":
        return {
          icon: <Loader2 size={13} className="animate-spin" />,
          short: `Model ${Math.round(engine.percent)}%`,
          title: "Downloading embedding model",
          detail: `${engine.downloadedMB} of ${engine.totalMB} MB`,
          percent: engine.percent,
          tone: "text-dark1 dark:text-light1",
          action: null,
        };
      case "ollama-not-installed":
        return {
          icon: <Rocket size={13} />,
          short: "Ollama missing",
          title: "Ollama is not installed",
          detail: "Local AI features stay off until it is installed.",
          tone: "text-danger",
          action: { label: "Install", to: "/ollama-tutorial" },
        };
      case "ollama-not-running":
        return {
          icon: <AlertCircle size={13} />,
          short: "Ollama stopped",
          title: "Ollama is installed but not running",
          detail: "Start it and check again.",
          tone: "text-warning",
          action: { label: "How to start", to: "/ollama-tutorial" },
        };
      case "pull-failure":
      case "error":
        return {
          icon: <AlertCircle size={13} />,
          short: "AI unavailable",
          title: "Something went wrong with Ollama",
          detail: engine.message || "The last status check failed.",
          tone: "text-danger",
          action: { label: "Set up", to: "/setup" },
        };
      case "downloaded":
      case "system-ready":
        return {
          icon: <CheckCircle2 size={13} />,
          short: "AI ready",
          title: "Ollama is running",
          detail: "Models are local; nothing leaves this machine.",
          tone: "text-success",
          action: null,
        };
      default:
        return {
          icon: <Loader2 size={13} className="animate-spin" />,
          short: "Checking AI",
          title: "Checking the local AI engine",
          detail: "Looking for a running Ollama instance.",
          tone: "text-text-light-sub dark:text-text-dark-sub",
          action: null,
        };
    }
  }, [engine]);

  /** Work in progress outranks engine state; the engine is the resting view. */
  const pill = useMemo(() => {
    if (runningBulks.length > 0) {
      const done = runningBulks.reduce((sum, bulk) => sum + bulk.done, 0);
      const total = runningBulks.reduce((sum, bulk) => sum + bulk.total, 0);
      return {
        icon: <Loader2 size={13} className="animate-spin" />,
        tone: "text-dark1 dark:text-light1",
        text: `Indexing ${done}/${total}`,
      };
    }
    if (runningEntries.length === 1) {
      return {
        icon: <Loader2 size={13} className="animate-spin" />,
        tone: "text-dark1 dark:text-light1",
        text: entryLabel(runningEntries[0]),
      };
    }
    if (runningEntries.length > 1) {
      return {
        icon: <Loader2 size={13} className="animate-spin" />,
        tone: "text-dark1 dark:text-light1",
        text: `${runningEntries.length} entries`,
      };
    }
    if (failedEntries.length > 0) {
      return {
        icon: <AlertCircle size={13} />,
        tone: "text-danger",
        text:
          failedEntries.length === 1
            ? "1 needs attention"
            : `${failedEntries.length} need attention`,
      };
    }
    return {
      icon: engineView.icon,
      tone: engineView.tone,
      text: engineView.short,
    };
  }, [runningBulks, runningEntries, failedEntries, engineView]);

  const retry = useCallback(
    async (entry: EntryActivity, job: JobKind) => {
      const key = `${entry.entryId}:${job}`;
      setRetrying(key);
      try {
        if (job === "index") {
          await qdrantService.syncJournal(entry.entryId);
        } else {
          if (!accessToken) throw new Error("Not signed in");
          const result = await journalService.retryAIMetadata(
            accessToken,
            entry.entryId,
            job === "metadata" ? "metadata" : "summary",
          );
          if (!result?.success && !result?.skipped) {
            throw new Error(result?.error || "Generation failed");
          }
        }
        // The main process reports the outcome on the event channel, which is
        // what actually updates this row; clear the old failure meanwhile.
        setEntries((previous) =>
          previous.map((item) =>
            item.entryId === entry.entryId
              ? {
                  ...item,
                  jobs: { ...item.jobs, [job]: "running" },
                  errors: { ...item.errors, [job]: undefined },
                  settledAt: null,
                }
              : item,
          ),
        );
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : "Retry failed",
          "danger",
        );
      } finally {
        setRetrying(null);
      }
    },
    [accessToken, showToast],
  );

  const go = (path: string) => {
    setIsOpen(false);
    navigate(path);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-label={busyCount > 0 ? "Local AI, in progress" : "Local AI"}
        className="flex h-7 max-w-[13rem] items-center gap-1.5 rounded-full border border-border-light bg-tertiary-light/60 pl-2 pr-2.5 text-text-light transition-colors hover:bg-tertiary-light dark:border-border-dark dark:bg-tertiary-dark/60 dark:text-text-dark dark:hover:bg-tertiary-dark"
      >
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center ${pill.tone}`}
        >
          {pill.icon}
        </span>
        <span className="truncate text-xs font-medium">{pill.text}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-full z-20 mt-2 w-[22rem] origin-top-right rounded-xl border border-border-light bg-secondary-light shadow-2xl dark:border-border-dark dark:bg-secondary-dark"
          >
            <div className="flex items-center gap-2 border-b border-border-light px-4 py-3 dark:border-border-dark">
              <p className="flex-1 text-sm font-semibold text-text-light dark:text-text-dark">
                Local AI
              </p>
              <span className="text-xs text-text-light-sub dark:text-text-dark-sub">
                {busyCount > 0 ? `${busyCount} running` : engineView.short}
              </span>
            </div>

            <div className="max-h-[22rem] overflow-y-auto p-2">
              {/* Engine first: nothing below it can run without it. */}
              <div className="rounded-lg px-2 py-2.5">
                <div className="flex items-start gap-2.5">
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center ${engineView.tone}`}
                  >
                    {engineView.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-light dark:text-text-dark">
                      {engineView.title}
                    </p>
                    <p className="text-xs text-text-light-sub dark:text-text-dark-sub">
                      {engineView.detail}
                    </p>
                    {typeof engineView.percent === "number" && (
                      <SmoothBar percent={engineView.percent} />
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {engineView.action && (
                        <button
                          onClick={() => go(engineView.action!.to)}
                          className="rounded-md bg-dark1 px-2 py-1 text-xs font-semibold text-white dark:bg-light1 dark:text-dark1"
                        >
                          {engineView.action.label}
                        </button>
                      )}
                      <button
                        onClick={() => window.electron.send("check-status")}
                        className="inline-flex items-center gap-1.5 rounded-md bg-tertiary-light px-2 py-1 text-xs font-semibold text-text-light transition-colors hover:bg-border-light dark:bg-tertiary-dark dark:text-text-dark dark:hover:bg-border-dark"
                      >
                        <RefreshCw size={11} />
                        Check again
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {bulks.map((bulk) => (
                <div key={bulk.kind} className="rounded-lg px-2 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Database
                      size={15}
                      className="shrink-0 text-text-light-sub dark:text-text-dark-sub"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium text-text-light dark:text-text-dark">
                          {bulk.settledAt ? "Re-indexed" : "Re-indexing"}{" "}
                          {bulk.kind}
                        </p>
                        <span className="shrink-0 text-xs tabular-nums text-text-light-sub dark:text-text-dark-sub">
                          {bulk.done}/{bulk.total}
                        </span>
                      </div>
                      <SmoothBar
                        percent={
                          bulk.total ? (bulk.done / bulk.total) * 100 : 0
                        }
                      />
                      {bulk.failed > 0 && (
                        <p className="mt-1 text-xs text-danger">
                          {bulk.failed} failed
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {entries.map((entry) => {
                const failed = hasFailed(entry);
                return (
                  <div
                    key={entry.entryId}
                    className="rounded-lg px-2 py-2.5 transition-colors hover:bg-tertiary-light dark:hover:bg-tertiary-dark"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                        {isRunning(entry) ? (
                          <Loader2
                            size={14}
                            className="animate-spin text-dark1 dark:text-light1"
                          />
                        ) : failed ? (
                          <AlertCircle size={14} className="text-danger" />
                        ) : (
                          <CheckCircle2 size={14} className="text-success" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => go(`/journal/view/${entry.entryId}`)}
                          className="block w-full truncate text-left text-sm font-medium text-text-light hover:underline dark:text-text-dark"
                        >
                          {entryLabel(entry)}
                        </button>
                        {entry.title?.trim() && entry.preview && (
                          <p className="truncate text-xs text-text-light-sub dark:text-text-dark-sub">
                            {entry.preview}
                          </p>
                        )}
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {JOB_ORDER.map((job) => {
                            const state = entry.jobs[job];
                            return state ? (
                              <JobChip key={job} job={job} state={state} />
                            ) : null;
                          })}
                        </div>
                        {JOB_ORDER.map((job) => {
                          const message = entry.errors[job];
                          if (!message) return null;
                          const key = `${entry.entryId}:${job}`;
                          return (
                            <div key={job} className="mt-1.5">
                              <p className="text-xs text-danger">
                                {JOB_LABEL[job]}: {message}
                              </p>
                              <button
                                onClick={() => void retry(entry, job)}
                                disabled={retrying === key}
                                aria-label={`Retry ${JOB_LABEL[job]}`}
                                className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-tertiary-light px-2 py-1 text-xs font-semibold text-text-light transition-colors hover:bg-border-light disabled:opacity-50 dark:bg-tertiary-dark dark:text-text-dark dark:hover:bg-border-dark"
                              >
                                <RefreshCw
                                  size={11}
                                  className={
                                    retrying === key ? "animate-spin" : ""
                                  }
                                />
                                Retry
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

              {bulks.length === 0 && entries.length === 0 && (
                <p className="px-2 py-2 text-xs text-text-light-sub dark:text-text-dark-sub">
                  No entries are being processed right now.
                </p>
              )}
            </div>

            <div className="border-t border-border-light p-2 dark:border-border-dark">
              <button
                onClick={() => go("/setup")}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-text-light transition-colors hover:bg-tertiary-light dark:text-text-dark dark:hover:bg-tertiary-dark"
              >
                <Settings2 size={15} />
                AI setup and models
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
