import { db } from './connection.js';

export async function getProgressLogs(goalId) {
    const stmt = db.prepare(`
        SELECT * FROM progress_logs WHERE goal_id = ?
    `);
    return stmt.all(goalId);
}

export async function logProgress(goalId, progress, description) {
    const stmt = db.prepare(`
        INSERT INTO progress_logs (goal_id, value, description) VALUES (?, ?, ?)
    `);
    const id = stmt.run(goalId, progress, description).lastInsertRowid;
    const progressLog = db.prepare('SELECT * FROM progress_logs WHERE id = ?').get(id);
    return progressLog;
}