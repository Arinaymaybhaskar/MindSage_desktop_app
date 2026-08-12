import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Loader2,
  Download,
  AlertCircle,
  Sparkles,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import {
  setupService,
  appPrefsService,
  type SetupStatus,
  type SetupProgress,
} from "../api/setupService";

export const SETUP_COMPLETE_KEY = "setup_complete";

type StepState = "pending" | "active" | "done" | "error";

function StepRow({
  state,
  title,
  detail,
  children,
}: {
  state: StepState;
  title: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  const Icon =
    state === "done"
      ? CheckCircle2
      : state === "active"
        ? Loader2
        : state === "error"
          ? AlertCircle
          : null;

  return (
    <div className="flex gap-3 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-4">
      <div className="mt-0.5 shrink-0">
        {Icon ? (
          <Icon
            size={20}
            className={
              state === "done"
                ? "text-success"
                : state === "error"
                  ? "text-danger"
                  : "animate-spin text-dark1 dark:text-light1"
            }
          />
        ) : (
          <div className="h-5 w-5 rounded-full border-2 border-border-light dark:border-border-dark" />
        )}
      </div>
      <div className="flex-1">
        <p className="font-semibold text-text-light dark:text-text-dark">
          {title}
        </p>
        {detail && (
          <p className="mt-0.5 text-sm text-text-light-sub dark:text-text-dark-sub">
            {detail}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-tertiary-light dark:bg-tertiary-dark">
      <div
        className="h-full rounded-full bg-dark1 dark:bg-light1 transition-[width] duration-300"
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [pulling, setPulling] = useState<string | null>(null);
  const [progress, setProgress] = useState<SetupProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    const s = await setupService.getStatus();
    setStatus(s);
    setLoading(false);
    return s;
  }, []);

  useEffect(() => {
    refresh();
    unsubRef.current = setupService.onProgress((p) => setProgress(p));
    return () => unsubRef.current?.();
  }, [refresh]);

  const finish = useCallback(() => {
    localStorage.setItem(SETUP_COMPLETE_KEY, "1");
    navigate("/", { replace: true });
  }, [navigate]);

  const handleInstallOllama = useCallback(async () => {
    setError(null);
    setInstalling(true);
    try {
      const res = await setupService.installOllama();
      if (!res.success && !res.guided) {
        setError(
          res.reason || "Installation failed. Please install Ollama manually.",
        );
      }
      await refresh();
    } finally {
      setInstalling(false);
    }
  }, [refresh]);

  const handleStartOllama = useCallback(async () => {
    setError(null);
    await setupService.startOllama();
    await refresh();
  }, [refresh]);

  const handleEnsureEmbedding = useCallback(async () => {
    setError(null);
    setPulling("nomic-embed-text:v1.5");
    try {
      const res = await setupService.ensureEmbeddingModel();
      if (!res.success)
        setError(res.error || "Failed to download the embedding model.");
      await refresh();
    } finally {
      setPulling(null);
    }
  }, [refresh]);

  const handlePullGeneration = useCallback(
    async (modelName: string) => {
      setError(null);
      setPulling(modelName);
      try {
        const res = await setupService.pullModel(modelName);
        if (res.success) {
          // Make the freshly-pulled model the active chat model.
          const existing =
            (await window.electron?.ipcRenderer.invoke(
              "models:get-selected",
            )) || {};
          await window.electron?.ipcRenderer.invoke("models:save-selected", {
            ...existing,
            chat: modelName,
          });
        } else {
          setError(res.error || "Failed to download the model.");
        }
        await refresh();
      } finally {
        setPulling(null);
      }
    },
    [refresh],
  );

  // Opt-in: offer to launch MindSage at startup (default off).
  const [launchAtStartup, setLaunchAtStartup] = useState(false);
  useEffect(() => {
    appPrefsService
      .get()
      .then((p) => p && setLaunchAtStartup(p.launchAtStartup));
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-base-light dark:bg-base-dark">
        <Loader2
          size={28}
          className="animate-spin text-dark1 dark:text-light1"
        />
      </div>
    );
  }

  const ollamaState: StepState = !status?.ollamaInstalled
    ? installing
      ? "active"
      : "error"
    : status.ollamaRunning
      ? "done"
      : "active";

  const embeddingState: StepState = !status?.ollamaRunning
    ? "pending"
    : status.embeddingReady
      ? "done"
      : pulling === "nomic-embed-text:v1.5"
        ? "active"
        : "error";

  const rec = status?.recommended;
  const pullPercent =
    progress?.phase === "pulling-model" && progress.model === pulling
      ? (progress.percent ?? 0)
      : progress?.phase === "installing-ollama"
        ? (progress.percent ?? 0)
        : 0;

  return (
    <div className="h-full overflow-y-auto bg-base-light dark:bg-base-dark">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-dark1/10 dark:bg-light1/10">
            <Sparkles size={28} className="text-dark1 dark:text-light1" />
          </div>
          <h1 className="font-[fraunces] text-3xl font-extrabold text-text-light dark:text-text-dark">
            Set up MindSage AI
          </h1>
          <div className="mx-auto mt-2 max-w-md text-sm text-text-light-sub dark:text-text-dark-sub">
            <p className="mx-auto mt-2 max-w-md text-text-light-sub dark:text-text-dark-sub">
              MindSage runs AI privately on your machine. This one-time setup
              gets the local engine ready. You can skip and do it later.
            </p>
            <p>Journaling works without it.</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <div className="space-y-3">
          {/* Step 1: Ollama */}
          <StepRow
            state={ollamaState}
            title="Local AI engine (Ollama)"
            detail={
              status?.ollamaRunning
                ? "Installed and running."
                : status?.ollamaInstalled
                  ? "Installed but not running."
                  : "Not detected on this machine."
            }
          >
            {progress?.phase === "installing-ollama" && installing && (
              <>
                <p className="mt-2 text-xs text-text-light-sub dark:text-text-dark-sub">
                  {progress.step === "downloading"
                    ? "Downloading installer…"
                    : progress.step === "running-installer"
                      ? "Running installer…"
                      : progress.step === "starting-service"
                        ? "Starting service…"
                        : "Working…"}
                </p>
                <ProgressBar percent={pullPercent} />
              </>
            )}
            {!status?.ollamaInstalled && !installing && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={handleInstallOllama}
                  className="inline-flex items-center gap-2 rounded-lg bg-dark1 px-4 py-2 text-sm font-semibold text-white dark:bg-light1 dark:text-dark1"
                >
                  <Download size={15} /> Install automatically
                </button>
                <button
                  onClick={() => navigate("/ollama-tutorial")}
                  className="rounded-lg border border-border-light px-4 py-2 text-sm font-semibold text-text-light-sub dark:border-border-dark dark:text-text-dark-sub"
                >
                  Install manually
                </button>
              </div>
            )}
            {status?.ollamaInstalled && !status?.ollamaRunning && (
              <button
                onClick={handleStartOllama}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-dark1 px-4 py-2 text-sm font-semibold text-white dark:bg-light1 dark:text-dark1"
              >
                <RefreshCw size={15} /> Start engine
              </button>
            )}
          </StepRow>

          {/* Step 2: Embedding model (required) */}
          <StepRow
            state={embeddingState}
            title="Search model (required)"
            detail="A small model that powers private search across your journal (~275 MB)."
          >
            {pulling === "nomic-embed-text:v1.5" && (
              <>
                <p className="mt-2 text-xs text-text-light-sub dark:text-text-dark-sub">
                  {progress?.phase === "pulling-model"
                    ? progress.status
                    : "Downloading…"}
                </p>
                <ProgressBar percent={pullPercent} />
              </>
            )}
            {status?.ollamaRunning &&
              !status.embeddingReady &&
              pulling !== "nomic-embed-text:v1.5" && (
                <button
                  onClick={handleEnsureEmbedding}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-dark1 px-4 py-2 text-sm font-semibold text-white dark:bg-light1 dark:text-dark1"
                >
                  <Download size={15} /> Download search model
                </button>
              )}
          </StepRow>

          {/* Step 3: Generation model (optional, spec-aware) */}
          <StepRow
            state={status?.generationReady ? "done" : "pending"}
            title="Writing model (optional)"
            detail={
              status?.generationReady
                ? "A generation model is installed."
                : rec
                  ? `Powers titles, summaries and chat. Recommended for your machine: ${rec.label} (~${rec.sizeGB} GB). Every machine differs — you can change this anytime.`
                  : "Powers titles, summaries and chat."
            }
          >
            {!status?.generationReady && status?.ollamaRunning && rec && (
              <>
                {pulling && pulling !== "nomic-embed-text:v1.5" && (
                  <>
                    <p className="mt-2 text-xs text-text-light-sub dark:text-text-dark-sub">
                      Downloading {pulling}…{" "}
                      {progress?.phase === "pulling-model"
                        ? progress.status
                        : ""}
                    </p>
                    <ProgressBar percent={pullPercent} />
                  </>
                )}
                {!pulling && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => handlePullGeneration(rec.model)}
                      className="inline-flex items-center gap-2 rounded-lg bg-dark1 px-4 py-2 text-sm font-semibold text-white dark:bg-light1 dark:text-dark1"
                    >
                      <Download size={15} /> Download {rec.label} (~{rec.sizeGB}{" "}
                      GB)
                    </button>
                    {rec.model !== rec.smallDefault && (
                      <button
                        onClick={() => handlePullGeneration(rec.smallDefault)}
                        className="rounded-lg border border-border-light px-4 py-2 text-sm font-semibold text-text-light-sub dark:border-border-dark dark:text-text-dark-sub"
                      >
                        Small model instead (deletable later)
                      </button>
                    )}
                  </div>
                )}
                <p className="mt-2 text-xs text-text-light-sub dark:text-text-dark-sub">
                  Prefer to decide later? Skip this — MindSage will suggest a
                  compatible model the first time you use an AI feature.
                </p>
              </>
            )}
          </StepRow>
        </div>

        {/* Launch-at-startup opt-in */}
        <label className="mt-6 flex cursor-pointer items-center gap-3 rounded-xl border border-border-light dark:border-border-dark p-4">
          <input
            type="checkbox"
            checked={launchAtStartup}
            onChange={async (e) => {
              setLaunchAtStartup(e.target.checked);
              await appPrefsService.setLaunchAtStartup(e.target.checked);
            }}
            className="h-4 w-4 accent-[color:var(--dark1)]"
          />
          <span className="text-sm text-text-light dark:text-text-dark">
            Launch MindSage when I sign in to Windows
          </span>
        </label>

        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={finish}
            className="text-sm font-semibold text-text-light-sub hover:text-text-light dark:text-text-dark-sub dark:hover:text-text-dark"
          >
            Skip for now
          </button>
          <button
            onClick={finish}
            className="inline-flex items-center gap-2 rounded-lg bg-dark1 px-6 py-2.5 font-semibold text-white dark:bg-light1 dark:text-dark1"
          >
            {status?.embeddingReady ? "Finish" : "Continue"}{" "}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
