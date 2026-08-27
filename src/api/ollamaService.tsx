import type { OllamaModel } from "../types/Ollama";

const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const ollamaService = {
  getModels: async (token: string): Promise<OllamaModel[]> => {
    checkElectron();
    const result = await window.electron.ipcRenderer.invoke<
      OllamaModel[] | { error: string }
    >("ollama:models", token);
    // The handler answers `{ error }` rather than throwing on a bad token.
    return Array.isArray(result) ? result : [];
  },

  /**
   * Resolves with the model's raw text, or `""` when the main process answers
   * with `{ error }` instead of a completion.
   */
  getResponse: async (
    token: string,
    model: string,
    prompt: string,
    jsonMode: boolean = false
  ): Promise<string> => {
    checkElectron();
    const result = await window.electron.ipcRenderer.invoke<
      string | { error: string }
    >("ollama:get-response", token, model, prompt, jsonMode);
    if (typeof result === "string") return result;
    console.error("[ollamaService] getResponse failed:", result?.error);
    return "";
  },
  downloadModel: async (
    token: string,
    modelName: string
  ) => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "ollama:download-model",
      token,
      modelName
    );
  },

  deleteModel: async (token: string, modelName: string) => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "ollama:delete-model",
      token,
      modelName
    );
  },
};
