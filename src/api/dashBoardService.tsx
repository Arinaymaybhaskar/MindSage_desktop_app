import type { DashboardData, DashboardStats } from "../types/Dashboard";
import type { DayScore } from "../utils/dashboardInsights";

const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const dashboardService = {
  getData: async (token: string): Promise<DashboardData> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "dashboard:get-data",
      token,
    );
  },
  getMonthlyScore: async (token: string): Promise<DayScore[]> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "dashboard:get-monthly-scores",
      token,
    );
  },
  getAllTimeScore: async (token: string): Promise<DayScore[]> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "dashboard:get-all-time-scores",
      token,
    );
  },
  getStats: async (token: string): Promise<DashboardStats> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "dashboard:get-stats",
      token,
    );
  },
};
