import type { DashboardData, DashboardStats } from "../types/Dashboard";
import type { DayScore } from "../utils/dashboardInsights";

const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const dashboardService = {
  getData: async (
    authMode: "online" | "offline",
    token: string
  ): Promise<DashboardData> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "dashboard:get-data",
      authMode,
      token
    );
  },
  getMonthlyScore: async (
    authMode: "online" | "offline",
    token: string
  ): Promise<DayScore[]> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "dashboard:get-monthly-scores",
      authMode,
      token
    );
  },
  getAllTimeScore: async (
    authMode: "online" | "offline",
    token: string
  ): Promise<DayScore[]> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "dashboard:get-all-time-scores",
      authMode,
      token
    );
  },
  getStats: async (
    authMode: "online" | "offline",
    token: string
  ): Promise<DashboardStats> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "dashboard:get-stats",
      authMode,
      token
    );
  },
};
