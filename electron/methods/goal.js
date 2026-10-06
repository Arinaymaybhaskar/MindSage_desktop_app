import localDB from "../db/index.js";
import { eventBus } from "../eventBus.js";
import { currentUserId } from "../session.js";

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
  console.log(goalCreated, "goal created");
  if (goalCreated.changes == 1) {
    // Trigger Qdrant sync
    eventBus.emit("goal:created", { entry: goal });
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
    eventBus.emit("goal:updated", { entry: goalData });
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

// Manual sync functions
export function syncGoalToQdrant(goalId) {
  if (qdrantWorker) {
    qdrantWorker.postMessage({
      type: "goal:sync-requested",
      data: { goalId },
    });
  }
}

export function syncProgressLogToQdrant(progressLogId) {
  if (qdrantWorker) {
    qdrantWorker.postMessage({
      type: "progress_log:sync-requested",
      data: { progressLogId },
    });
  }
}

// Bulk sync functions
export function bulkSyncGoalsToQdrant() {
  if (qdrantWorker) {
    qdrantWorker.postMessage({
      type: "goal:bulk-sync-requested",
      data: {},
    });
  }
}

export function bulkSyncProgressLogsToQdrant() {
  if (qdrantWorker) {
    qdrantWorker.postMessage({
      type: "progress_log:bulk-sync-requested",
      data: {},
    });
  }
}
