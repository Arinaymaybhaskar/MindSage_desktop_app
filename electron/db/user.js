import bcrypt from 'bcryptjs';
import { db } from './connection.js'; // Import the db connection

export function getUserById(userId) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return null;

    // Mimic the online API by attaching related data
    const entriesThisMonth = db
        .prepare(
            `
        SELECT COUNT(*) as count FROM journal_entries 
        WHERE user_id = ? AND created_at >= date('now', 'start of month') AND is_deleted = 0
    `
        )
        .get(userId);

    // Get last entry date
    const lastEntryDate = db.prepare(`
        SELECT MAX(created_at) as last_entry_
        FROM journal_entries WHERE user_id = ? AND is_deleted = 0
    `).get(userId);

    user.lastEntryDate = lastEntryDate?.last_entry_ || null;

    user.entriesCount = entriesThisMonth?.count || 0;
    return user;
}

export function updateUserProfile(userId, { username, email, full_name }) {
    const stmt = db.prepare(
        "UPDATE users SET username = ?, email = ?, full_name = ? WHERE id = ?"
    );
    stmt.run(username, email, full_name, userId);
    const user = db
        .prepare(
            "SELECT id, username, email, created_at, full_name, timezone FROM users WHERE id = ?"
        )
        .get(userId);
    if (!user) return null;
    console.log(user, "+++++++++++++++++++++++++++++++++++++++++++++USER");
    return user;
}

export function getUserSettings(userId) {
    return db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
}

export function updateUserSettings(userId, settings) {
    const fields = Object.keys(settings);
    let values = Object.values(settings);
    if (fields.length === 0) return;
    // --- FIX: Sanitize boolean values for SQLite ---
    // This loop converts any `true` to `1` and `false` to `0`.
    values = values.map(value => {
        if (typeof value === 'boolean') {
            return value ? 1 : 0;
        }
        return value;
    });
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const stmt = db.prepare(`UPDATE user_settings SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`);
    return stmt.run(...values, userId);
}

export function deleteUser(userId) {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    return stmt.run(userId);
}

export function changePassword(userId, newPassword) {
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    const stmt = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    return stmt.run(hashedPassword, userId);
}
