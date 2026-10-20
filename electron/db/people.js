// SQLite access for the People section. Schema: migration 9 in migrations.js.
//
// Every read filters trashed entries out (is_deleted = 1), so moving an entry
// to Trash hides its mentions at once and restoring it brings them back with
// no AI call. Every query is scoped by user_id; person ids from the renderer
// are always checked against the signed-in user here.

import { db } from "./connection.js";
import { normaliseName } from "../people/text.js";

// ---------- People ----------

const PERSON_COLUMNS = `
  p.id, p.display_name, p.relationship, p.relationship_suggested, p.status,
  p.created_at, p.updated_at`;

/** People with their mention counts (distinct live entries) and aliases. */
export function listPeople(userId, status) {
  const rows = db
    .prepare(
      `SELECT ${PERSON_COLUMNS},
              COUNT(DISTINCT CASE WHEN j.id IS NOT NULL THEN m.entry_id END) AS mention_count,
              MAX(j.created_at) AS last_mentioned_at
         FROM people p
         LEFT JOIN person_mentions m ON m.person_id = p.id
         LEFT JOIN journal_entries j ON j.id = m.entry_id AND j.is_deleted = 0
        WHERE p.user_id = ? AND p.status = ?
        GROUP BY p.id
        ORDER BY last_mentioned_at IS NULL, last_mentioned_at DESC, p.display_name`,
    )
    .all(userId, status);
  return attachAliases(rows);
}

function attachAliases(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const aliases = db
    .prepare(
      `SELECT person_id, alias, source FROM person_aliases
        WHERE person_id IN (${ids.map(() => "?").join(",")})
        ORDER BY id`,
    )
    .all(...ids);
  const byPerson = new Map();
  for (const a of aliases) {
    if (!byPerson.has(a.person_id)) byPerson.set(a.person_id, []);
    byPerson.get(a.person_id).push(a.alias);
  }
  return rows.map((r) => ({ ...r, aliases: byPerson.get(r.id) ?? [] }));
}

export function getPerson(userId, personId) {
  const row = db
    .prepare(
      `SELECT ${PERSON_COLUMNS} FROM people p WHERE p.id = ? AND p.user_id = ?`,
    )
    .get(personId, userId);
  return row ? attachAliases([row])[0] : null;
}

export function createPerson(
  userId,
  { displayName, status, relationshipSuggested = null },
) {
  const info = db
    .prepare(
      `INSERT INTO people (user_id, display_name, status, relationship_suggested)
       VALUES (?, ?, ?, ?)`,
    )
    .run(userId, displayName, status, relationshipSuggested);
  return Number(info.lastInsertRowid);
}

