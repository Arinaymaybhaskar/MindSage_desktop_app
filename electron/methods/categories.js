import localDB from "../db/index.js";
import { currentUserId } from "../session.js";

export const handleGetCategories = async (event) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }

  return localDB.getCategories(userId);
};

export const handleAddCategory = async (event, category) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  return localDB.addCategory(userId, category);
};

export const handleUpdateCategory = async (event, category) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  return localDB.updateCategory(userId, category);
};

export const handleDeleteCategory = async (event, categoryId) => {
  const userId = currentUserId();
  if (!userId) {
    return { error: "Not signed in" };
  }
  return localDB.deleteCategory(userId, categoryId);
};
