import { useEffect, useCallback } from "react";
import { useToast } from "./useToast";

interface AIStatusEvent {
  event: string;
  data: {
    entryId: number;
    error?: string;
  };
}

export function useAIStatus(
  entryId: number | undefined,
  onStatusChange: (status: {
    ai_metadata_status?: string;
    ai_summary_status?: string;
    ai_metadata_error?: string;
    ai_summary_error?: string;
  }) => void
) {
  const { showToast } = useToast();

  const handleAIStatusEvent = useCallback(
    (event: string, data: AIStatusEvent["data"]) => {
      if (!entryId || data.entryId !== entryId) return;

      switch (event) {
        case "journal:aiStarted":
          onStatusChange({ ai_metadata_status: "pending" });
          break;
        case "journal:aiCompleted":
          onStatusChange({ ai_metadata_status: "completed", ai_metadata_error: undefined });
          showToast("AI metadata generated successfully", "success");
          break;
        case "journal:aiFailed":
          onStatusChange({ ai_metadata_status: "failed", ai_metadata_error: data.error });
          showToast(`AI metadata generation failed: ${data.error}`, "danger");
          break;
        case "ollama:summary-started":
          onStatusChange({ ai_summary_status: "pending" });
          break;
        case "ollama:summary-generated":
          onStatusChange({ ai_summary_status: "completed", ai_summary_error: undefined });
          showToast("AI summary generated successfully", "success");
          break;
        case "ollama:summary-failed":
          onStatusChange({ ai_summary_status: "failed", ai_summary_error: data.error });
          showToast(`AI summary generation failed: ${data.error}`, "danger");
          break;
        case "ollama:summary-skipped":
          onStatusChange({ ai_summary_status: "skipped" });
          break;
      }
    },
    [entryId, onStatusChange, showToast]
  );

  useEffect(() => {
    if (!window.electron?.ipcRenderer) return;

    // The bridge delivers a single { event, data } payload, so unpack it rather
    // than expecting two positional args.
    const handleEvent = (payload: AIStatusEvent) => {
      handleAIStatusEvent(payload.event, payload.data);
    };

    const unsubscribe = window.electron.ipcRenderer.on(
      "ai-status-event",
      handleEvent
    );

    return unsubscribe;
  }, [handleAIStatusEvent]);
}