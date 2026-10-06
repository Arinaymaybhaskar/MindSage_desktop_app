import localDB from "../db/index.js";
import { eventBus } from "../eventBus.js";
import { db } from "../db/connection.js";
import { currentUserId } from "../session.js";

export const handleGetProgressLogs = async (event, goalId) => {
  const userId = currentUserId();

  if (!userId) {
    return { error: "Not signed in" };
  }

  return localDB.getProgressLogs(goalId);
};

export const handleAddProgressLog = async (
  event,
  goalId,
  value,
  description,
) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }

  const addedLog = localDB.logProgress(goalId, value, description);
  if (addedLog) {
    // Emit event - worker will automatically pick this up
    eventBus.emit("progress_log:created", { entry: addedLog });

    // Also emit goal updated event since current_value changed
    const updatedGoal = db
      .prepare("SELECT * FROM goals WHERE id = ?")
      .get(addedLog.goal_id);
    eventBus.emit("goal:updated", { entry: updatedGoal });
  }
  return addedLog;
};
