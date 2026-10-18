import { db } from "./connection.js";

export const getActiveGoals = async (userId) => {
  const stmt = db.prepare(`
        SELECT * FROM goals WHERE user_id = ? AND is_completed = 0 AND is_deleted = 0
    `);
  const goals = stmt.all(userId);
  return goals;
};

export const getCompletedGoals = async (userId) => {
  const stmt = db.prepare(`
        SELECT * FROM goals WHERE user_id = ? AND is_completed = 1 AND is_deleted = 0
    `);
  const goals = stmt.all(userId);
  return goals;
};
export const AddGoal = async (userId, goalData) => {
  const {
    category_id,
    title,
    description,
    parent_goal,
    target_value,
    unit,
    target_date,
  } = goalData;

  // Validate category_id (must be null, system-owned, or user-owned)
  if (category_id !== null && category_id !== undefined) {
    const categoryExists = db
      .prepare(
        `
            SELECT id FROM categories
            WHERE id = ? AND (user_id = ? OR user_id = 0)
        `,
      )
      .get(category_id, userId);

    if (!categoryExists) {
      throw new Error(
        "Invalid category_id: Must belong to user or be a system category.",
      );
    }
  }

  const stmt = db.prepare(`
        INSERT INTO goals (
            user_id, category_id, title, description, parent_goal_title,
             target_value, unit, target_date
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

  const result = stmt.run(
    userId,
    category_id,
    title,
    description,
    parent_goal,
    target_value,
    unit,
    target_date,
  );

  return result;
};

export const updateGoal = async (userId, goal_id, goalData) => {
  const {
    category_id,
    title,
    description,
    parent_goal,
    current_value,
    target_value,
    unit,
    is_pinned,
    is_completed,
  } = goalData;
  const stmt = db.prepare(`
        UPDATE goals SET category_id = ?, title = ?, description = ?, parent_goal_title = ?, current_value = ?, target_value = ?, unit = ?, is_pinned = ?, is_completed = ? WHERE id = ? AND user_id = ? AND is_deleted = 0
    `);
  const result = stmt.run(
    category_id,
    title,
    description,
    parent_goal,
    current_value,
    target_value,
    unit,
    is_pinned,
    is_completed,
    goal_id,
    userId,
  );
  return result;
};
// Moves the goal to the trash. Its progress logs stay with it, so restoring
// brings the whole history back; they go when the goal is purged.
export const deleteGoal = async (userId, goal_id) => {
  const stmt = db.prepare(`
        UPDATE goals
           SET is_deleted = 1, is_pinned = 0,
               deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND user_id = ? AND is_deleted = 0
    `);
  return stmt.run(goal_id, userId);
};
export const togglePinGoal = async (userId, goal_id) => {
  const stmt = db.prepare(`
    UPDATE goals
    SET is_pinned = CASE is_pinned WHEN 1 THEN 0 ELSE 1 END
    WHERE user_id = ? AND id = ? AND is_deleted = 0
  `);
  const result = stmt.run(userId, goal_id);
  return result;
};
export const completeGoal = async (userId, goal_id) => {
  const stmt = db.prepare(`
        UPDATE goals 
        SET is_completed = 1, completed_date = DATE('now'), is_pinned = 0 
        WHERE user_id = ? AND id = ? AND is_deleted = 0
    `);
  const result = stmt.run(userId, goal_id);
  return result;
};
export const updateProgress = async (userId, goal_id, value) => {
  const updateStmt = db.prepare(
    "UPDATE goals SET current_value = ? WHERE id = ? AND user_id = ? AND is_deleted = 0",
  );
  updateStmt.run(value, goal_id, userId);

  const getGoalStmt = db.prepare(
    "SELECT * FROM goals WHERE id = ? AND user_id = ? AND is_deleted = 0",
  );
  return getGoalStmt.get(goal_id, userId);
};

export const getPinnedGoals = async (userId) => {
  const stmt = db.prepare(
    "SELECT * FROM goals WHERE user_id = ? AND is_pinned = 1 AND is_deleted = 0",
  );
  return stmt.all(userId);
};

export const getGoalById = async (goalId, userId) => {
  const goalStmt = db.prepare(
    "SELECT * FROM goals WHERE user_id = ? AND id = ? AND is_deleted = 0",
  );
  const goal = goalStmt.get(userId, goalId);

  if (!goal) return null;

  const logsStmt = db.prepare(
    "SELECT * FROM progress_logs WHERE goal_id = ? ORDER BY logged_at DESC",
  );
  const logs = logsStmt.all(goalId);

  const categoryId = goal.category_id;
  const categoryStmt = db.prepare("SELECT * FROM categories WHERE id = ?");

  const category = categoryStmt.get(categoryId);

  goal.category = category;
  goal.logs = logs;
  return goal;
};
