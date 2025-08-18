const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const qdrantService = {
  start: async () => {
    checkElectron();
  },
};
