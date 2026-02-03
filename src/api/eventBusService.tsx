const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const eventBusService = {
  emit: async (event: string, ...args: any[]) => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "eventBus:emit",
      { event, args } // pass them clearly
    );
  },
};
