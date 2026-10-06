import type { DashboardData, DashboardStats } from "../types/Dashboard";
import type { DayScore } from "../utils/dashboardInsights";

const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const dashboardService = {
  getData: async (): Promise<DashboardData> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke("dashboard:get-data");
  },
  getMonthlyScore: async (): Promise<DayScore[]> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "dashboard:get-monthly-scores",
    );
  },
  getAllTimeScore: async (): Promise<DayScore[]> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "dashboard:get-all-time-scores",
    );
  },
  getStats: async (): Promise<DashboardStats> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke("dashboard:get-stats");
  },
};
