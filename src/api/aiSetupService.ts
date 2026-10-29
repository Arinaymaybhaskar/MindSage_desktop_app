// Renderer wrapper for local AI setup states. Setup runs in the main process in
// the background; none of these calls waits on it, and writing never depends
// on it. Download progress arrives on the existing ai:download-progress event.

export type AiSetupState =
  | { state: "idle" | "starting" | "ready" }
  | { state: "downloading"; modelId: string; label: string }
  | { state: "paused"; reason: "user" | "wifi"; modelId?: string }
  | { state: "failed"; error?: string; modelId?: string }
  | { state: "offline"; host: string; retryInMs: number; sizeBytes?: number }
  | { state: "work-network"; host: string; sizeBytes?: number }
  | { state: "low-disk"; needBytes: number; freeBytes: number }
  | { state: "low-memory"; warning: string; modelId: string }
  | { state: "metered"; sizeBytes: number };

const hasElectron = () => !!window.electron?.ipcRenderer;
const invoke = <T>(channel: string, ...args: unknown[]) =>
  window.electron.ipcRenderer.invoke<T>(channel, ...args);

export const aiSetupService = {
  getState: async (): Promise<AiSetupState | null> =>
    hasElectron() ? invoke<AiSetupState>("ai:setup-get-state") : null,

  /** Returns at once; `confirmed` accepts a low-memory warning or a metered link. */
  start: async (confirmed = false): Promise<AiSetupState | null> =>
    hasElectron()
      ? invoke<AiSetupState>("ai:setup-start", { confirmed })
      : null,

  pause: async (): Promise<AiSetupState | null> =>
    hasElectron() ? invoke<AiSetupState>("ai:setup-pause") : null,

  /** The metered question is asked once: wait for Wi-Fi, or download now. */
  answerMetered: async (waitForWifi: boolean): Promise<AiSetupState | null> =>
    hasElectron()
      ? invoke<AiSetupState>("ai:setup-answer-metered", waitForWifi)
      : null,

  /** Subscribes to state changes; the window's online event also retries an offline setup now. */
  onState: (cb: (s: AiSetupState) => void): (() => void) => {
    if (!hasElectron()) return () => {};
    const off = window.electron.ipcRenderer.on("ai:setup-state", (s) =>
      cb(s as AiSetupState),
    );
    const online = () => void invoke("ai:setup-online");
    window.addEventListener("online", online);
    return () => {
      off();
      window.removeEventListener("online", online);
    };
  },
};
