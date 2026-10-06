// Renderer wrapper for the first-run AI-stack setup flow. Mirrors the other
// src/api/*Service.tsx wrappers: it never touches Node directly, only the
// window.electron IPC bridge.

const hasElectron = () => !!window.electron?.ipcRenderer;

export interface SetupModel {
  name: string;
  size?: number;
}

export interface ModelRecommendation {
  model: string;
  label: string;
  sizeGB: number;
  systemRamGB: number;
  smallDefault: string;
  reason: string;
}

export interface SetupStatus {
  ollamaInstalled: boolean;
  ollamaRunning: boolean;
  embeddingReady: boolean;
  generationReady: boolean;
  models: SetupModel[];
  recommended: ModelRecommendation;
  platform: string;
}

export type SetupProgress =
  | {
      phase: "installing-ollama";
      step: string;
      percent?: number;
      error?: string;
    }
  | {
      phase: "pulling-model";
      model: string;
      status?: string;
      percent?: number;
      error?: string;
    };

export const setupService = {
  getStatus: async (): Promise<SetupStatus | null> => {
    if (!hasElectron()) return null;
    return window.electron.ipcRenderer.invoke("setup:get-status");
  },

  installOllama: async (): Promise<{
    success: boolean;
    guided?: boolean;
    reason?: string;
  }> => {
    if (!hasElectron()) return { success: false };
    return window.electron.ipcRenderer.invoke("setup:install-ollama");
  },

  startOllama: async (): Promise<{
    success: boolean;
    alreadyRunning?: boolean;
  }> => {
    if (!hasElectron()) return { success: false };
    return window.electron.ipcRenderer.invoke("setup:start-ollama");
  },

  ensureEmbeddingModel: async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (!hasElectron()) return { success: false };
    return window.electron.ipcRenderer.invoke("setup:ensure-embedding");
  },

  pullModel: async (
    modelName: string,
  ): Promise<{ success: boolean; error?: string }> => {
    if (!hasElectron()) return { success: false };
    return window.electron.ipcRenderer.invoke("setup:pull-model", modelName);
  },

  deleteModel: async (
    modelName: string,
  ): Promise<{ success: boolean; error?: string }> => {
    if (!hasElectron()) return { success: false };
    return window.electron.ipcRenderer.invoke("setup:delete-model", modelName);
  },

  recommendModel: async (): Promise<ModelRecommendation | null> => {
    if (!hasElectron()) return null;
    return window.electron.ipcRenderer.invoke("setup:recommend-model");
  },

  // Subscribe to streaming setup progress. Returns an unsubscribe fn.
  onProgress: (cb: (p: SetupProgress) => void): (() => void) => {
    if (!hasElectron()) return () => {};
    return window.electron.ipcRenderer.on(
      "setup:progress",
      (payload: SetupProgress) => cb(payload),
    );
  },
};

export const appPrefsService = {
  get: async (): Promise<{ launchAtStartup: boolean } | null> => {
    if (!hasElectron()) return null;
    return window.electron.ipcRenderer.invoke("settings:get-app");
  },
  setLaunchAtStartup: async (
    enabled: boolean,
  ): Promise<{ launchAtStartup: boolean }> => {
    if (!hasElectron()) return { launchAtStartup: enabled };
    return window.electron.ipcRenderer.invoke(
      "settings:set-launch-at-startup",
      enabled,
    );
  },
};
