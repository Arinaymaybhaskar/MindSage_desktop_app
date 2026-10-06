import localDB from "../db/index.js";
import { currentUserId } from "../session.js";

export const handleExportUserData = async (event, filePath) => {
  console.log("Starting data export process...", filePath);
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }

  // -- 1. Fetch all user data from the local database --
  let exportData;
  try {
    exportData = await localDB.exportEverything(userId, filePath);
  } catch (error) {
    console.error("Error fetching user data:", error);
    return { error: "Failed to fetch user data" };
  }
  if (!exportData) {
    return { error: "No data found for user" };
  }
  return { data: exportData, success: true };
};
