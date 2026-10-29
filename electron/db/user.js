import bcrypt from "bcryptjs";
import { db } from "./connection.js"; // Import the db connection

export function getUserById(userId) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) return null;

  // Mimic the online API by attaching related data
  const entriesThisMonth = db
    .prepare(
      `
        SELECT COUNT(*) as count FROM journal_entries 
        WHERE user_id = ? AND created_at >= date('now', 'start of month') AND is_deleted = 0
    `,
    )
    .get(userId);

  // Get last entry date
  const lastEntryDate = db
    .prepare(
      `
        SELECT MAX(created_at) as last_entry_
        FROM journal_entries WHERE user_id = ? AND is_deleted = 0
    `,
    )
    .get(userId);

  user.lastEntryDate = lastEntryDate?.last_entry_ || null;

  user.entriesCount = entriesThisMonth?.count || 0;

  // This goes to the renderer, which caches it in localStorage for the title
  // bar and profile menu. The bcrypt hash used to ride along into that cache.
  // Email and full name are unused since KAN-67 (columns kept one release).
  const {
    password_hash: _hash,
    email: _email,
    full_name: _fullName,
    ...safe
  } = user;
  return safe;
}

/**
 * Renames the profile and/or sets its picture; a key left out is unchanged.
 * The name is already cleaned and checked by the caller.
 */
export function updateUserProfile(userId, changes) {
  if ("username" in changes) {
    db.prepare("UPDATE users SET username = ? WHERE id = ?").run(
      changes.username,
      userId,
    );
  }
  if ("profile_picture" in changes) {
    db.prepare("UPDATE users SET profile_picture = ? WHERE id = ?").run(
      changes.profile_picture ?? null,
      userId,
    );
  }
  return (
    db
      .prepare(
        "SELECT id, username, created_at, timezone, profile_picture FROM users WHERE id = ?",
      )
      .get(userId) ?? null
  );
}

export function getUserSettings(userId) {
  return db
    .prepare("SELECT * FROM user_settings WHERE user_id = ?")
    .get(userId);
}

export function updateUserSettings(userId, settings) {
  const fields = Object.keys(settings);
  let values = Object.values(settings);
  if (fields.length === 0) return;
  // --- FIX: Sanitize boolean values for SQLite ---
  // This loop converts any `true` to `1` and `false` to `0`.
  values = values.map((value) => {
    if (typeof value === "boolean") {
      return value ? 1 : 0;
    }
    return value;
  });
  const setClause = fields.map((field) => `${field} = ?`).join(", ");
  const stmt = db.prepare(
    `UPDATE user_settings SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
  );
  return stmt.run(...values, userId);
}

export function deleteUser(userId) {
  const stmt = db.prepare("DELETE FROM users WHERE id = ?");
  return stmt.run(userId);
}

export function changePassword(userId, newPassword) {
  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  const stmt = db.prepare("UPDATE users SET password_hash = ? WHERE id = ?");
  return stmt.run(hashedPassword, userId);
}
