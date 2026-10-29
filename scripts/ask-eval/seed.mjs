// Writes the demo journal (journal.mjs) into whatever database it is given.
// It takes the database and the app's data layers as arguments so this file
// imports no Electron and no better-sqlite3; the caller must point them at a
// throwaway profile, never the real one (run.mjs checks that).

/**
 * @param {{ db: object, localDB: object, index: object }} app
 *   db: the better-sqlite3 handle; localDB: electron/db/index.js;
 *   index: electron/db/searchIndex.js
 * @param {ReturnType<import("./journal.mjs").buildJournal>} journal
 * @param {(text: string) => Promise<number[]>} embed
 * @returns {Promise<{ userIds: Record<string, number>, entries: number, goals: number }>}
 */
export async function seedJournal({ db, localDB, index }, journal, embed) {
  const userIds = {};
  for (const u of journal.users) {
    userIds[u.key] = Number(
      db
        .prepare(
          `INSERT INTO users (username, email, password_hash) VALUES (?, ?, 'x')`,
        )
        .run(u.username, u.email).lastInsertRowid,
    );
  }

  const ids = new Map();
  for (const e of journal.entries) {
    const userId = userIds[e.user];
    const row = localDB.createJournalEntry(userId, {
      title: e.title,
      content: e.content,
      mood_score: e.mood,
      mood_tags: e.feelings,
      created_at: e.created_at,
    });
    ids.set(e, row.id);
    if (e.trashed) localDB.deleteJournalEntry(userId, row.id);
  }

  for (const g of journal.goals) {
    const userId = userIds[g.user];
    const goalId = Number(
      db
        .prepare(
          `INSERT INTO goals (user_id, category_id, title, description, target_value,
              current_value, unit, target_date, is_completed, completed_date, is_deleted)
           VALUES (?, (SELECT id FROM categories WHERE name = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          userId,
          g.category,
          g.title,
          g.description ?? null,
          g.target,
          g.current,
          g.unit,
          g.due,
          g.completed ? 1 : 0,
          g.completed ? g.logs.at(-1).day : null,
          g.trashed ? 1 : 0,
        ).lastInsertRowid,
    );
    for (const log of g.logs) {
      db.prepare(
        `INSERT INTO progress_logs (goal_id, value, logged_at) VALUES (?, ?, ?)`,
      ).run(goalId, log.value, `${log.day}T12:00:00.000Z`);
    }
  }

  // Search needs a vector per entry; the app's indexer would make them in the
  // background, here they are made now so a run starts with search ready.
  for (const [e, id] of ids) {
    const source = index.loadSource("journal", id);
    index.markStale("journal", id, userIds[e.user]);
    const vector = await embed(source.text);
    index.storeVector("journal", id, vector, source.hash);
  }

  return { userIds, entries: ids.size, goals: journal.goals.length };
}
