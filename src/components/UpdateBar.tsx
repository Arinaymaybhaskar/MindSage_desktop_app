import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { updateService, type UpdateState } from "../api/updateService";
import { prepareToRestart } from "../utils/unsavedWork";
import { MindSageMark } from "./ui/MindSageMark";

const versionLabel = (version?: string) => (version ? ` ${version}` : "");

/**
 * A quiet bar for an update the user asked for (automatic checks are opt-in,
 * and "Check now" is the other way in). It shows the download, then offers
 * "Restart to update". It never restarts on its own: the click saves drafts
 * first and refuses while an entry is mid-edit.
 */
export default function UpdateBar() {
  const [state, setState] = useState<UpdateState>({ phase: "idle" });
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Events that fired before this mounted are not replayed; ask where
    // things stand, then follow the events. A newer event wins.
    let sawEvent = false;
    const unsubscribe = updateService.subscribe((next) => {
      sawEvent = true;
      setState(next);
      setNotice(null);
    });
    updateService.getState().then((s) => {
      if (!cancelled && !sawEvent) setState(s);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const key = `${state.phase}:${"version" in state ? state.version : ""}`;
  if (state.phase === "idle") return null;
  if (dismissedFor === key) return null;

  const restart = async () => {
    const check = prepareToRestart();
    if (!check.ok) {
      setNotice(check.reason);
      return;
    }
    setRestarting(true);
    setNotice(null);
    const res = await updateService.install();
    if (!res.success) {
      setRestarting(false);
      setNotice(res.error ?? "The update could not be started.");
    }
  };

  let text: string;
  if (state.phase === "ready") {
    text = `MindSage${versionLabel(state.version)} is ready to install.`;
  } else if (state.phase === "error") {
    text = state.message;
  } else if (state.phase === "downloading") {
    text = `Downloading${versionLabel(state.version)} (${state.percent}%)`;
  } else {
    text = `Downloading${versionLabel(state.version)}…`;
  }

  return (
    <div
      role="status"
      className="flex items-center gap-3 border-b border-border-light bg-dark1/5 px-4 py-2 text-sm dark:border-border-dark dark:bg-light1/5"
    >
      <MindSageMark
        size={16}
        className="shrink-0 text-dark1 dark:text-light1"
      />
      <span className="flex-1 text-text-light dark:text-text-dark">
        {text}
        {notice && (
          <span
            className="ml-2 text-text-light-sub dark:text-text-dark-sub"
            data-testid="update-notice"
          >
            {notice}
          </span>
        )}
      </span>
      {state.phase === "downloading" && (
        <progress
          value={state.percent}
          max={100}
          aria-label="Update download progress"
          className="h-1.5 w-32 shrink-0"
        />
      )}
      {state.phase === "ready" && (
        <button
          onClick={restart}
          disabled={restarting}
          className="shrink-0 rounded-md bg-dark1 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60 dark:bg-light1 dark:text-dark1"
        >
          {restarting ? "Restarting…" : "Restart to update"}
        </button>
      )}
      {(state.phase === "ready" || state.phase === "error") && (
        <button
          onClick={() => setDismissedFor(key)}
          aria-label="Dismiss"
          className="shrink-0 text-text-light-sub hover:text-text-light dark:text-text-dark-sub dark:hover:text-text-dark"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
