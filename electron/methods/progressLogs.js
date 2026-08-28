import localDB from "../db/index.js";
import jwt from "jsonwebtoken";
import { eventBus } from "../eventBus.js";
import { db } from "../db/connection.js";

function getUserIdFromToken(token) {
  try {
    // 1. Guard against null or undefined tokens
    if (!token) {
      return null;
    }
    const decoded = jwt.decode(token);
    // 2. Ensure the token was successfully decoded and has an id
    return decoded.id;
  } catch (e) {
    console.error("Error decoding token:", e);
    return null;
  }
}

export const handleGetProgressLogs = async (event, authMode, token, goalId) => {
  const userId = getUserIdFromToken(token);

  if (!userId) {
    return { error: "Invalid token" };
  }

  if (authMode === "online") {
    console.log("online mode");
  } else {
    return localDB.getProgressLogs(goalId);
  }
};

export const handleAddProgressLog = async (
  event,
  authMode,
  token,
  goalId,
  value,
  description,
) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }

  if (authMode === "online") {
    console.log("online mode");
  } else {
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
  }
};
