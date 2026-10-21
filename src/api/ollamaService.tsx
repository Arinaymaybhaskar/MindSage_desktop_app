import type {
  OllamaListFailure,
  OllamaModel,
  OllamaModelsResult,
} from "../types/Ollama";

/** Ollama could not be asked for its models; the message says why. */
export class OllamaListError extends Error {
  readonly reason: OllamaListFailure;
  constructor(message: string, reason: OllamaListFailure) {
    super(message);
    this.name = "OllamaListError";
    this.reason = reason;
  }
}

const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const ollamaService = {
  /**
   * Rejects with the handler's message ("Ollama is not responding." and so on)
   * when Ollama could not be asked, so the screen can say why the list is
   * empty. Signed out, the handler answers `{ error }` with no `reason`, and
   * that still reads as an empty list.
   */
  getModels: async (): Promise<OllamaModel[]> => {
    checkElectron();
    const result =
      await window.electron.ipcRenderer.invoke<OllamaModelsResult>(
        "ollama:models",
      );
    if (Array.isArray(result)) return result;
    if (result?.reason) throw new OllamaListError(result.error, result.reason);
    return [];
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
