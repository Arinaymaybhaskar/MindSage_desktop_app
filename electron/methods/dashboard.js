import localDB from "../db/index.js";
import { currentUserId } from "../session.js";

export const getDashboardData = (event) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  return localDB.getDashboardData(userId);
};

export const getMonthlyScores = (event) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  return localDB.getMonthlyScores(userId);
};

export const getAllTimeScores = (event) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  return localDB.getAllTimeScores(userId);
};

export const getUserStats = (event) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  return localDB.getUserStats(userId);
};
