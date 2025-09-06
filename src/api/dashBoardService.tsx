const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const dashboardService = {
  getData: async (authMode: "online" | "offline", token: string) => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "dashboard:get-data",
      authMode,
      token
    );
  },
  getMonthlyScore: async (authMode: "online" | "offline", token: string) => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "dashboard:get-monthly-scores",
      authMode,
      token
    );
  },
  getAllTimeScore: async (authMode: "online" | "offline", token: string) => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "dashboard:get-all-time-scores",
      authMode,
      token
    );
  },
};
