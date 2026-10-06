import type { ProgressLog } from "../types/Goals";

const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const progressLogsService = {
  getProgressLogs: async (goalId: number): Promise<ProgressLog[]> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke("logs:get-all", goalId);
  },
  addProgress: async (
    goalId: number,
    value: number,
    description: string,
  ): Promise<ProgressLog> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "logs:add",
      goalId,
      value,
      description,
    );
  },
};
