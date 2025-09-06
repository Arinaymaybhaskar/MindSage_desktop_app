import localDB from "../db";
import jwt from "jsonwebtoken";

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

export const handleGetActiveGoals = async (event, authMode, token) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }

    if (authMode === "online") {
        console.log("online mode")
    } else {
        return localDB.getActiveGoals(userId);
    }
}

export const handleGetCompletedGoals = async (event, authMode, token) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
    } else {
        return localDB.getCompletedGoals(userId);
    }
}

export const handleCreateGoal = async (event, authMode, token, goal) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
    } else {
        return localDB.AddGoal(userId, goal);
    }
}

export const handleUpdateGoal = async (event, authMode, token, goalId, goalData) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
    } else {
        return localDB.updateGoal(userId, goalId, goalData);
    }
}

export const handleDeleteGoal = async (event, authMode, token, goalId) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
    } else {
        return localDB.deleteGoal(userId, goalId);
    }
}

export const handleTogglePin = async (event, authMode, token, goalId) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
    } else {
        return localDB.togglePinGoal(userId, goalId);
    }
}

export const handleCompleteGoal = async (event, authMode, token, goalId) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
    } else {
        return localDB.completeGoal(userId, goalId);
    }
}

export const handleUpdateProgress = async (event, authMode, token, goalId, value) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
    } else {
        return localDB.updateProgress(userId, goalId, value);
    }
}

export const handleGetPinnedGoals = (event, authMode, token) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
    } else {
        return localDB.getPinnedGoals(userId);
    }
}