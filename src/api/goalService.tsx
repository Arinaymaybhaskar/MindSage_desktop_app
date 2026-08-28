import type { Goal, GoalDetail, SqliteRunResult } from "../types/Goals";

const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const goalService = {
  getActiveGoals: async (token: string): Promise<Goal[]> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "goal:get-active-goals",
      token,
    );
  },
  getCompletedGoals: async (token: string): Promise<Goal[]> => {
    checkElectron();

    return await window.electron.ipcRenderer.invoke(
      "goal:get-completed-goals",
      token,
    );
  },
  addGoal: async (
    token: string,
    goal: Partial<Goal>,
  ): Promise<SqliteRunResult> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke("goal:add", token, goal);
  },
  updateGoal: async (
    token: string,
    goalId: number,
    goal: Partial<Goal>,
  ): Promise<SqliteRunResult> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "goal:update",
      token,
      goalId,
      goal,
    );
  },
  deleteGoal: async (
    token: string,
    goalId: number,
  ): Promise<SqliteRunResult> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "goal:delete",
      token,
      goalId,
    );
  },
  togglePin: async (
    token: string,
    goalId: string,
  ): Promise<SqliteRunResult> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "goal:toggle-pin",
      token,
      goalId,
    );
  },
  completeGoal: async (
    token: string,
    goalId: number,
  ): Promise<SqliteRunResult> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "goal:complete",
      token,
      goalId,
    );
  },
  updateProgress: async (
    token: string,
    goalId: number,
    value: number,
  ): Promise<Goal> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "goal:update-progress",
      token,
      goalId,
      value,
    );
  },
  getPinned: async (token: string): Promise<Goal[]> => {
    checkElectron();

    return await window.electron.ipcRenderer.invoke("goal:get-pinned", token);
  },
  getGoalById: async (
    token: string,
    goalId: number,
  ): Promise<GoalDetail | null> => {
    checkElectron();

    return await window.electron.ipcRenderer.invoke(
      "goal:get-by-id",
      token,
      goalId,
    );
  },
};
