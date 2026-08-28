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

export const handleGetCategories = async (event, token) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }

  return localDB.getCategories(userId);
};

export const handleAddCategory = async (event, token, category) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  return localDB.addCategory(userId, category);
};

export const handleUpdateCategory = async (event, token, category) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  return localDB.updateCategory(userId, category);
};

export const handleDeleteCategory = async (event, token, categoryId) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  return localDB.deleteCategory(userId, categoryId);
};
