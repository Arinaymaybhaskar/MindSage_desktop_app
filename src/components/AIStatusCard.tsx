import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  CirclePlus,
  Download,
  Loader2,
  Pause,
  Sparkles,
  Square,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import {
  aiModelService,
  aiStatusService,
  type AIStatus,
  type DownloadProgress,
  type RestartStatus,
} from "../api/aiModelService";
import { setupService } from "../api/setupService";
import {
  deriveAIState,
  NEEDS_ATTENTION,
  type AIState,
} from "../utils/aiStatus";
import { JOB_EVENTS, type JobKind } from "../utils/aiJobs";

/** A new state shows only after it held this long, so starting/ready cannot flash. */
export const SETTLE_MS = 500;
const OLLAMA_POLL_MS = 10_000;

type Action = "Resume" | "Restart" | "Set up";

// The shape differs per attention state (triangle, bars, square, plus), so the
// compact rail does not rely on colour alone.
const VIEW: Record<
  AIState,
  { icon: LucideIcon; tone: string; action?: Action }
> = {
  ready: { icon: CheckCircle2, tone: "text-success" },
  working: { icon: Sparkles, tone: "text-info" },
  downloading: { icon: Download, tone: "text-info" },
  starting: { icon: Loader2, tone: "text-info" },
  paused: { icon: Pause, tone: "text-warning", action: "Resume" },
  stopped: { icon: Square, tone: "text-warning", action: "Restart" },
  error: { icon: TriangleAlert, tone: "text-danger", action: "Restart" },
  setup: { icon: CirclePlus, tone: "text-warning", action: "Set up" },
};

