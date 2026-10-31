// Renderer wrapper for the built-in model picker: recommendation, size,
// memory and speed bars, speed probe, select, download and delete. Only the
// window.electron IPC bridge, never Node.

export interface ModelBar {
  id: string;
  label: string;
  bytes: number;
  sizeShare: number;
  memoryBytes: number;
  memoryShare: number;
  /** null when the speed probe failed or has not run: hide the speed bar. */
  tokensPerSecond: number | null;
  speedShare: number | null;
  /** false when scaled from the model the probe ran on. */
  speedMeasured: boolean;
  downloaded: boolean;
  fits: boolean;
  /** Shown before download when the model will not run on this PC. */
  warning: string | null;
  /** Only offered when the user asks; never the default. */
  onRequest: boolean;
  recommendedFor: ("chat" | "metadata" | "summary")[];
}

export interface ModelPicker {
  totalMemBytes: number;
  recommendation: {
    chat: string;
    /** null on small PCs: feelings come from the classifier there (KAN-388). */
    metadata: string | null;
    summary: string;
    feelings: "classifier" | "chat-model";
  };
  selected: string;
  probed: boolean;
  models: ModelBar[];
}

export interface ModelResult {
  success?: boolean;
  error?: string;
  /** The download needs the user's OK first; `error` is the warning text. */
  needsConfirm?: boolean;
  cancelled?: boolean;
  /** Chat model after a delete: another downloaded one, or null when chat is off. */
  chatModel?: string | null;
  /** Download: the disk is too small. Delete: the file is locked, try later. */
  notEnoughSpace?: boolean;
  retryLater?: boolean;
  /** CUDA engine: the running engine switches to it on the next launch. */
  restartRequired?: boolean;
}

/** The one-time offer of the CUDA engine on a PC with a usable Nvidia GPU. */
export type CudaOffer =
  { offer: false } | { offer: true; id: string; label: string; bytes: number };

/** What the download and delete dialogs show; sizes are preformatted "2.0 GB". */
export interface ModelDialogInfo {
  id: string;
  label: string;
  size: string;
  downloaded: boolean;
  /** What is still to fetch (less than `size` when a cut download resumes). */
  needSize: string;
  freeSize: string | null;
  /** Null when the model fits; else how much must be freed. */
  shortSize: string | null;
  enoughSpace: boolean;
  /** Set when the model will not run well on this PC. */
  memoryWarning: string | null;
  impact:
    | { inUse: false }
    | { inUse: true; alternative: string | null; warning: string };
  error?: string;
}

const hasElectron = () => !!window.electron?.ipcRenderer;
const invoke = <T>(channel: string, ...args: unknown[]) =>
  window.electron.ipcRenderer.invoke<T>(channel, ...args);

export interface RestartStatus {
  state: "starting" | "ready" | "error";
  provider: "builtin" | "ollama" | null;
  /** false for Ollama: the app does not own that process, so nothing was restarted. */
  managed: boolean;
  /** Why it failed, or the note for an unmanaged Ollama. Never entry or chat text. */
  details?: string;
}

export const aiModelService = {
  /** Debounced: a call while a restart runs returns the current status. */
  restart: async (): Promise<RestartStatus | null> =>
    hasElectron() ? invoke<RestartStatus>("ai:restart") : null,

  getPicker: async (): Promise<ModelPicker | null> =>
    hasElectron() ? invoke<ModelPicker>("ai:get-model-picker") : null,

  /** Runs the 5-second speed test; resolves with the picker, bars hidden if it failed. */
  probeSpeed: async (): Promise<ModelPicker | null> =>
    hasElectron() ? invoke<ModelPicker>("ai:probe-speed") : null,

  select: async (id: string): Promise<ModelResult> =>
    hasElectron()
      ? invoke<ModelResult>("ai:select-model", id)
      : { error: "Not available" },

  /** Pass `confirmed` after showing the `needsConfirm` warning. */
  download: async (id: string, confirmed = false): Promise<ModelResult> =>
    hasElectron()
      ? invoke<ModelResult>("ai:download-model", id, confirmed)
      : { error: "Not available" },

  /** Read fresh each call: the dialog polls it, since disk space can change. */
  dialogInfo: async (id: string): Promise<ModelDialogInfo | null> =>
    hasElectron() ? invoke<ModelDialogInfo>("ai:get-model-dialog", id) : null,

  /** Pass `confirmed` after showing the `needsConfirm` warning (a model in use). */
  remove: async (id: string, confirmed = false): Promise<ModelResult> =>
    hasElectron()
      ? invoke<ModelResult>("ai:delete-model", id, confirmed)
      : { error: "Not available" },

  cudaOffer: async (): Promise<CudaOffer> =>
    hasElectron() ? invoke<CudaOffer>("ai:cuda-offer-get") : { offer: false },

  /** Recorded once either way; accepting does not start the download. */
  answerCudaOffer: async (accept: boolean): Promise<void> => {
    if (hasElectron()) await invoke("ai:cuda-offer-answer", accept);
  },
};

/** One `ai:download-progress` message. */
export interface DownloadProgress {
  id: string;
  done?: number;
  total?: number;
  /** Hashing a file already on disk, not downloading. */
  checking?: boolean;
  finished?: boolean;
  paused?: boolean;
  error?: string;
  cancelled?: boolean;
}

/** What `ai:get-status` returns (the part the status card reads). */
export interface AIStatus {
  provider: "builtin" | "ollama";
  chatModel: string;
  models: { id: string; label: string; role: string; downloaded: boolean }[];
  downloading: { id: string; done: number; total: number } | null;
  restart: RestartStatus;
}

const subscribe = <T extends unknown[]>(
  channel: string,
  cb: (...args: T) => void,
): (() => void) =>
  hasElectron()
    ? window.electron.ipcRenderer.on<T>(channel, cb)
    : () => undefined;

export const aiStatusService = {
  get: async (): Promise<AIStatus | null> =>
    hasElectron() ? invoke<AIStatus>("ai:get-status") : null,

  onDownloadProgress: (cb: (p: DownloadProgress) => void) =>
    subscribe<[DownloadProgress]>("ai:download-progress", cb),

  onRestartStatus: (cb: (s: RestartStatus) => void) =>
    subscribe<[RestartStatus]>("ai:restart-status", cb),

  /** Entry jobs (title, summary, index) start and stop on this channel. */
  onJobEvent: (cb: (p: { event: string }) => void) =>
    subscribe<[{ event: string }]>("ai-status-event", cb),
};
