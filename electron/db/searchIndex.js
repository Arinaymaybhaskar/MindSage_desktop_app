import crypto from "node:crypto";
import { db, vectorSupport } from "./connection.js";
import {
  ensureVectorTable,
  rebuildVectorTable,
  removeOrphanVectors as removeOrphans,
} from "./vectorExtension.js";
import { filterByTimeRange, hasTimeRange } from "../timeFilter.js";
import { log } from "../log.js";

// The search index (KAN-192, KAN-88). Vectors live in vec_entries, in the same
// database file as the journal; search_index records, for every entry, goal and
// progress log, what state its vector is in. Results are built by joining hits
// back to the base tables, so a trashed or purged item can never come back and
// no copy of the text is stored a second time.

export const SOURCE_TYPES = ["journal", "goal", "progress_log"];

/** After this many failed attempts a row waits until its content changes. */
export const MAX_ATTEMPTS = 5;

/** Wait before the next attempt, by number of failures so far (1 min ... 12 h). */
export const BACKOFF_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 3_600_000,
  12 * 3_600_000,
];

export const backoffFor = (attempts) =>
  BACKOFF_MS[Math.min(Math.max(attempts, 1), BACKOFF_MS.length) - 1];

export const vectorsAvailable = () => vectorSupport.ok;

// ---------------------------------------------------------------------------
// What is embedded, and a hash of it
// ---------------------------------------------------------------------------

/** The text an item is embedded from; the same rules the old worker used. */
export function textFor(type, row) {
  if (type === "journal") {
    return row.title ? `${row.title} ${row.content}` : (row.content ?? "");
  }
  if (type === "goal") {
    return row.title
      ? `${row.title} ${row.description || ""}`
      : (row.description ?? "");
  }
  return `${row.goal_title || ""} ${row.description || ""}`;
}

export const hashText = (text) =>
  crypto.createHash("sha256").update(text, "utf8").digest("hex").slice(0, 32);

const SOURCE_SQL = {
  journal: `
    SELECT j.id, j.user_id, j.title, j.content, j.mood_score,
           j.created_at, j.updated_at, j.is_deleted,
           (SELECT GROUP_CONCAT(t.name) FROM journal_entry_tags jt
              JOIN tags t ON t.id = jt.tag_id
             WHERE jt.journal_entry_id = j.id) AS mood_tags
      FROM journal_entries j WHERE j.id = ?`,
  goal: `
    SELECT g.id, g.user_id, g.title, g.description, g.parent_goal_title,
           g.current_value, g.target_value, g.unit, g.is_pinned,
           g.is_completed, g.target_date, g.completed_date, g.created_at,
           g.is_deleted
      FROM goals g WHERE g.id = ?`,
  progress_log: `
    SELECT l.id, g.user_id, l.goal_id, g.title AS goal_title,
           l.description, l.value, g.unit, l.logged_at, g.is_deleted
      FROM progress_logs l JOIN goals g ON g.id = l.goal_id WHERE l.id = ?`,
};

const sourceStmts = {};
function sourceStmt(type) {
  sourceStmts[type] ??= db.prepare(SOURCE_SQL[type]);
  return sourceStmts[type];
}

