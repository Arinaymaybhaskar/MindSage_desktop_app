import type { ProgressLog } from "../types/Goals";

const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const progressLogsService = {
  getProgressLogs: async (
    token: string,
    goalId: number,
  ): Promise<ProgressLog[]> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "logs:get-all",
      token,
      goalId,
    );
  },
  addProgress: async (
    token: string,
    goalId: number,
    value: number,
    description: string,
  ): Promise<ProgressLog> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "logs:add",
      token,
      goalId,
      value,
      description,
    );
  },
};
