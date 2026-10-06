import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { setupService, type SetupStatus } from "../api/setupService";
import { MindSageMark } from "./ui/MindSageMark";

const DISMISS_KEY = "ai_banner_dismissed";

/**
 * Non-blocking notice shown when the local AI engine is running but no writing
 * (generation) model is installed yet, so AI features would otherwise fail
 * silently. Journaling stays fully usable; this just offers to finish setup
 * with a machine-appropriate model recommendation.
 */
export default function AIReadinessBanner() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === "1",
  );

  useEffect(() => {
    if (dismissed) return;
    let cancelled = false;
    setupService.getStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [dismissed]);

  // Only nag when the engine is up but the writing model is missing. If Ollama
  // isn't installed at all, the first-run /setup gate already handled it.
  if (dismissed || !status?.ollamaRunning || status.generationReady)
    return null;

  const rec = status.recommended;

  return (
    <div className="flex items-center gap-3 border-b border-border-light bg-dark1/5 px-4 py-2 text-sm dark:border-border-dark dark:bg-light1/5">
      <MindSageMark
        size={16}
        className="shrink-0 text-dark1 dark:text-light1"
      />
      <span className="flex-1 text-text-light dark:text-text-dark">
        AI writing features need a model.{" "}
        {rec && (
          <span className="text-text-light-sub dark:text-text-dark-sub">
            Recommended for your machine: {rec.label} (~{rec.sizeGB} GB).
          </span>
        )}
      </span>
      <button
        onClick={() => navigate("/setup")}
        className="shrink-0 rounded-md bg-dark1 px-3 py-1 text-xs font-semibold text-white dark:bg-light1 dark:text-dark1"
      >
        Set up
      </button>
      <button
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
        aria-label="Dismiss"
        className="shrink-0 text-text-light-sub hover:text-text-light dark:text-text-dark-sub dark:hover:text-text-dark"
      >
        <X size={16} />
      </button>
    </div>
  );
}
