import type { OllamaModel } from "../types/Ollama";

const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const ollamaService = {
  getModels: async (): Promise<OllamaModel[]> => {
    checkElectron();
    const result = await window.electron.ipcRenderer.invoke<
      OllamaModel[] | { error: string }
    >("ollama:models");
    // The handler answers `{ error }` rather than throwing when signed out.
    return Array.isArray(result) ? result : [];
  },

  /**
   * Resolves with the model's raw text, or `""` when the main process answers
   * with `{ error }` instead of a completion.
   */
  getResponse: async (
    model: string,
    prompt: string,
    jsonMode: boolean = false,
  ): Promise<string> => {
    checkElectron();
    const result = await window.electron.ipcRenderer.invoke<
      string | { error: string }
    >("ollama:get-response", model, prompt, jsonMode);
    if (typeof result === "string") return result;
    console.error("[ollamaService] getResponse failed:", result?.error);
    return "";
  },
  downloadModel: async (modelName: string) => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "ollama:download-model",
      modelName,
    );
  },

  deleteModel: async (modelName: string) => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "ollama:delete-model",
      modelName,
    );
  },
};
