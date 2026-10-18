import { db } from "./connection.js";

// Both are scoped to the signed-in user's live goals: a goal id from anywhere
// else, or one in the trash, reads as no goal.
const ownLiveGoal = `goal_id IN (SELECT id FROM goals WHERE user_id = ? AND is_deleted = 0)`;

export async function getProgressLogs(userId, goalId) {
  const stmt = db.prepare(`
        SELECT * FROM progress_logs WHERE goal_id = ? AND ${ownLiveGoal}
    `);
  return stmt.all(goalId, userId);
}

export async function logProgress(userId, goalId, progress, description) {
  const goal = db
    .prepare(
      "SELECT id FROM goals WHERE id = ? AND user_id = ? AND is_deleted = 0",
    )
    .get(goalId, userId);
  if (!goal) return null;
  const stmt = db.prepare(`
        INSERT INTO progress_logs (goal_id, value, description) VALUES (?, ?, ?)
    `);
  const id = stmt.run(goalId, progress, description).lastInsertRowid;
  const progressLog = db
    .prepare("SELECT * FROM progress_logs WHERE id = ?")
    .get(id);
  return progressLog;
}
