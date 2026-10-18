import { db } from "./connection.js";
import { redactQuotes } from "../redactQuotes.js";

// The trash (KAN-52). Deleting an entry or a goal only marks it; this module
// lists, restores and finally removes what is marked. Every function takes the
// user id and never touches another user's rows. Only rows that are already in
// the trash can be removed here, so a stray id can never destroy live work.

/** How long a trashed item is kept. */
export const RETENTION_DAYS = 30;

// Clamped both ways: a clock set back must not read as 26,000 days left.
const daysLeft = `MIN(${RETENTION_DAYS}, MAX(0, ${RETENTION_DAYS} - CAST(julianday('now') - julianday(deleted_at) AS INTEGER)))`;
const expired = `julianday('now') - julianday(deleted_at) >= ${RETENTION_DAYS}`;

const placeholders = (ids) => ids.map(() => "?").join(",");
const cleanIds = (ids) => [
  ...new Set((ids ?? []).map(Number).filter(Number.isInteger)),
];

/** What is in this user's trash, newest first, with days left in SQL. */
export function listTrash(userId) {
  const entries = db
    .prepare(
      `SELECT id, title, substr(content, 1, 200) AS preview, mood_score,
              image_key IS NOT NULL AS has_image, audio_key IS NOT NULL AS has_audio,
              created_at, deleted_at, ${daysLeft} AS days_left
         FROM journal_entries
        WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL
        ORDER BY deleted_at DESC, id DESC`,
    )
    .all(userId);
  const goals = db
    .prepare(
      `SELECT id, title, description, current_value, target_value, unit,
              is_completed, created_at, deleted_at, ${daysLeft} AS days_left
         FROM goals
        WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL
        ORDER BY deleted_at DESC, id DESC`,
    )
    .all(userId);
  return { retentionDays: RETENTION_DAYS, entries, goals };
}

/** Ids of everything in the trash, for Empty trash. */
export function trashedIds(userId) {
  return {
    entryIds: db
      .prepare(
        `SELECT id FROM journal_entries
          WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL`,
      )
      .all(userId)
      .map((r) => r.id),
    goalIds: db
      .prepare(
        `SELECT id FROM goals
          WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL`,
      )
      .all(userId)
      .map((r) => r.id),
  };
}

// SQLite allows 32,766 variables in one statement; stay far below it.
const IN_CHUNK = 500;
const chunks = (list) => {
  const out = [];
  for (let i = 0; i < list.length; i += IN_CHUNK)
    out.push(list.slice(i, i + IN_CHUNK));
  return out;
};

/** Brings items back, with their tags, links and progress logs untouched. */
export function restoreItems(userId, { entryIds, goalIds }) {
  const entries = cleanIds(entryIds);
  const goals = cleanIds(goalIds);
  return db.transaction(() => {
    let restoredEntries = 0;
    for (const part of chunks(entries)) {
      restoredEntries += db
        .prepare(
          `UPDATE journal_entries
              SET is_deleted = 0, deleted_at = NULL
            WHERE user_id = ? AND is_deleted = 1 AND id IN (${placeholders(part)})`,
        )
        .run(userId, ...part).changes;
    }
    let restoredGoals = 0;
    for (const part of chunks(goals)) {
      restoredGoals += db
        .prepare(
          `UPDATE goals
              SET is_deleted = 0, deleted_at = NULL
            WHERE user_id = ? AND is_deleted = 1 AND id IN (${placeholders(part)})`,
        )
        .run(userId, ...part).changes;
    }
    return { entries: restoredEntries, goals: restoredGoals };
  })();
}

/**
 * Saved Ask answers that cited a removed item keep their sentences but lose
 * what they quoted of it: the quoted runs become "[entry removed]". Only AI
 * answers that cite the item (message_sources) in this user's chats are
 * touched. `types` are the source_type values the item is cited under.
 */
function scrubSavedAnswers(userId, types, id, item) {
  const answers = db
    .prepare(
      `SELECT DISTINCT m.id, m.content
         FROM message_sources s
         JOIN messages m ON m.id = s.message_id
         JOIN chats c ON c.id = m.chat_id
        WHERE s.source_type IN (${placeholders(types)}) AND s.source_id = ?
          AND c.user_id = ? AND m.sender = 'ai'`,
    )
    .all(...types, String(id), userId);
  const update = db.prepare(`UPDATE messages SET content = ? WHERE id = ?`);
  for (const answer of answers) {
    const redacted = redactQuotes(answer.content, item);
    if (redacted !== answer.content) update.run(redacted, answer.id);
  }
}

/**
 * Removes trashed items for good, in one transaction: the rows (tag links and
 * progress logs go with them by cascade), and queues their search-index points
 * for removal. Returns the media files the caller has to delete from disk.
 * Chat answers that cited a removed entry keep the citation's place but lose
 * its title.
 *
 * @returns {{ entries: number, goals: number, files: string[], entryIds: number[] }}
 */