/** Shows `value` once it has held for `ms`; an error shows at once. */
function useSettled(value: string, ms: number): string {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (value === "error") {
      setShown(value);
      return;
    }
    const t = setTimeout(() => setShown(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return shown;
}

/**
 * The Local AI status card: exactly one of eight states. Priority when several
 * apply is in `utils/aiStatus.ts`. In the compact rail it renders only when AI
 * needs attention. The sr-only role=status region is always mounted, so a
 * change is announced politely even when the card itself is hidden.
 */
export default function AIStatusCard({
  compact = false,
}: {
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [restart, setRestart] = useState<RestartStatus["state"]>("ready");
  const [restartDetails, setRestartDetails] = useState<string>();
  const [jobs, setJobs] = useState<Map<string, JobKind>>(new Map());
  const [ollamaUp, setOllamaUp] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const s = await aiStatusService.get();
    if (!s) return;
    setStatus(s);
    setRestart(s.restart.state);
    setRestartDetails(s.restart.details);
    setProgress((p) => p ?? (s.downloading ? { ...s.downloading } : null));
  }, []);

  useEffect(() => {
    refresh();
    const offs = [
      aiStatusService.onDownloadProgress((p) => {
        setProgress(p.cancelled || p.finished ? null : p);
        if (p.finished) refresh();
      }),
      aiStatusService.onRestartStatus((s) => {
        setRestart(s.state);
        setRestartDetails(s.details);
        if (s.state === "ready") setProgress((p) => (p?.error ? null : p));
      }),
      aiStatusService.onJobEvent((payload) => {
        const { event, data } = payload as {
          event: string;
          data?: { entryId?: number };
        };
        const t = JOB_EVENTS[event];
        if (!t) return;
        const key = `${t.job}:${data?.entryId ?? ""}`;
        setJobs((prev) => {
          const next = new Map(prev);
          if (t.state === "running") next.set(key, t.job);
          else next.delete(key);
          return next;
        });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [refresh]);

  const provider = status?.provider;
  useEffect(() => {
    if (provider !== "ollama") {
      setOllamaUp(true);
      return;
    }
    const check = () =>
      setupService.getStatus().then((s) => s && setOllamaUp(s.ollamaRunning));
    check();
    const t = setInterval(check, OLLAMA_POLL_MS);
    return () => clearInterval(t);
  }, [provider]);

  const failed = !!progress?.error && !progress.cancelled;
  const paused = !!progress?.paused;
  const downloading = !!progress && !failed && !paused;
  const chat = status?.models.find((m) => m.id === status.chatModel);

  const live = deriveAIState({
    restart,
    downloadFailed: failed,
    downloadPaused: paused,
    downloading,
    stopped: !ollamaUp,
    needsSetup:
      !!status && provider === "builtin" && !!chat && !chat.downloaded,
    working: jobs.size > 0,
  });
  const state = useSettled(live, SETTLE_MS) as AIState;

  const entries = new Set(
    [...jobs.keys()].map((k) => k.slice(k.indexOf(":") + 1)).filter(Boolean),
  ).size;
  // Never "Working on 0" while the settle delay holds the old state (KAN-486).
  const lastCount = useRef(1);
  const count = entries || jobs.size || lastCount.current;
  lastCount.current = count;
  const gb = (n: number) => (n / 1024 ** 3).toFixed(1);
  const pct =
    progress?.total && progress.done !== undefined
      ? Math.min(100, Math.floor((progress.done / progress.total) * 100))
      : undefined;
  const dlSecond =
    progress?.total && progress.done !== undefined
      ? `${gb(progress.done)} of ${gb(progress.total)} GB · only downloads use the internet`
      : "Only downloads use the internet";
  // `lead` is what the live region announces: no counts or percentages, so a
  // working 3 -> 2 -> 1 or a download tick does not re-announce.
  const text: Record<
    AIState,
    { title: string; second: string; lead?: string }
  > = {
    ready: { title: "Local AI ready", second: "Everything runs on this PC" },
    working: {
      title: `Working on ${count} ${count === 1 ? "entry" : "entries"}`,
      lead: "Working on your entries",
      second: "Adding titles, mood and tags",
    },
    downloading: {
      title: "Downloading a model",
      second: dlSecond,
      lead: "Downloading a model",
    },
    starting: {
      title: "Starting Local AI…",
      second: "Search and Ask ready in a moment",
    },
    paused: {
      title: "Local AI paused",
      second: "Writing works. AI catches up when you resume.",
    },
    stopped: {
      title: "Local AI stopped",
      second: "You can keep writing. Nothing is lost.",
    },
    error: {
      title: "Local AI hit a problem",
      second:
        "Writing is safe. Ask and summaries are paused until the model is repaired.",
    },
    setup: {
      title: "Local AI not set up",
      second: "Writing works without it",
    },
  };
  // Engine detail is the engine's own message, never entry or chat text.
  const detail =
    state === "error" ? (failed ? progress?.error : restartDetails) : undefined;

  const act = useMemo(
    () => ({
      Resume: () => aiModelService.download(progress?.id ?? "", true),
      Restart: () => aiModelService.restart(),
      "Set up": async () => navigate("/setup"),
    }),
    [progress?.id, navigate],
  );
  const run = async (action: Action) => {
    setBusy(true);
    try {
      await act[action]();
    } finally {
      setBusy(false);
    }
  };

  const { icon: Icon, tone, action } = VIEW[state];
  // Resume needs to know which model; fall back to Set up if it is unknown.
  const shownAction = action === "Resume" && !progress?.id ? "Set up" : action;
  const hidden = compact && !NEEDS_ATTENTION.includes(state);

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {`${text[state].lead ?? text[state].title}. ${text[state].second}`}
      </div>
      {!hidden && (
        <div
          data-testid="ai-status-card"
          data-state={state}
          className={`rounded-lg border border-border-light bg-surface-light text-sm text-text-light dark:border-border-dark dark:bg-surface-dark dark:text-text-dark ${compact ? "flex size-9 items-center justify-center" : "flex flex-col gap-1 p-3"}`}
          title={compact ? text[state].title : undefined}
        >
          {compact ? (
            <button
              type="button"
              aria-label={`${text[state].title}. ${shownAction ?? ""}`}
              disabled={busy}
              onClick={() => shownAction && run(shownAction)}
              className={tone}
            >
              <Icon size={18} aria-hidden data-badge={state} />
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Icon
                  size={16}
                  aria-hidden
                  className={`${tone} shrink-0 ${state === "starting" ? "animate-spin" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => navigate("/settings/models")}
                  className="text-left font-medium hover:underline"
                >
                  {text[state].title}
                </button>
              </div>
              <p className="text-xs text-text-light-sub dark:text-text-dark-sub">
                {text[state].second}
              </p>
              {state === "downloading" && pct !== undefined && (
                <div className="flex items-center gap-2">
                  <div
                    role="progressbar"
                    aria-label="Model download"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                    className="h-1 flex-1 overflow-hidden rounded-full bg-border-light dark:bg-border-dark"
                  >
                    <div
                      className="h-full bg-info"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs">{pct}%</span>
                </div>
              )}
              {detail && (
                <p className="text-xs text-text-light-sub dark:text-text-dark-sub">
                  {detail}
                </p>
              )}
              {shownAction && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(shownAction)}
                  className="self-start rounded-md bg-dark1 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50 dark:bg-light1 dark:text-dark1"
                >
                  {shownAction}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
