// whisperService.ts
// Frontend service layer to interact with Whisper transcription features

type TranscriptionResult = {
  text: string;
  segments?: Array<{ start: number; end: number; text: string }>;
};

const whisperService = {
  /**
   * Transcribe a full audio blob (file upload style).
   */
  async transcribeBlob(blob: Blob): Promise<TranscriptionResult> {
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return await window.electron.ipcRenderer.invoke(
      "whisper:transcribe-audio",
      buffer
    );
  },

  /**
   * Start live transcription (streaming).
   */
  async startLive(): Promise<void> {
    return window.electron.ipcRenderer.invoke(
      "whisper:start-live-transcription"
    );
  },

  /**
   * Stop live transcription.
   */
  async stopLive(): Promise<void> {
    return window.electron.ipcRenderer.invoke(
      "whisper:stop-live-transcription"
    );
  },

  /**
   * Subscribe to live transcription data updates.
   * Returns a cleanup function to unsubscribe.
   */
  onLiveData(callback: (data: TranscriptionResult) => void): () => void {
    // remove ANSI/control sequences and send only new text deltas to avoid duplicates
    const ansiRegex = /\x1b\[[0-9;?]*[A-Za-z]/g;
    let prevText = "";

    const listener = (payload: any) => {
      // payload may be a string or { text: string, ... }
      let raw = typeof payload === "string" ? payload : payload?.text ?? "";
      if (!raw) return;

      // strip ANSI/control codes and CRs, normalize whitespace
      let clean = raw.replace(ansiRegex, "").replace(/\r/g, "").trim();
      if (!clean) return;

      // if identical to previous, ignore
      if (clean === prevText) return;

      // if the new text is an extension of previous, send only the appended part
      let out = clean;
      if (clean.startsWith(prevText)) {
        out = clean.slice(prevText.length).trim();
      }
      prevText = clean;

      callback({ text: out, segments: payload?.segments });
    };

    window.electron.ipcRenderer.on("live-transcription-data", listener);

    // unsubscribe (preload currently exposes removeAllListeners)
    return () => {
      window.electron.ipcRenderer.removeAllListeners("live-transcription-data");
    };
  },
};

export default whisperService;