function buildPayload(type, row) {
  if (type === "journal") {
    return {
      user_id: row.user_id,
      source_type: "journal",
      source_id: row.id,
      title: row.title || "",
      content: row.content || "",
      mood_score: row.mood_score || null,
      mood_tags: row.mood_tags ? row.mood_tags.split(",") : [],
      category_name: "",
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
  if (type === "goal") {
    return {
      user_id: row.user_id,
      source_type: "goal",
      source_id: row.id,
      title: row.title || "",
      description: row.description || "",
      parent_goal_title: row.parent_goal_title || null,
      current_value: row.current_value || 0,
      target_value: row.target_value || 0,
      unit: row.unit || "",
      status: row.is_completed ? "completed" : "active",
      is_pinned: row.is_pinned || 0,
      target_date: row.target_date,
      completed_date: row.completed_date,
      created_at: row.created_at,
    };
  }
  return {
    user_id: row.user_id,
    source_type: "progress_log",
    source_id: row.id,
    goal_id: row.goal_id,
    goal_title: row.goal_title || "",
    title: `Progress: ${row.goal_title || ""}`,
    description: row.description || "",
    value_logged: row.value || 0,
    unit: row.unit || "",
    created_at: row.logged_at,
  };
}

/**
 * The item as it is in the database now.
 * @returns {null | { type, id, userId, live, text, hash, payload }}
 *   null when the row no longer exists.
 */
export function loadSource(type, id) {
  const row = sourceStmt(type).get(id);
  if (!row) return null;
  const text = textFor(type, row);
  return {
    type,
    id: row.id,
    userId: row.user_id,
    live: !row.is_deleted,
    text,
    hash: hashText(text),
    payload: buildPayload(type, row),
  };
}

// ---------------------------------------------------------------------------
// State rows
// ---------------------------------------------------------------------------

/**
 * Notes that an item is new or changed: it goes back to pending with a clean
 * slate of attempts, which is also how a row that gave up is woken again.
 */
export function markStale(type, id, userId) {
  db.prepare(
    `INSERT INTO search_index (user_id, source_type, source_id, state)
     VALUES (?, ?, ?, 'pending')
     ON CONFLICT(source_type, source_id) DO UPDATE SET
       user_id = excluded.user_id, state = 'pending', attempts = 0,
       next_attempt_at = NULL, last_error = NULL`,
  ).run(userId, type, id);
}

/**
 * Called when an item is created or edited. Queues it only if its embedded text
 * differs from what the stored vector was made from, so edits that touch only
 * tags, mood or a goal's progress cost no embedding.
 * @returns {boolean} true if the item is now waiting for a vector
 */
export function noteChanged(type, id) {
  const source = loadSource(type, id);
  if (!source || !source.live) return false;
  const row = getState(type, id);
  if (row && row.state === "ok" && row.content_hash === source.hash) {
    return false;
  }
  markStale(type, id, source.userId);
  return true;
}

export function getState(type, id) {
  return (
    db
      .prepare(
        `SELECT * FROM search_index WHERE source_type = ? AND source_id = ?`,
      )
      .get(type, id) ?? null
  );
}

/**
 * Writes the vector for an item and marks it indexed, in one transaction that
 * first looks at the item again. That is what keeps an item deleted (or edited)
 * while its embedding was being made from landing in the index afterwards.
 *
 * @param {number[] | null} vector - null for a blank item: it is done, with
 *   no vector (KAN-391)
 * @param {string} hash - hash of the text the vector was made from
 * @returns {"ok" | "stale" | "gone"}
 *   stale: the text changed meanwhile, so the row stays pending and a new
 *   embedding is due. gone: the item was purged or trashed, nothing is stored.
 */
export function storeVector(type, id, vector, hash) {
  if (!vectorSupport.ok) throw new Error("Vector search is not available");
  return db.transaction(() => {
    const current = loadSource(type, id);
    if (!current || !current.live) {
      removeSources(type, [id]);
      return "gone";
    }
    if (current.hash !== hash) return "stale";

    markStaleIfMissing(type, id, current.userId);
    const row = getState(type, id);
    const rowid = BigInt(row.id);
    db.prepare("DELETE FROM vec_entries WHERE rowid = ?").run(rowid);
    if (vector) {
      db.prepare(
        "INSERT INTO vec_entries(rowid, embedding, user_id) VALUES (?, ?, ?)",
      ).run(rowid, vectorBuffer(vector), BigInt(current.userId));
    }
    db.prepare(
      `UPDATE search_index
          SET content_hash = ?, state = 'ok', attempts = 0,
              next_attempt_at = NULL, last_error = NULL,
              indexed_at = CASE WHEN ? THEN datetime('now') END, user_id = ?
        WHERE id = ?`,
    ).run(hash, vector ? 1 : 0, current.userId, row.id);
    return "ok";
  })();
}

function markStaleIfMissing(type, id, userId) {
  if (!getState(type, id)) markStale(type, id, userId);
}

function vectorBuffer(vector) {
  const f = Float32Array.from(vector);
  return Buffer.from(f.buffer, f.byteOffset, f.byteLength);
}

/**
 * A failed attempt. Waits 1 min, 5 min, 30 min, 2 h, 12 h; after MAX_ATTEMPTS
 * it waits for the content to change (markStale).
 * @returns {{ attempts: number, nextAttemptAt: number | null }}
 */
export function markFailure(type, id, userId, error, now = Date.now()) {
  markStaleIfMissing(type, id, userId);
  const row = getState(type, id);
  const attempts = row.attempts + 1;
  const nextAttemptAt =
    attempts >= MAX_ATTEMPTS ? null : now + backoffFor(attempts);
  db.prepare(
    `UPDATE search_index
        SET state = 'failed', attempts = ?, next_attempt_at = ?, last_error = ?
      WHERE id = ?`,
  ).run(
    attempts,
    nextAttemptAt,
    String(error?.message ?? error).slice(0, 300),
    row.id,
  );
  return { attempts, nextAttemptAt };
}

/**
 * Puts rows that gave up (failed, no next attempt, attempts used up) back to
 * pending with a clean slate. Only the manual sync calls this: the automatic
 * loop leaves such rows alone until their text changes. Rows still waiting on a
 * backoff and rows that are indexed are not touched.
 * @returns {number} how many rows were reset
 */
export function retryGaveUp() {
  return db
    .prepare(
      `UPDATE search_index
          SET state = 'pending', attempts = 0, next_attempt_at = NULL,
              last_error = NULL
        WHERE state = 'failed' AND next_attempt_at IS NULL AND attempts >= ?`,
    )
    .run(MAX_ATTEMPTS).changes;
}

// ---------------------------------------------------------------------------
// Removal (delete for good, delete profile)
// ---------------------------------------------------------------------------

function deleteVectorsFor(rowids) {
  if (!rowids.length) return;
  if (!vectorSupport.ok) {
    // vec_entries cannot be touched without the extension. The state rows
    // still go, which is what marks these vectors as orphans: the next start
    // that loads the extension removes them (removeOrphanVectors, KAN-368).
    log.warn(
      `Search index: ${rowids.length} vector(s) left for removal at the next start with the extension`,
    );
    return;
  }
  const del = db.prepare("DELETE FROM vec_entries WHERE rowid = ?");
  for (const id of rowids) del.run(BigInt(id));
}

/** Removes the vectors and state rows of the given items. Run it in the same
 *  transaction as the row delete, so no queue is needed. */
export function removeSources(type, ids) {
  const find = db.prepare(
    "SELECT id FROM search_index WHERE source_type = ? AND source_id = ?",
  );
  const rowids = [];
  for (const sourceId of ids) {
    const row = find.get(type, sourceId);
    if (row) rowids.push(row.id);
  }
  deleteVectorsFor(rowids);
  const del = db.prepare("DELETE FROM search_index WHERE id = ?");
  for (const id of rowids) del.run(id);
  return rowids.length;
}

/** Removes everything of one user (profile delete). */
export function removeUserSources(userId) {
  const rows = db
    .prepare("SELECT id FROM search_index WHERE user_id = ?")
    .all(userId);
  deleteVectorsFor(rows.map((r) => r.id));
  db.prepare("DELETE FROM search_index WHERE user_id = ?").run(userId);
  return rows.length;
}

// ---------------------------------------------------------------------------
// Finding work
// ---------------------------------------------------------------------------

/**
 * Items whose vector is missing, stale, or due for another attempt, most
 * recent first. Rows that gave up (attempts used up) are left alone until the
 * content changes.
 * @returns {Array<{ type: string, id: number, userId: number }>}
 */
export function pendingWork(limit = 25, now = Date.now()) {
  const due = db
    .prepare(
      `SELECT source_type AS type, source_id AS id, user_id AS userId
         FROM search_index
        WHERE state = 'pending'
           OR (state = 'failed' AND next_attempt_at IS NOT NULL
               AND next_attempt_at <= ?)
        ORDER BY id DESC LIMIT ?`,
    )
    .all(now, limit);
  if (due.length >= limit) return due;

  // Live items with no state row at all: written before the index existed or
  // by a path that did not announce itself.
  const missing = db
    .prepare(
      `SELECT 'journal' AS type, j.id AS id, j.user_id AS userId
         FROM journal_entries j
        WHERE j.is_deleted = 0 AND NOT EXISTS (
          SELECT 1 FROM search_index s
           WHERE s.source_type = 'journal' AND s.source_id = j.id)
       UNION ALL
       SELECT 'goal', g.id, g.user_id
         FROM goals g
        WHERE g.is_deleted = 0 AND NOT EXISTS (
          SELECT 1 FROM search_index s
           WHERE s.source_type = 'goal' AND s.source_id = g.id)
       UNION ALL
       SELECT 'progress_log', l.id, g.user_id
         FROM progress_logs l JOIN goals g ON g.id = l.goal_id
        WHERE g.is_deleted = 0 AND NOT EXISTS (
          SELECT 1 FROM search_index s
           WHERE s.source_type = 'progress_log' AND s.source_id = l.id)
        ORDER BY 2 DESC LIMIT ?`,
    )
    .all(limit - due.length);
  return [...due, ...missing];
}

/** How many items are waiting for a vector or a retry, over all users. */
export function pendingCount(now = Date.now()) {
  const queued = db
    .prepare(
      `SELECT COUNT(*) AS n FROM search_index
        WHERE state = 'pending'
           OR (state = 'failed' AND next_attempt_at IS NOT NULL
               AND next_attempt_at <= ?)`,
    )
    .get(now).n;
  const missing = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM journal_entries j WHERE j.is_deleted = 0 AND NOT EXISTS (
            SELECT 1 FROM search_index s WHERE s.source_type = 'journal' AND s.source_id = j.id))
       + (SELECT COUNT(*) FROM goals g WHERE g.is_deleted = 0 AND NOT EXISTS (
            SELECT 1 FROM search_index s WHERE s.source_type = 'goal' AND s.source_id = g.id))
       + (SELECT COUNT(*) FROM progress_logs l JOIN goals g ON g.id = l.goal_id
           WHERE g.is_deleted = 0 AND NOT EXISTS (
            SELECT 1 FROM search_index s WHERE s.source_type = 'progress_log' AND s.source_id = l.id)) AS n`,
    )
    .get().n;
  return queued + missing;
}

/** When the soonest failed row becomes due again, or null if none will. */
export function nextRetryAt() {
  return (
    db
      .prepare(
        `SELECT MIN(next_attempt_at) AS t FROM search_index
          WHERE state = 'failed' AND next_attempt_at IS NOT NULL`,
      )
      .get().t ?? null
  );
}

/**
 * How the index stands, for the settings screen and the progress bar.
 * `total` counts live items; `missing` those with no vector yet.
 */
export function indexCounts(userId) {
  const live = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM journal_entries WHERE user_id = @u AND is_deleted = 0)
       + (SELECT COUNT(*) FROM goals WHERE user_id = @u AND is_deleted = 0)
       + (SELECT COUNT(*) FROM progress_logs l JOIN goals g ON g.id = l.goal_id
           WHERE g.user_id = @u AND g.is_deleted = 0) AS n`,
    )
    .get({ u: userId }).n;
  const byState = Object.fromEntries(
    db
      .prepare(
        `SELECT s.state, COUNT(*) AS n FROM search_index s
          WHERE s.user_id = ? AND EXISTS (SELECT 1 FROM (
              SELECT id FROM journal_entries WHERE is_deleted = 0 AND id = s.source_id AND s.source_type = 'journal'
              UNION ALL SELECT id FROM goals WHERE is_deleted = 0 AND id = s.source_id AND s.source_type = 'goal'
              UNION ALL SELECT l.id FROM progress_logs l JOIN goals g ON g.id = l.goal_id
                WHERE g.is_deleted = 0 AND l.id = s.source_id AND s.source_type = 'progress_log'))
          GROUP BY s.state`,
      )
      .all(userId)
      .map((r) => [r.state, r.n]),
  );
  const ok = byState.ok ?? 0;
  const failed = byState.failed ?? 0;
  const pending = byState.pending ?? 0;
  const gaveUp = db
    .prepare(
      `SELECT COUNT(*) AS n FROM search_index
        WHERE user_id = ? AND state = 'failed' AND next_attempt_at IS NULL`,
    )
    .get(userId).n;
  return {
    total: live,
    ok,
    pending,
    failed,
    gaveUp,
    missing: Math.max(0, live - ok - pending - failed),
  };
}

