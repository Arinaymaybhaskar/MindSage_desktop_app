import { db } from './connection.js';
import Sentiment from 'sentiment';

const sentiment = new Sentiment();

// A simple local sentiment analyzer
const analyzeSentimentLocal = (text) => {
    if (!text) return 0;
    const result = sentiment.analyze(text);
    // Normalize the score to be between -1 and 1
    const score = Math.max(-1, Math.min(1, result.score / 10));
    return score;
};

export function createJournalEntry(userId, entry) {
    const { title, content, mood_score, mood_tags } = entry;

    console.log(entry);

    const sentiment_score = analyzeSentimentLocal(content || '');
    const moodTagsJSON = JSON.stringify(mood_tags || []);

    const now = new Date().toISOString(); // UTC timestamp with 'Z'

    const stmt = db.prepare(`
    INSERT INTO journal_entries (
      user_id,
      title,
      content,
      mood_score,
      sentiment_score,
      mood_tags,
      created_at,
      updated_at,
      synced,
      sync_action
    ) VALUES (
      @userId,
      @title,
      @content,
      @mood_score,
      @sentiment_score,
      @mood_tags,
      @created_at,
      @updated_at,
      0,
      'create'
    )
  `);

    console.log(
        userId,
        title,
        content,
        mood_score,
        sentiment_score,
        moodTagsJSON,
        now,
        now,
        0,
        'create',
        "params++++++++++++++++++++"
    );

    const result = stmt.run({
        userId,
        title: title || null,
        content: content || '',
        mood_score: mood_score || null,
        sentiment_score,
        mood_tags: moodTagsJSON,
        created_at: now,
        updated_at: now
    });

    return {
        journalId: result.lastInsertRowid,
        userId
    };
}

export function getRecentEntries(userId) {
    const stmt = db.prepare('SELECT * FROM journal_entries WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at DESC LIMIT 3');
    return stmt.all(userId);
}

export function getAllEntries(userId) {
    const stmt = db.prepare('SELECT * FROM journal_entries WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at DESC');
    return stmt.all(userId);
}

export function getJournalById(userId, journalId) {
    const stmt = db.prepare('SELECT * FROM journal_entries WHERE id = ? AND user_id = ? AND is_deleted = 0');
    return stmt.get(journalId, userId);
}

export function getMoodScores(userId, range) {
    // Ensure range is a number to prevent SQL injection
    const safeRange = parseInt(range, 10) || 7;
    const stmt = db.prepare(`
        SELECT mood_score, created_at FROM journal_entries
        WHERE user_id = ? AND is_deleted = 0 AND created_at >= date('now', '-' || ? || ' days')
        ORDER BY created_at ASC
    `);
    return stmt.all(userId, safeRange);
}

export function updateJournalEntry(userId, journalId, entry) {
    const { title, content, mood_score, mood_tags } = entry;

    const sentiment_score = analyzeSentimentLocal(content || '');
    const moodTagsJSON = JSON.stringify(mood_tags || []);
    const updated_at = new Date().toISOString(); // UTC ISO 8601 string with Z

    const stmt = db.prepare(`
    UPDATE journal_entries 
    SET 
      title = @title,
      content = @content,
      mood_score = @mood_score,
      sentiment_score = @sentiment_score,
      mood_tags = @mood_tags,
      updated_at = @updated_at,
      synced = 0,
      sync_action = 'update'
    WHERE 
      id = @journalId AND user_id = @userId
  `);

    const result = stmt.run({
        title: title || null,
        content: content || '',
        mood_score: mood_score || null,
        sentiment_score,
        mood_tags: moodTagsJSON,
        updated_at,
        journalId,
        userId
    });

    return result.changes > 0 ? getJournalById(userId, journalId) : null;
}
export function deleteJournalEntry(userId, journalId) {
    // Soft delete for offline mode to allow syncing the deletion
    const stmt = db.prepare(`
        UPDATE journal_entries 
        SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP, synced = 0, sync_action = 'delete'
        WHERE id = ? AND user_id = ?
    `);
    const result = stmt.run(journalId, userId);
    return result.changes;
}
