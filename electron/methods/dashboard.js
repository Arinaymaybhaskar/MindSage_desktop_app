import { getUserIdFromToken } from "./authToken.js";
import localDB from "../db/index.js";

export const getDashboardData = (event, token) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  return localDB.getDashboardData(userId);
};

export const getMonthlyScores = (event, token) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  return localDB.getMonthlyScores(userId);
};

export const getAllTimeScores = (event, token) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  return localDB.getAllTimeScores(userId);
};

export const getUserStats = (event, token) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  return localDB.getUserStats(userId);
};
