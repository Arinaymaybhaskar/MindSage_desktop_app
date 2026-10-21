import { db } from "./connection.js";
import { removeUserSources } from "./searchIndex.js";

// Deleting a whole profile (KAN-56). The rows go in one transaction (every
// table that belongs to a user cascades from users), and what has to be
// removed outside the database (media files) is returned for the caller. Nothing here touches another user's rows.

/** Counts for the "what goes" list, trashed items included: they go too. */
export function profileSummary(userId) {
  const one = (sql) => db.prepare(sql).get(userId).n;
  return {
    entries: one(
      `SELECT COUNT(*) n FROM journal_entries WHERE user_id = ? AND is_deleted = 0`,
    ),
    trashedEntries: one(
      `SELECT COUNT(*) n FROM journal_entries WHERE user_id = ? AND is_deleted = 1`,
    ),
    goals: one(
      `SELECT COUNT(*) n FROM goals WHERE user_id = ? AND is_deleted = 0`,
    ),
    trashedGoals: one(
      `SELECT COUNT(*) n FROM goals WHERE user_id = ? AND is_deleted = 1`,
    ),
    photos: one(
      `SELECT COUNT(*) n FROM journal_entries WHERE user_id = ? AND image_key IS NOT NULL`,
    ),
    recordings: one(
      `SELECT COUNT(*) n FROM journal_entries WHERE user_id = ? AND audio_key IS NOT NULL`,
    ),
    chats: one(`SELECT COUNT(*) n FROM chats WHERE user_id = ?`),
    otherProfiles: db
      .prepare(`SELECT COUNT(*) n FROM users WHERE id != 0 AND id != ?`)
      .get(userId).n,
  };
}

/**
 * Removes the profile and everything of theirs in the database.
 * @returns {{ entryIds: number[], files: string[], lastProfile: boolean }}
 */
export function deleteProfile(userId) {
  return db.transaction(() => {
    const entries = db
      .prepare(
        `SELECT id, image_key, audio_key FROM journal_entries WHERE user_id = ?`,
      )
      .all(userId);
    const chatFiles = db
      .prepare(
        `SELECT f.file_path FROM files f JOIN chats c ON c.id = f.chat_id WHERE c.user_id = ?`,
      )
      .all(userId)
      .map((r) => r.file_path);
    const picture = db
      .prepare(`SELECT profile_picture FROM users WHERE id = ?`)
      .get(userId)?.profile_picture;

    // Vectors and index state of the whole profile go in this transaction.
    removeUserSources(userId);

    db.prepare(`DELETE FROM users WHERE id = ? AND id != 0`).run(userId);

    const files = [
      ...entries.flatMap((e) => [e.image_key, e.audio_key]),
      ...chatFiles,
      picture,
    ].filter(Boolean);
    const remaining = db
      .prepare(`SELECT COUNT(*) n FROM users WHERE id != 0`)
      .get().n;
    return {
      entryIds: entries.map((e) => e.id),
      files,
      lastProfile: remaining === 0,
    };
  })();
}
