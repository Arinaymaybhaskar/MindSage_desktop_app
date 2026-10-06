/**
 * Versioned schema migrations, tracked in `PRAGMA user_version`.
 *
 * The CREATE TABLE IF NOT EXISTS block in connection.js is the version-0
 * schema. Every change after it goes here as a new entry with the next
 * version number, never as another ad-hoc ALTER in initDatabase(): this list
 * is what decides whether a backup is taken first.
 *
 * Each `up` runs inside a transaction together with the user_version bump, so
 * a migration either lands completely or not at all. Write `up` to be
 * idempotent anyway. Version 1 adopts the column checks that predate this
 * file, so it runs against databases that already have some of its columns.
 *
 * Pure apart from fs: it takes the database as an argument and never imports
 * better-sqlite3, which keeps it testable under vitest.
 */

import fs from "node:fs";
import path from "node:path";

/** How many pre-migration backups to keep. The oldest are pruned. */
export const BACKUPS_KEPT = 5;

const hasColumn = (db, table, column) =>
  db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === column);

export const MIGRATIONS = [
  {
    version: 1,
    name: "adopt the pre-versioning column checks",
    up(db) {
      if (!hasColumn(db, "users", "profile_picture")) {
        db.prepare(`ALTER TABLE users ADD COLUMN profile_picture TEXT`).run();
      }
      const journalColumns = [
        [
          "ai_metadata_status",
          `TEXT DEFAULT 'not_started' CHECK(ai_metadata_status IN ('not_started','pending','completed','failed'))`,
        ],
        [
          "ai_summary_status",
          `TEXT DEFAULT 'not_started' CHECK(ai_summary_status IN ('not_started','pending','completed','failed','skipped'))`,
        ],
        ["ai_metadata_error", "TEXT"],
        ["ai_summary_error", "TEXT"],
      ];
      for (const [column, definition] of journalColumns) {
        if (!hasColumn(db, "journal_entries", column)) {
          db.prepare(
            `ALTER TABLE journal_entries ADD COLUMN ${column} ${definition}`,
          ).run();
        }
      }
    },
  },
];

export const LATEST_VERSION = MIGRATIONS.at(-1).version;

export const schemaVersion = (db) =>
  db.pragma("user_version", { simple: true });

/** True when the file holds tables, i.e. it is not a brand-new install. */
export const hasUserData = (db) =>
  db
    .prepare(`SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'`)
    .get().n > 0;

/**
 * Copies the database to `<dir>/mind-sage-<timestamp>-v<version>.db`.
 *
 * VACUUM INTO writes a consistent snapshot through SQLite itself, so it is
 * safe while the connection is open, unlike copying the file. Throws on
 * failure, and the caller must not migrate if it does: an unprotected
 * migration is exactly what this exists to prevent.
 */
export function backupDatabase(db, dir, fromVersion, now = new Date()) {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `mind-sage-${stamp}-v${fromVersion}.db`);
  db.prepare("VACUUM INTO ?").run(file);
  pruneBackups(dir, BACKUPS_KEPT);
  return file;
}

/** Deletes all but the newest `keep` backups. Timestamps sort by name. */
export function pruneBackups(dir, keep) {
  const backups = fs
    .readdirSync(dir)
    .filter((f) => /^mind-sage-.+-v\d+\.db$/.test(f))
    .sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - keep))) {
    fs.rmSync(path.join(dir, old), { force: true });
  }
}

/**
 * Applies every migration newer than the database's user_version, in order.
 *
 * A database newer than this build (a downgrade) is left untouched: its
 * schema is unknown here, and rewriting it is how a downgrade loses data.
 */
export function runMigrations(db, migrations = MIGRATIONS) {
  const from = schemaVersion(db);
  const latest = migrations.at(-1).version;
  if (from > latest) {
    return { from, to: from, applied: [], newerThanApp: true };
  }
  const pending = migrations.filter((m) => m.version > from);
  for (const migration of pending) {
    db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    })();
  }
  return {
    from,
    to: pending.at(-1)?.version ?? from,
    applied: pending.map((m) => m.version),
    newerThanApp: false,
  };
}
