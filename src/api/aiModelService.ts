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
    /** null on small PCs until the feelings classifier exists (KAN-388). */
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
}

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

export const aiModelService = {
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
};
