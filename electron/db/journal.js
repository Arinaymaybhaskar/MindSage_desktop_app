import { db } from './connection.js';
import Sentiment from 'sentiment';

const sentiment = new Sentiment();

/**
 * A simple local sentiment analyzer.
 * @param {string} text - The text to analyze.
 * @returns {number} A normalized sentiment score between -1 and 1.
 */
const analyzeSentimentLocal = (text) => {
  if (!text) return 0;
  const result = sentiment.analyze(text);
  // Normalize the score to be between -1 and 1
  const score = Math.max(-1, Math.min(1, result.score / 10));
  return score;
};

/**
 * Creates a new journal entry and associates tags with it in a transaction.
 * @param {number} userId - The ID of the user.
 * @param {object} entry - The journal entry data.
 * @param {string} entry.title - The title of the entry.
 * @param {string} entry.content - The content of the entry.
 * @param {number} entry.mood_score - The user's mood score.
 * @param {string[]} entry.mood_tags - An array of tags.
 * @returns {{journalId: number, userId: number}}
 */
export function createJournalEntry(userId, entry) {
  const { title, content, mood_score, mood_tags = [] } = entry;

  const sentiment_score = analyzeSentimentLocal(content || '');
  const now = new Date().toISOString();

  const runTransaction = db.transaction(() => {
    const entryStmt = db.prepare(`
      INSERT INTO journal_entries (
        user_id, title, content, mood_score, sentiment_score,
        created_at, updated_at, synced, sync_action
      ) VALUES (
        @userId, @title, @content, @mood_score, @sentiment_score,
        @created_at, @updated_at, 0, 'create'
      )
    `);

    const entryResult = entryStmt.run({
      userId,
      title: title || null,
      content: content || '',
      mood_score: mood_score || null,
      sentiment_score,
      created_at: now,
      updated_at: now
    });

    const journalId = entryResult.lastInsertRowid;

    // Handle tags
    if (mood_tags && mood_tags.length > 0) {
      const insertTagStmt = db.prepare(
        'INSERT OR IGNORE INTO tags (user_id, name) VALUES (?, ?)'
      );
      const selectTagStmt = db.prepare(
        'SELECT id FROM tags WHERE user_id = ? AND name = ?'
      );
      const linkTagStmt = db.prepare(
        'INSERT INTO journal_entry_tags (journal_entry_id, tag_id) VALUES (?, ?)'
      );

      for (const tagName of mood_tags) {
        insertTagStmt.run(userId, tagName);
        const tag = selectTagStmt.get(userId, tagName);
        if (tag) {
          linkTagStmt.run(journalId, tag.id);
        }
      }
    }

    // 🔹 Fetch the created entry (with joined tags)
    const getEntryStmt = db.prepare(`
      SELECT je.*, GROUP_CONCAT(t.name) AS mood_tags
      FROM journal_entries je
      LEFT JOIN journal_entry_tags jet ON je.id = jet.journal_entry_id
      LEFT JOIN tags t ON jet.tag_id = t.id
      WHERE je.id = ?
      GROUP BY je.id
    `);

    const createdEntry = getEntryStmt.get(journalId);

    // Convert mood_tags from CSV string back into array
    if (createdEntry && createdEntry.mood_tags) {
      createdEntry.mood_tags = createdEntry.mood_tags.split(',');
    } else {
      createdEntry.mood_tags = [];
    }

    return createdEntry;
  });

  return runTransaction();
}


/**
 * Retrieves the three most recent journal entries for a user, including their tags.
 * @param {number} userId - The ID of the user.
 * @returns {object[]} An array of journal entries.
 */
export function getRecentEntries(userId) {
  const stmt = db.prepare(`
        SELECT
            j.*,
            GROUP_CONCAT(t.name) AS mood_tags
        FROM journal_entries j
        LEFT JOIN journal_entry_tags jt ON j.id = jt.journal_entry_id
        LEFT JOIN tags t ON jt.tag_id = t.id
        WHERE j.user_id = ? AND j.is_deleted = 0
        GROUP BY j.id
        ORDER BY j.created_at DESC
        LIMIT 3
    `);
  const rows = stmt.all(userId);
  // Convert the comma-separated tags string back into an array.
  return rows.map(row => ({
    ...row,
    mood_tags: row.mood_tags ? row.mood_tags.split(',') : []
  }));
}

