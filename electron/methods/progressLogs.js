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
        console.log(decoded);
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
        console.log("online mode")
    } else {
        return localDB.getProgressLogs(goalId);
    }
}

export const handleAddProgressLog = async (event, authMode, token, goalId, value, description) => {
    const userId = getUserIdFromToken(token);
        console.log(userId, "userID in profgesslofg")
    if (!userId) {
        return { error: "Invalid token" };
    }

    if (authMode === "online") {
        console.log("online mode")
    } else {
        return localDB.logProgress(goalId, value, description);
    }
}
