import { getUserIdFromToken } from '../../src/utils/electronUtils';
import localDB from '../db';

export const getDashboardData = (event, authMode, token) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
    } else {
        return localDB.getDashboardData(userId);
    }
}

export const getMonthlyScores = (event, authMode, token) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
    } else {
        return localDB.getMonthlyScores(userId);
    }
}

export const getAllTimeScores = (event, authMode, token) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode")
    } else {
        return localDB.getAllTimeScores(userId);
    }
}

export const getUserStats = (event, authMode, token) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (authMode === "online") {
        console.log("online mode for stats - not implemented yet");
        // Here you would fetch stats from your online API
    } else {
        // Fetches the comprehensive stats from the local DB layer
        return localDB.getUserStats(userId);
    }
}