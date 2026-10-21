import localDB from "../db/index.js";
import { eventBus } from "../eventBus.js";
import { currentUserId } from "../session.js";
import { log } from "../log.js";

export const handleGetActiveGoals = async (event) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }

  return localDB.getActiveGoals(userId);
};

export const handleGetCompletedGoals = async (event) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  return localDB.getCompletedGoals(userId);
};

export const handleCreateGoal = async (event, goal) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  const goalCreated = await localDB.AddGoal(userId, goal);
  log.info(goalCreated, "goal created");
  if (goalCreated.changes == 1) {
    // The indexer embeds it in the background.
    eventBus.emit("goal:created", {
      entry: { ...goal, id: Number(goalCreated.lastInsertRowid) },
    });
  }
  return goalCreated;
};

export const handleUpdateGoal = async (event, goalId, goalData) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  const updatedGoal = await localDB.updateGoal(userId, goalId, goalData);
  if (updatedGoal) {
    eventBus.emit("goal:updated", { entry: { ...goalData, id: goalId } });
  }
  return updatedGoal;
};

export const handleDeleteGoal = async (event, goalId) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  return localDB.deleteGoal(userId, goalId);
};

export const handleTogglePin = async (event, goalId) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  return localDB.togglePinGoal(userId, goalId);
};

export const handleCompleteGoal = async (event, goalId) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  return localDB.completeGoal(userId, goalId);
};

export const handleUpdateProgress = async (event, goalId, value) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  return localDB.updateProgress(userId, goalId, value);
};

export const handleGetPinnedGoals = (event) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  return localDB.getPinnedGoals(userId);
};

export const handleGetGoalById = (event, goalId) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  return localDB.getGoalById(goalId, userId);
};
