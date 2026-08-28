import type { ProgressLog } from "../types/Goals";

const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const progressLogsService = {
  getProgressLogs: async (
    authMode: string,
    token: string,
    goalId: number,
  ): Promise<ProgressLog[]> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "logs:get-all",
      authMode,
      token,
      goalId,
    );
  },
  addProgress: async (
    authMode: string,
    token: string,
    goalId: number,
    value: number,
    description: string,
  ): Promise<ProgressLog> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "logs:add",
      authMode,
      token,
      goalId,
      value,
      description,
    );
  },
};
