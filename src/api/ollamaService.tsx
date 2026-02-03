const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const ollamaService = {
  getModels: async (token: string) => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke("ollama:models", token);
  },

  getResponse: async (
    token: string,
    model: string,
    prompt: string,
    jsonMode: boolean = false
  ) => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "ollama:get-response",
      token,
      model,
      prompt,
      jsonMode
    );
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
