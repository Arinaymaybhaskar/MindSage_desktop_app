import type { Goal, GoalDetail, SqliteRunResult } from "../types/Goals";

const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const goalService = {
  getActiveGoals: async (): Promise<Goal[]> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke("goal:get-active-goals");
  },
  getCompletedGoals: async (): Promise<Goal[]> => {
    checkElectron();

    return await window.electron.ipcRenderer.invoke("goal:get-completed-goals");
  },
  addGoal: async (goal: Partial<Goal>): Promise<SqliteRunResult> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke("goal:add", goal);
  },
  updateGoal: async (
    goalId: number,
    goal: Partial<Goal>,
  ): Promise<SqliteRunResult> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "goal:update",
      goalId,
      goal,
    );
  },
  deleteGoal: async (goalId: number): Promise<SqliteRunResult> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke("goal:delete", goalId);
  },
  togglePin: async (goalId: string): Promise<SqliteRunResult> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke("goal:toggle-pin", goalId);
  },
  completeGoal: async (goalId: number): Promise<SqliteRunResult> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke("goal:complete", goalId);
  },
  updateProgress: async (goalId: number, value: number): Promise<Goal> => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "goal:update-progress",
      goalId,
      value,
    );
  },
  getPinned: async (): Promise<Goal[]> => {
    checkElectron();

    return await window.electron.ipcRenderer.invoke("goal:get-pinned");
  },
  getGoalById: async (goalId: number): Promise<GoalDetail | null> => {
    checkElectron();

    return await window.electron.ipcRenderer.invoke("goal:get-by-id", goalId);
  },
};
