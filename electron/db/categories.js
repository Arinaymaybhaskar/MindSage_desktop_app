import { db } from "./connection.js";

export const getCategories = async (userId) => {
  const stmt = db.prepare(
    "SELECT * FROM categories WHERE user_id = ? OR user_id = 0",
  );
  return stmt.all(userId);
};

export const addCategory = async (userId, category) => {
  let { name, color } = category;
  if (name === undefined) {
    return { error: "Name is required" };
  }
  if (color === undefined) {
    color = "#000000";
  }
  const stmt = db.prepare(
    "INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)",
  );
  return stmt.run(userId, name, color);
};

export const editCategory = async (userId, category) => {
  let { name, color, id } = category;
  if (name === undefined) {
    return { error: "Name is required" };
  }
  if (color === undefined) {
    color = "#000000";
  }
  const stmt = db.prepare(
    "UPDATE categories SET name = ?, color = ? WHERE user_id = ? AND categoryId = ?",
  );
  return stmt.run(userId, name, color, id);
};

export const deleteCategory = async (userId, categoryId) => {
  const stmt = db.prepare(
    "DELETE FROM categories WHERE user_id = ? AND categoryId = ?",
  );
  return stmt.run(userId, categoryId);
};