export function deleteForever(userId, { entryIds, goalIds }) {
  const entries = cleanIds(entryIds);
  const goals = cleanIds(goalIds);
  return db.transaction(() => {
    const queue = db.prepare(
      `INSERT OR IGNORE INTO vector_deletions (user_id, source_type, source_id)
       VALUES (?, ?, ?)`,
    );
    const files = [];
    let removedEntries = 0;
    let removedGoals = 0;
    let removedEntryIds = [];

    if (entries.length) {
      const rows = db
        .prepare(
          `SELECT id, title, content, image_key, audio_key FROM journal_entries
            WHERE user_id = ? AND is_deleted = 1 AND id IN (${placeholders(entries)})`,
        )
        .all(userId, ...entries);
      for (const row of rows) {
        if (row.image_key) files.push(row.image_key);
        if (row.audio_key) files.push(row.audio_key);
        queue.run(userId, "journal", row.id);
      }
      const ids = rows.map((r) => r.id);
      removedEntryIds = ids;
      for (const row of rows)
        scrubSavedAnswers(userId, ["journal"], row.id, row);
      if (ids.length) {
        db.prepare(
          `UPDATE message_sources SET source_title = 'Removed entry'
            WHERE source_type = 'journal' AND source_id IN (${placeholders(ids)})`,
        ).run(...ids.map(String));
        removedEntries = db
          .prepare(
            `DELETE FROM journal_entries WHERE user_id = ? AND id IN (${placeholders(ids)})`,
          )
          .run(userId, ...ids).changes;
        // Tags that no entry uses any more would keep the entry's words
        // (a tag can be a phrase) and still be exported.
        db.prepare(
          `DELETE FROM tags WHERE user_id = ?
             AND id NOT IN (SELECT tag_id FROM journal_entry_tags)`,
        ).run(userId);
      }
    }

    if (goals.length) {
      const rows = db
        .prepare(
          `SELECT id, title, description FROM goals
            WHERE user_id = ? AND is_deleted = 1 AND id IN (${placeholders(goals)})`,
        )
        .all(userId, ...goals);
      const ids = rows.map((r) => r.id);
      for (const goal of rows) {
        queue.run(userId, "goal", goal.id);
        scrubSavedAnswers(userId, ["goal"], goal.id, {
          title: goal.title,
          content: goal.description,
        });
        for (const log of db
          .prepare(
            `SELECT id, description FROM progress_logs WHERE goal_id = ?`,
          )
          .all(goal.id)) {
          queue.run(userId, "progress_log", log.id);
          scrubSavedAnswers(userId, ["progress_log"], log.id, {
            title: goal.title,
            content: log.description,
          });
          db.prepare(
            `UPDATE message_sources SET source_title = 'Removed goal'
              WHERE source_type = 'progress_log' AND source_id = ?`,
          ).run(String(log.id));
        }
      }
      if (ids.length) {
        db.prepare(
          `UPDATE message_sources SET source_title = 'Removed goal'
            WHERE source_type = 'goal' AND source_id IN (${placeholders(ids)})`,
        ).run(...ids.map(String));
        removedGoals = db
          .prepare(
            `DELETE FROM goals WHERE user_id = ? AND id IN (${placeholders(ids)})`,
          )
          .run(userId, ...ids).changes;
      }
    }

    return {
      entries: removedEntries,
      goals: removedGoals,
      files,
      entryIds: removedEntryIds,
    };
  })();
}

/** Everything past its 30 days, grouped by user, ready for deleteForever. */
export function expiredItems() {
  const byUser = new Map();
  const slot = (userId) => {
    if (!byUser.has(userId)) byUser.set(userId, { entryIds: [], goalIds: [] });
    return byUser.get(userId);
  };
  for (const r of db
    .prepare(
      `SELECT user_id, id FROM journal_entries
        WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND ${expired}`,
    )
    .all()) {
    slot(r.user_id).entryIds.push(r.id);
  }
  for (const r of db
    .prepare(
      `SELECT user_id, id FROM goals
        WHERE is_deleted = 1 AND deleted_at IS NOT NULL AND ${expired}`,
    )
    .all()) {
    slot(r.user_id).goalIds.push(r.id);
  }
  return byUser;
}

/** Search-index points still waiting to be removed. */
export function pendingVectorDeletions(limit = 500) {
  return db
    .prepare(
      `SELECT id, user_id, source_type, source_id FROM vector_deletions
        ORDER BY id LIMIT ?`,
    )
    .all(limit);
}

export function clearVectorDeletions(ids) {
  const list = cleanIds(ids);
  if (!list.length) return 0;
  return db
    .prepare(`DELETE FROM vector_deletions WHERE id IN (${placeholders(list)})`)
    .run(...list).changes;
}