/**
 * Retrieves a paginated list of all journal entries for a user, with optional date filtering.
 * @param {number} userId - The ID of the user.
 * @param {number} limit - The number of entries per page.
 * @param {number} offset - The starting offset.
 * @param {string} fromDate - The start date in 'YYYY-MM-DD' format.
 * @param {string} toDate - The end date in 'YYYY-MM-DD' format.
 * @returns {object[]} An array of journal entries.
 */
export function getAllEntries(userId, limit = 10, offset = 0, fromDate, toDate) {
  // Base SQL: Select all columns from journal_entries and use GROUP_CONCAT to aggregate tags.
  // LEFT JOIN ensures entries without tags are still included.
  let sql = `
        SELECT
            j.*,
            GROUP_CONCAT(t.name) AS mood_tags
        FROM journal_entries j
        LEFT JOIN journal_entry_tags jt ON j.id = jt.journal_entry_id
        LEFT JOIN tags t ON jt.tag_id = t.id
        WHERE j.user_id = ? AND j.is_deleted = 0
    `;
  const params = [userId];

  // Dynamically add date filtering to the WHERE clause if provided.
  if (fromDate) {
    sql += ` AND DATE(j.created_at) >= DATE(?)`;
    params.push(fromDate);
  }
  if (toDate) {
    sql += ` AND DATE(j.created_at) <= DATE(?)`;
    params.push(toDate);
  }

  // Add grouping, ordering, and pagination to the end of the query.
  sql += `
        GROUP BY j.id
        ORDER BY DATETIME(j.created_at) DESC
        LIMIT ? OFFSET ?
    `;

  // *** FIX: The parameter order for LIMIT and OFFSET is crucial. ***
  // SQL expects `LIMIT count OFFSET start`. So, 'limit' must be pushed before 'offset'.
  params.push(limit, offset);
  const stmt = db.prepare(sql);
  const rows = stmt.all(...params);

  // Convert the comma-separated tags string from GROUP_CONCAT back into a clean array.
  return rows.map(row => ({
    ...row,
    mood_tags: row.mood_tags ? row.mood_tags.split(',') : []
  }));
}

/**
 * Retrieves image keys and IDs from journal entries.
 * @param {number} userId - The user's ID.
 * @param {string} mode - "top" for latest, "random" for random.
 * @returns {object[]}
 */
export function getImageKeysAndIds(userId, mode = "top") {
  // This function doesn't need to be changed as it doesn't interact with tags.
  if (mode === "random") {
    const countStmt = db.prepare(`SELECT COUNT(*) AS total FROM journal_entries WHERE user_id = ? AND is_deleted = 0 AND image_key IS NOT NULL`);
    const { total } = countStmt.get(userId);
    if (total === 0) return [];

    const numToFetch = Math.min(10, total);
    const offsets = new Set();
    while (offsets.size < numToFetch) {
      offsets.add(Math.floor(Math.random() * total));
    }

    const fetchStmt = db.prepare(`SELECT id, image_key, title FROM journal_entries WHERE user_id = ? AND is_deleted = 0 AND image_key IS NOT NULL LIMIT 1 OFFSET ?`);
    const results = [];
    for (const offset of offsets) {
      results.push(fetchStmt.get(userId, offset));
    }
    return results;
  }

  const stmt = db.prepare(`SELECT id, image_key, title FROM journal_entries WHERE user_id = ? AND is_deleted = 0 AND image_key IS NOT NULL ORDER BY created_at DESC LIMIT 10`);
  return stmt.all(userId);
}

/**
 * Retrieves a single journal entry by its ID, including its tags.
 * @param {number} userId - The user's ID.
 * @param {number} journalId - The journal entry's ID.
 * @returns {object|null} The journal entry or null if not found.
 */
export function getJournalById(userId, journalId) {
  const stmt = db.prepare(`
        SELECT
            j.*,
            GROUP_CONCAT(t.name) AS mood_tags
        FROM journal_entries j
        LEFT JOIN journal_entry_tags jt ON j.id = jt.journal_entry_id
        LEFT JOIN tags t ON jt.tag_id = t.id
        WHERE j.id = ? AND j.user_id = ? AND j.is_deleted = 0
        GROUP BY j.id
    `);
  const row = stmt.get(journalId, userId);
  if (!row) return null;

  // Convert the comma-separated tags string back into an array.
  return {
    ...row,
    mood_tags: row.mood_tags ? row.mood_tags.split(',') : []
  };
}