/** Drops every vector and queues everything again (a different embedding model). */
export function resetAll(dim) {
  db.transaction(() => {
    if (vectorSupport.ok) rebuildVectorTable(db, dim);
    db.prepare(
      `UPDATE search_index
          SET state = 'pending', attempts = 0, next_attempt_at = NULL,
              last_error = NULL, content_hash = NULL, indexed_at = NULL`,
    ).run();
  })();
}

export { ensureVectorTable };

/** Removes vectors left behind without the extension; see vectorExtension.js. */
export function removeOrphanVectors() {
  if (!vectorSupport.ok) return 0;
  return removeOrphans(db);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Nearest live items of one user.
 * @returns {Array<{ id: number, score: number, payload: object }>}
 *   score is 1 - cosine distance, the number Qdrant used to return.
 */
export function searchSimilar(
  userId,
  vector,
  limit,
  { threshold = 0.5, range = null } = {},
) {
  if (!vectorSupport.ok) throw new Error("Vector search is not available");
  // Trashed items keep their vector, and a time range drops most candidates,
  // so ask for more than will be returned.
  const k = Math.max(limit * (hasTimeRange(range) ? 10 : 3), 10);
  const hits = db
    .prepare(
      `SELECT rowid, distance FROM vec_entries
        WHERE embedding MATCH ? AND k = ? AND user_id = ?
        ORDER BY distance`,
    )
    .all(vectorBuffer(vector), k, BigInt(userId));

  // Only a row storeVector filled owns its rowid's vector. A row that was
  // never indexed may have been handed the id of a purged item whose vector
  // could not be removed yet (KAN-368), so its hit is not this item's.
  const row = db.prepare(
    `SELECT source_type, source_id FROM search_index
      WHERE id = ? AND indexed_at IS NOT NULL`,
  );
  const results = [];
  for (const hit of hits) {
    const score = 1 - hit.distance;
    if (score < threshold) continue;
    const ref = row.get(Number(hit.rowid));
    if (!ref) continue;
    const source = loadSource(ref.source_type, ref.source_id);
    if (!source || !source.live || source.userId !== userId) continue;
    results.push({ id: Number(hit.rowid), score, payload: source.payload });
  }
  return filterByTimeRange(results, range).slice(0, limit);
}
