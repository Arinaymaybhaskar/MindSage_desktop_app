// Helpers for the *.db.test.js files, which run under Electron as Node
// (`npm run test:db`) against a real better-sqlite3 database in a temp folder.
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function tempDir(label = "mindsage-db") {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
}

/** A database with the same per-connection settings connection.js applies. */
export function openDb(file) {
  const d = new Database(file);
  d.pragma("foreign_keys = ON");
  d.pragma("journal_mode = WAL");
  return d;
}

export const tableNames = (d) =>
  d
    .prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    .all()
    .map((r) => r.name);

export const indexNames = (d) =>
  d
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`)
    .all()
    .map((r) => r.name);

export const columnNames = (d, table) =>
  d
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name);

/**
 * Brings a database to the shape an install had before migrations were
 * versioned: the baseline schema without the columns added later, the two
 * Daily Challenge tables still present, and user_version 0.
 */
export function makePreVersioningDb(d, MIGRATIONS) {
  MIGRATIONS[0].up(d);
  for (const col of [
    "ai_metadata_status",
    "ai_summary_status",
    "ai_metadata_error",
    "ai_summary_error",
  ]) {
    if (columnNames(d, "journal_entries").includes(col)) {
      d.exec(`ALTER TABLE journal_entries DROP COLUMN ${col}`);
    }
  }
  if (columnNames(d, "users").includes("profile_picture")) {
    d.exec(`ALTER TABLE users DROP COLUMN profile_picture`);
  }
  d.exec(`
    CREATE TABLE IF NOT EXISTS daily_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT
    );
    CREATE TABLE IF NOT EXISTS user_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      challenge_id INTEGER NOT NULL,
      FOREIGN KEY (challenge_id) REFERENCES daily_challenges(id)
    );
    INSERT INTO daily_challenges (title) VALUES ('old challenge');
  `);
  d.pragma("user_version = 0");
}

/** Users, entries and tags in whatever shape the schema at hand allows. */
export function seedJournal(d, { users = 2, entriesPerUser = 3 } = {}) {
  const insertUser = d.prepare(
    `INSERT INTO users (username, email, password_hash, full_name)
     VALUES (?, ?, 'x', ?)`,
  );
  const insertEntry = d.prepare(
    `INSERT INTO journal_entries
       (user_id, title, content, mood_score, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertTag = d.prepare(
    `INSERT OR IGNORE INTO tags (user_id, name) VALUES (?, ?)`,
  );
  const tagId = d.prepare(`SELECT id FROM tags WHERE user_id = ? AND name = ?`);
  const link = d.prepare(
    `INSERT INTO journal_entry_tags (journal_entry_id, tag_id) VALUES (?, ?)`,
  );
  const out = [];
  d.transaction(() => {
    for (let u = 1; u <= users; u++) {
      const userId = Number(
        insertUser.run(`user${u}`, `user${u}@example.com`, `User ${u}`)
          .lastInsertRowid,
      );
      for (let e = 0; e < entriesPerUser; e++) {
        const at = new Date(Date.UTC(2026, 0, 1 + e, 9)).toISOString();
        const id = Number(
          insertEntry.run(
            userId,
            `Entry ${u}.${e}`,
            `Content ${u}.${e} — café ☕ 日本語`,
            (e % 5) + 1,
            at,
            at,
          ).lastInsertRowid,
        );
        insertTag.run(userId, "calm");
        link.run(id, tagId.get(userId, "calm").id);
        out.push({ id, userId, title: `Entry ${u}.${e}` });
      }
    }
  })();
  return out;
}