/**
 * Retrieves mood and sentiment scores for a given date range.
 * @param {number} userId - The user's ID.
 * @param {number} range - The number of days to look back.
 * @returns {object[]}
 */
export function getMoodScores(userId, range) {
  // This function doesn't need to be changed as it doesn't interact with tags.
  const safeRange = parseInt(range, 10) || 7;
  const stmt = db.prepare(`
        SELECT mood_score, created_at, sentiment_score FROM journal_entries
        WHERE user_id = ? AND is_deleted = 0 AND created_at >= date('now', '-' || ? || ' days')
        ORDER BY created_at ASC
    `);
  return stmt.all(userId, safeRange);
}

/**
 * Updates an existing journal entry and its tags in a transaction.
 * @param {number} userId - The user's ID.
 * @param {number} journalId - The ID of the journal entry to update.
 * @param {object} entry - The updated journal entry data.
 * @returns {object|null} The updated journal entry or null if not found.
 */
export function updateJournalEntry(userId, journalId, entry) {
  const { title, content, mood_score, mood_tags = [], transcription } = entry;

  const sentiment_score = analyzeSentimentLocal(content || '');
  const updated_at = new Date().toISOString();

  const runTransaction = db.transaction(() => {
    // Step 1: Update the main journal entry.
    const updateStmt = db.prepare(`
            UPDATE journal_entries
            SET
                title = @title,
                content = @content,
                mood_score = @mood_score,
                sentiment_score = @sentiment_score,
                updated_at = @updated_at,
                synced = 0,
                sync_action = 'update',
                transcription = @transcription
            WHERE
                id = @journalId AND user_id = @userId
        `);

    const result = updateStmt.run({
      title: title || null,
      content: content || '',
      mood_score: mood_score || null,
      sentiment_score,
      updated_at,
      journalId,
      userId,
      transcription
    });

    if (result.changes === 0) {
      return null; // Entry didn't exist or wasn't updated.
    }

    // Step 2: Clear existing tag links for this entry.
    db.prepare('DELETE FROM journal_entry_tags WHERE journal_entry_id = ?').run(journalId);

    // Step 3: Add the new set of tags.
    if (mood_tags && mood_tags.length > 0) {
      const insertTagStmt = db.prepare('INSERT OR IGNORE INTO tags (user_id, name) VALUES (?, ?)');
      const selectTagStmt = db.prepare('SELECT id FROM tags WHERE user_id = ? AND name = ?');
      const linkTagStmt = db.prepare('INSERT INTO journal_entry_tags (journal_entry_id, tag_id) VALUES (?, ?)');

      for (const tagName of mood_tags) {
        insertTagStmt.run(userId, tagName);
        const tag = selectTagStmt.get(userId, tagName);
        if (tag) {
          linkTagStmt.run(journalId, tag.id);
        }
      }
    }

    return getJournalById(userId, journalId);
  });

  return runTransaction();
}

/**
 * Soft-deletes a journal entry. The cascade on delete will handle tag links upon a hard delete.
 * @param {number} userId - The user's ID.
 * @param {number} journalId - The ID of the journal entry to delete.
 * @returns {number} The number of rows changed.
 */
export function deleteJournalEntry(userId, journalId) {
  // Soft delete for offline mode to allow syncing the deletion.
  const stmt = db.prepare(`
        UPDATE journal_entries
        SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP, synced = 0, sync_action = 'delete'
        WHERE id = ? AND user_id = ?
    `);
  const result = stmt.run(journalId, userId);
  return result.changes;
}

export function addContentSummary(summary, journalId, userId) {
  const stmt = db.prepare(`
        UPDATE journal_entries
        SET content_summary = ?, updated_at = CURRENT_TIMESTAMP, synced = 0, sync_action = 'update'
        WHERE id = ? AND user_id = ?
    `);
  const result = stmt.run(summary, journalId, userId);
  return result.changes;
}

export const getPendingJournal = (userId) => {
  const stmt = db.prepare(`
        SELECT * FROM journal_entries 
        WHERE synced_to_qdrant = 'pending' AND user_id = ?
        ORDER BY created_at ASC 
        LIMIT 1
    `);
  return stmt.get(userId);
}

export const updateSyncStatus = (journalId, userId, status) => {
  const stmt = db.prepare(`
        UPDATE journal_entries
        SET synced_to_qdrant = ?
        WHERE id = ? AND user_id = ?
    `);
  const result = stmt.run(status, journalId, userId);
  return result.changes;
}
