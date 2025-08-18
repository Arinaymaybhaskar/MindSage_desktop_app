const checkElectron = () => {
  if (!window.electron?.ipcRenderer) {
    throw new Error("Not in an Electron environment.");
  }
};

export const goalService = {
  getActiveGoals: async (authMode: "online" | "offline", token: string) => {
    checkElectron();
    console.log("calling active Goals");
    return await window.electron.ipcRenderer.invoke(
      "goal:get-active-goals",
      authMode,
      token
    );
  },
  getCompletedGoals: async (authMode: "online" | "offline", token: string) => {
    checkElectron();
    console.log("calling getCompleted Goals");

    return await window.electron.ipcRenderer.invoke(
      "goal:get-completed-goals",
      authMode,
      token
    );
  },
  addGoal: async (authMode: "online" | "offline", token: string, goal: any) => {
    checkElectron();
    console.log("goalService.addGoal", goal, authMode, token);
    return await window.electron.ipcRenderer.invoke(
      "goal:add",
      authMode,
      token,
      goal
    );
  },
  updateGoal: async (
    authMode: "online" | "offline",
    token: string,
    goalId: number,
    goal: any
  ) => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "goal:update",
      authMode,
      token,
      goalId,
      goal
    );
  },
  deleteGoal: async (
    authMode: "online" | "offline",
    token: string,
    goalId: number
  ) => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "goal:delete",
      authMode,
      token,
      goalId
    );
  },
  togglePin: async (
    authMode: "online" | "offline",
    token: string,
    goalId: string
  ) => {
    console.log(authMode, "authMode");
    console.log(token, "token");
    console.log(goalId, "goalId");

    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "goal:toggle-pin",
      authMode,
      token,
      goalId
    );
  },
  completeGoal: async (
    authMode: "online" | "offline",
    token: string,
    goalId: number
  ) => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "goal:complete",
      authMode,
      token,
      goalId
    );
  },
  updateProgress: async (
    authMode: "online" | "offline",
    token: string,
    goalId: number,
    value: number
  ) => {
    checkElectron();
    return await window.electron.ipcRenderer.invoke(
      "goal:update-progress",
      authMode,
      token,
      goalId,
      value
    );
  },
  getPinned: async (authMode: "online" | "offline", token: string) => {
    checkElectron();
    console.log("calling pinned Goals");
    return await window.electron.ipcRenderer.invoke(
      "goal:getPinned",
      authMode,
      token
    );
  },
};