export function updatePerson(userId, personId, fields) {
  const allowed = [
    "display_name",
    "relationship",
    "relationship_suggested",
    "status",
  ];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (key in fields) {
      sets.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (!sets.length) return 0;
  return db
    .prepare(
      `UPDATE people SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?`,
    )
    .run(...values, personId, userId).changes;
}

export function deletePerson(userId, personId) {
  return db
    .prepare(`DELETE FROM people WHERE id = ? AND user_id = ?`)
    .run(personId, userId).changes;
}

export function addAlias(personId, alias, source) {
  const normalised = normaliseName(alias);
  if (!normalised) return;
  db.prepare(
    `INSERT OR IGNORE INTO person_aliases (person_id, alias, alias_normalised, source)
     VALUES (?, ?, ?, ?)`,
  ).run(personId, alias.trim(), normalised, source);
}

export function removeAlias(userId, personId, alias) {
  return db
    .prepare(
      `DELETE FROM person_aliases
        WHERE person_id = (SELECT id FROM people WHERE id = ? AND user_id = ?)
          AND alias_normalised = ?`,
    )
    .run(personId, userId, normaliseName(alias)).changes;
}

/** Rows for identity.buildAliasIndex. */
export function aliasIndexRows(userId) {
  return db
    .prepare(
      `SELECT a.person_id, a.alias_normalised, p.status
         FROM person_aliases a JOIN people p ON p.id = a.person_id
        WHERE p.user_id = ?`,
    )
    .all(userId);
}

/** Confirmed people with aliases, for the extraction prompt. */
export function knownPeople(userId) {
  return listPeople(userId, "confirmed").map((p) => ({
    id: p.id,
    display_name: p.display_name,
    relationship: p.relationship ?? p.relationship_suggested,
    aliases: p.aliases,
  }));
}

/** Names of confirmed and suggested people, for the pre-check. */
export function trackedAliases(userId) {
  return db
    .prepare(
      `SELECT DISTINCT a.alias FROM person_aliases a JOIN people p ON p.id = a.person_id
        WHERE p.user_id = ? AND p.status != 'ignored'`,
    )
    .all(userId)
    .map((r) => r.alias);
}

export function ignoredAliases(userId) {
  return db
    .prepare(
      `SELECT DISTINCT a.alias FROM person_aliases a JOIN people p ON p.id = a.person_id
        WHERE p.user_id = ? AND p.status = 'ignored'`,
    )
    .all(userId)
    .map((r) => r.alias);
}

/**
 * Suggestions with at least `minEntries` live entries, for the inbox. A
 * one-off name (a waiter, a cab driver) never reaches it.
 */
export function inboxSuggestions(userId, minEntries) {
  return listPeople(userId, "suggested").filter(
    (p) => p.mention_count >= minEntries,
  );
}

/** Every person's status and aliases, for the "same as…?" questions. */
export function peopleForMatching(userId) {
  return [
    ...listPeople(userId, "confirmed"),
    ...listPeople(userId, "suggested"),
  ];
}

// ---------- Mentions ----------

export function mentionsForPerson(userId, personId) {
  return db
    .prepare(
      `SELECT m.id, m.entry_id, m.name_as_written, m.sentence_start, m.sentence_end,
              m.valence, m.feeling_tags, m.confidence, m.user_verified,
              j.created_at, j.title, j.content
         FROM person_mentions m
         JOIN people p ON p.id = m.person_id
         JOIN journal_entries j ON j.id = m.entry_id AND j.is_deleted = 0
        WHERE m.person_id = ? AND p.user_id = ?
        ORDER BY j.created_at DESC, m.sentence_start`,
    )
    .all(personId, userId);
}

export function mentionsForEntry(userId, entryId) {
  return db
    .prepare(
      `SELECT m.id, m.person_id, m.name_as_written, m.sentence_start, m.sentence_end,
              m.valence, m.feeling_tags, m.user_verified,
              p.display_name, p.status, p.relationship
         FROM person_mentions m
         JOIN people p ON p.id = m.person_id
         JOIN journal_entries j ON j.id = m.entry_id AND j.is_deleted = 0
        WHERE m.entry_id = ? AND j.user_id = ? AND p.status != 'ignored'
        ORDER BY m.sentence_start`,
    )
    .all(entryId, userId);
}

export function getMention(userId, mentionId) {
  return db
    .prepare(
      `SELECT m.*, j.content FROM person_mentions m
         JOIN journal_entries j ON j.id = m.entry_id
        WHERE m.id = ? AND j.user_id = ?`,
    )
    .get(mentionId, userId);
}

export function insertMention(m) {
  db.prepare(
    `INSERT INTO person_mentions
       (entry_id, person_id, name_as_written, sentence_start, sentence_end,
        valence, feeling_tags, confidence, user_verified, extractor_version)
     VALUES (@entry_id, @person_id, @name_as_written, @sentence_start, @sentence_end,
        @valence, @feeling_tags, @confidence, @user_verified, @extractor_version)`,
  ).run({ user_verified: 0, ...m });
}

export function deleteUnverifiedMentions(entryId) {
  db.prepare(
    `DELETE FROM person_mentions WHERE entry_id = ? AND user_verified = 0`,
  ).run(entryId);
}

export function verifiedMentions(entryId) {
  return db
    .prepare(
      `SELECT * FROM person_mentions WHERE entry_id = ? AND user_verified = 1`,
    )
    .all(entryId);
}

export function updateMention(mentionId, fields) {
  const allowed = [
    "person_id",
    "valence",
    "feeling_tags",
    "user_verified",
    "sentence_start",
    "sentence_end",
  ];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (key in fields) {
      sets.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (!sets.length) return 0;
  return db
    .prepare(`UPDATE person_mentions SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values, mentionId).changes;
}

export function deleteMention(mentionId) {
  return db.prepare(`DELETE FROM person_mentions WHERE id = ?`).run(mentionId)
    .changes;
}

/** Removes mentions of a person whose name matches, e.g. "not a person". */
export function deleteMentionsByName(userId, personId, normalisedName) {
  const rows = db
    .prepare(
      `SELECT m.id, m.name_as_written FROM person_mentions m
         JOIN people p ON p.id = m.person_id
        WHERE m.person_id = ? AND p.user_id = ?`,
    )
    .all(personId, userId);
  const del = db.prepare(`DELETE FROM person_mentions WHERE id = ?`);
  let n = 0;
  for (const r of rows) {
    if (normaliseName(r.name_as_written) === normalisedName)
      n += del.run(r.id).changes;
  }
  return n;
}

export function countMentions(personId) {
  return db
    .prepare(`SELECT COUNT(*) AS n FROM person_mentions WHERE person_id = ?`)
    .get(personId).n;
}

/** Deletes suggestions left with no mentions at all (after a fix or edit). */
export function pruneEmptySuggestions(userId) {
  return db
    .prepare(
      `DELETE FROM people
        WHERE user_id = ? AND status = 'suggested'
          AND NOT EXISTS (SELECT 1 FROM person_mentions m WHERE m.person_id = people.id)`,
    )
    .run(userId).changes;
}

// ---------- Summaries ----------

export function getSummary(personId) {
  return db
    .prepare(`SELECT * FROM person_summaries WHERE person_id = ?`)
    .get(personId);
}

export function saveSummary(personId, summaryJson, hash, model) {
  db.prepare(
    `INSERT INTO person_summaries (person_id, summary_json, mentions_hash, model, created_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(person_id) DO UPDATE SET
       summary_json = excluded.summary_json,
       mentions_hash = excluded.mentions_hash,
       model = excluded.model,
       created_at = excluded.created_at`,
  ).run(personId, summaryJson, hash, model);
}

// ---------- Jobs ----------

export function getEntryForJob(userId, entryId) {
  return db
    .prepare(
      `SELECT id, user_id, content, created_at, is_deleted, ai_metadata_status
         FROM journal_entries WHERE id = ? AND user_id = ?`,
    )
    .get(entryId, userId);
}

export function getJob(entryId) {
  return db
    .prepare(`SELECT * FROM people_jobs WHERE entry_id = ?`)
    .get(entryId);
}

/**
 * Queues an entry unless it is already done for this exact text and
 * extractor version. Returns whether a job is now waiting.
 */
export function enqueueJob(userId, entryId, hash, version, priority) {
  const job = getJob(entryId);
  if (
    job &&
    job.content_hash === hash &&
    job.extractor_version === version &&
    ["done", "skipped", "queued", "running"].includes(job.status)
  ) {
    return job.status === "queued";
  }
  db.prepare(
    `INSERT INTO people_jobs (entry_id, user_id, content_hash, status, attempts, last_error,
                              extractor_version, priority, updated_at)
     VALUES (?, ?, ?, 'queued', 0, NULL, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(entry_id) DO UPDATE SET
       content_hash = excluded.content_hash, status = 'queued', attempts = 0,
       last_error = NULL, extractor_version = excluded.extractor_version,
       priority = excluded.priority, updated_at = CURRENT_TIMESTAMP`,
  ).run(entryId, userId, hash, version, priority);
  return true;
}

/**
 * Queues every live entry of the user that has no up-to-date job, newest
 * first through priority = the entry's age rank. Returns how many it queued.
 */
export function enqueueBackfill(userId, version, hashOf) {
  const entries = db
    .prepare(
      `SELECT j.id, j.content, pj.content_hash, pj.extractor_version, pj.status
         FROM journal_entries j
         LEFT JOIN people_jobs pj ON pj.entry_id = j.id
        WHERE j.user_id = ? AND j.is_deleted = 0
        ORDER BY j.created_at DESC`,
    )
    .all(userId);
  let queued = 0;
  db.transaction(() => {
    for (const e of entries) {
      const hash = hashOf(e.content);
      if (
        e.content_hash === hash &&
        e.extractor_version === version &&
        e.status !== "failed"
      )
        continue;
      if (enqueueJob(userId, e.id, hash, version, 0)) queued++;
    }
  })();
  return queued;
}

/**
 * The next job to run: new and edited entries (priority 1) before backfill,
 * then the newest entry first, so the people who matter now appear first.
 */
export function nextJob(userId, { includeBackfill }) {
  return db
    .prepare(
      `SELECT pj.* FROM people_jobs pj
         JOIN journal_entries j ON j.id = pj.entry_id
        WHERE pj.user_id = ? AND pj.status = 'queued' AND j.is_deleted = 0
          ${includeBackfill ? "" : "AND pj.priority > 0"}
        ORDER BY pj.priority DESC, j.created_at DESC
        LIMIT 1`,
    )
    .get(userId);
}

export function setJobStatus(entryId, status, fields = {}) {
  db.prepare(
    `UPDATE people_jobs SET status = ?, attempts = COALESCE(?, attempts),
            last_error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE entry_id = ?`,
  ).run(status, fields.attempts ?? null, fields.lastError ?? null, entryId);
}

/** After a crash or quit mid-job: nothing stays "running" across launches. */
export function resetRunningJobs() {
  return db
    .prepare(
      `UPDATE people_jobs SET status = 'queued' WHERE status = 'running'`,
    )
    .run().changes;
}

export function requeueFailed(userId) {
  return db
    .prepare(
      `UPDATE people_jobs SET status = 'queued', attempts = 0, last_error = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND status = 'failed'`,
    )
    .run(userId).changes;
}

export function jobCounts(userId) {
  const rows = db
    .prepare(
      `SELECT pj.status, COUNT(*) AS n FROM people_jobs pj
         JOIN journal_entries j ON j.id = pj.entry_id AND j.is_deleted = 0
        WHERE pj.user_id = ? GROUP BY pj.status`,
    )
    .all(userId);
  const total = db
    .prepare(
      `SELECT COUNT(*) AS n FROM journal_entries WHERE user_id = ? AND is_deleted = 0`,
    )
    .get(userId).n;
  const counts = {
    queued: 0,
    running: 0,
    done: 0,
    skipped: 0,
    failed: 0,
    total,
  };
  for (const r of rows) counts[r.status] = r.n;
  return counts;
}

/** Turning People off: every row derived from this user's journal goes. */
export function deleteAllPeopleData(userId) {
  db.transaction(() => {
    db.prepare(`DELETE FROM people WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM people_jobs WHERE user_id = ?`).run(userId);
  })();
}

export function runInTransaction(fn) {
  return db.transaction(fn)();
}
