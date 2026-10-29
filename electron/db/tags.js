import { db } from "./connection.js";

// Feeling words the user wrote in their own words (KAN-94): a tag row with the
// family they picked. Built-in words keep family NULL.

/** The user's own words with their family, most used first. */
export function customFeelingWords(userId, limit = -1) {
  return db
    .prepare(
      `SELECT t.name, t.family, COUNT(je.id) AS uses
         FROM tags t
         LEFT JOIN journal_entry_tags jt ON jt.tag_id = t.id
         LEFT JOIN journal_entries je
                ON je.id = jt.journal_entry_id AND je.is_deleted = 0
        WHERE t.user_id = ? AND t.family IS NOT NULL
        GROUP BY t.id
        ORDER BY uses DESC, t.name
        LIMIT ?`,
    )
    .all(userId, limit);
}

/** Every tag name the user has, for matching a typed word against. */
export function tagNames(userId) {
  return db
    .prepare(`SELECT name, family FROM tags WHERE user_id = ?`)
    .all(userId);
}

/**
 * Keeps a word with its family. A tag of that exact name that has no family
 * yet (an imported one) takes this one; a family already set stays.
 */
export function saveCustomFeelingWord(userId, name, family) {
  return db
    .prepare(
      `INSERT INTO tags (user_id, name, family) VALUES (?, ?, ?)
       ON CONFLICT(user_id, name)
       DO UPDATE SET family = COALESCE(tags.family, excluded.family)
       RETURNING name, family`,
    )
    .get(userId, name, family);
}
