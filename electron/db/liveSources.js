import { db } from "./connection.js";

// Search results come from the vector store, which knows nothing about the
// trash. This keeps only the results whose entry or goal is still live and the
// signed-in user's, so a trashed or purged item can never be returned by
// search, Ask or related entries, whether or not its vector is gone yet.

const TABLES = {
  journal: {
    sql: `SELECT id FROM journal_entries WHERE user_id = ? AND is_deleted = 0 AND id IN (`,
  },
  goal: {
    sql: `SELECT id FROM goals WHERE user_id = ? AND is_deleted = 0 AND id IN (`,
  },
  progress_log: {
    sql: `SELECT l.id FROM progress_logs l JOIN goals g ON g.id = l.goal_id
           WHERE g.user_id = ? AND g.is_deleted = 0 AND l.id IN (`,
  },
};

/** @param {Array<{payload?: {source_type?: string, source_id?: unknown}}>} results */
export function filterLiveResults(userId, results) {
  const wanted = {
    journal: new Set(),
    goal: new Set(),
    progress_log: new Set(),
  };
  for (const r of results) {
    const type = r?.payload?.source_type;
    const id = Number(r?.payload?.source_id);
    if (wanted[type] && Number.isInteger(id)) wanted[type].add(id);
  }
  const live = {};
  for (const [type, ids] of Object.entries(wanted)) {
    live[type] = new Set();
    if (!ids.size) continue;
    const list = [...ids];
    const rows = db
      .prepare(`${TABLES[type].sql}${list.map(() => "?").join(",")})`)
      .all(userId, ...list);
    for (const row of rows) live[type].add(row.id);
  }
  return results.filter((r) => {
    const type = r?.payload?.source_type;
    if (!live[type]) return false; // a source type this app does not know
    return live[type].has(Number(r.payload.source_id));
  });
}
