import { useState } from "react";
import ModelDialog from "./ModelDialog";
import type { ModelResult } from "../api/aiModelService";

// Sizes match electron/ai/models.js; ModelDialog then shows the exact figure and free disk.
const CHOICES = [
  { id: "whisper-base-en", label: "English", size: "148 MB" },
  { id: "whisper-small", label: "Hindi and other languages", size: "488 MB" },
];

/**
 * Offered the first time someone dictates: the voice model is not bundled.
 * Download goes through the shared model download manager (resumable, SHA-256
 * checked) via ModelDialog. Everything but dictation works without the model.
 */
export default function VoiceModelPrompt({ onClose }: { onClose: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<ModelResult | null>(null);

  if (picked) {
    return (
      <>
        {!result && (
          <ModelDialog
            modelId={picked}
            mode="download"
            onClose={() => setPicked(null)}
            onResult={setResult}
          />
        )}
        {result && <Outcome result={result} onRetry={() => setResult(null)} />}
        {result && (
          <button type="button" onClick={onClose}>
            {result.success ? "Done" : "Later"}
          </button>
        )}
      </>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="voice-model-title">
      <h2 id="voice-model-title">Download the voice model?</h2>
      <p>
        Dictation needs a speech model on this PC. It stays on your computer;
        your voice is never sent anywhere. Everything else in MindSage works
        without it.
      </p>
      {!navigator.onLine ? (
        <p role="alert">
          You are offline, so it cannot be downloaded now. Try dictation again
          when you are connected.
        </p>
      ) : (
        CHOICES.map((c) => (
          <button key={c.id} type="button" onClick={() => setPicked(c.id)}>
            {c.label} ({c.size})
          </button>
        ))
      )}
      <button type="button" onClick={onClose}>
        Later
      </button>
    </div>
  );
}

function Outcome({
  result,
  onRetry,
}: {
  result: ModelResult;
  onRetry: () => void;
}) {
  if (result.success) {
    return <p role="status">Voice model ready. Press the microphone again.</p>;
  }
  const checksum = /checksum/i.test(result.error ?? "");
  const text = result.cancelled
    ? "Download cancelled. What was fetched is kept, so it resumes next time."
    : checksum
      ? "The download did not pass its safety check, so it was deleted. Try again."
      : result.notEnoughSpace
        ? (result.error ?? "Not enough disk space.")
        : "The download could not finish. Check your connection and try again.";
  return (
    <>
      <p role="alert">{text}</p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </>
  );
}
