import { useCallback, useEffect, useState } from "react";
import {
  aiModelService,
  type ModelDialogInfo,
  type ModelResult,
} from "../api/aiModelService";

const POLL_MS = 3000;

interface Props {
  modelId: string;
  mode: "download" | "delete";
  onClose: () => void;
  /** Download: called when it ends (it runs after the dialog closes). Delete: when it is done. */
  onResult: (result: ModelResult) => void;
  /** Called when Download is pressed, just before onClose. */
  onStart?: () => void;
}

/**
 * Confirm a model download (size, free disk, memory warning) or a delete (what
 * stops working if the model is in use). Free space is re-read while open, so
 * freeing disk enables the button without reopening. Look is a separate ticket.
 * Not done: a metered-connection warning, Electron has no cheap way to detect one.
 */
export default function ModelDialog({
  modelId,
  mode,
  onClose,
  onResult,
  onStart,
}: Props) {
  const [info, setInfo] = useState<ModelDialogInfo | null>(null);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(
    () =>
      aiModelService
        .dialogInfo(modelId)
        .then((next) => next && !next.error && setInfo(next))
        .catch(() => setError("Could not read the model details.")),
    [modelId],
  );

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const download = () => {
    // The download runs for minutes: close now, report when it ends.
    void aiModelService.download(modelId, true).then(onResult);
    onStart?.();
    onClose();
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    setLocked(false);
    const result = await aiModelService.remove(modelId, true);
    setBusy(false);
    if (result.success) return onResult(result);
    setLocked(Boolean(result.retryLater));
    setError(result.error ?? "Could not delete the model.");
  };

  if (!info) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Model">
        {error || "Loading..."}
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  const impact = info.impact;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="model-dialog-title">
      {mode === "download" ? (
        <>
          <h2 id="model-dialog-title">Download {info.label}?</h2>
          <p>
            This downloads {info.needSize}
            {info.needSize !== info.size ? ` (of ${info.size})` : ""}.
            {info.freeSize ? ` Free space on this disk: ${info.freeSize}.` : ""}
          </p>
          {info.memoryWarning && <p role="alert">{info.memoryWarning}</p>}
          {!info.enoughSpace && (
            <p role="alert">
              Not enough disk space. Free {info.shortSize} more to download.
            </p>
          )}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" disabled={!info.enoughSpace} onClick={download}>
            Download
          </button>
        </>
      ) : (
        <>
          <h2 id="model-dialog-title">Delete {info.label}?</h2>
          <p>This frees {info.size}. You can download it again later.</p>
          {impact.inUse && <p role="alert">{impact.warning}</p>}
          {error && (
            <p role="alert">{locked ? `${error} Try again later.` : error}</p>
          )}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => void remove()}>
            {locked ? "Retry" : "Delete"}
          </button>
        </>
      )}
    </div>
  );
}
