import localDB from "../db";
import jwt from "jsonwebtoken";
import axios from "axios";

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

export const handleGetCategories = async (event, authMode, token) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }

  if (authMode === "online") {
    console.log("online mode");
  } else {
    return localDB.getCategories(userId);
  }
};

export const handleAddCategory = async (event, authMode, token, category) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") console.log("online mode");
  else return localDB.addCategory(userId, category);
};

export const handleUpdateCategory = async (
  event,
  authMode,
  token,
  category,
) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") console.log("online mode");
  else return localDB.updateCategory(userId, category);
};

export const handleDeleteCategory = async (
  event,
  authMode,
  token,
  categoryId,
) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") console.log("online mode");
  else return localDB.deleteCategory(userId, categoryId);
};
