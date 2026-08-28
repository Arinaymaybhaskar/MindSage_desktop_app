import localDB from "../db/index.js";
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

export const handleExportUserData = async (
  event,
  authMode,
  token,
  filePath,
) => {
  console.log("Starting data export process...", filePath);
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") {
    console.log("online mode");
    return { error: "Export not available in online mode" };
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
