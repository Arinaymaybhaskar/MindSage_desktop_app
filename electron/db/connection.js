import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { MIGRATIONS, runMigrations } from "./migrations.js";

// Where the database used to be resolved: next to Electron's userData on
// Windows, but ~/Library/Preferences on macOS and ~/.local/share on Linux,
// apart from the app's own logs and media. Still the fallback for processes
// with no Electron app object (the benchmark harness sets APPDATA).
const legacyDbPath = path.join(
  process.env.APPDATA ||
    (process.platform == "darwin"
      ? process.env.HOME + "/Library/Preferences"
      : process.env.HOME + "/.local/share"),
  "MindSage",
  "mind-sage.db",
);

/**
 * The database lives in Electron's userData (MS_DB_DIR, set by
 * userDataOverride.js before this module loads; the Qdrant worker inherits
 * it). On Windows that is the same file as before. Elsewhere, an existing
 * journal at the legacy path wins over an empty new location, so moving the
 * default can never present a user with a blank journal.
 */
function resolveDbPath() {
  if (!process.env.MS_DB_DIR) return legacyDbPath;
  const preferred = path.join(process.env.MS_DB_DIR, "mind-sage.db");
  // A scratch profile asked for by name gets its own database, never the
  // user's journal through the fallback below.
  if (process.env.MS_USER_DATA_DIR) return preferred;
  if (
    path.resolve(preferred) !== path.resolve(legacyDbPath) &&
    !fs.existsSync(preferred) &&
    fs.existsSync(legacyDbPath)
  ) {
    console.log(`Using the existing database at ${legacyDbPath}`);
    return legacyDbPath;
  }
  return preferred;
}

const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Create and export the database instance
export const db = new Database(dbPath);

// Per-connection and non-persistent, so it has to be set here rather than in
// the schema. It used to live inside the DDL, where it is a no-op once that
// DDL runs inside a transaction, and where the worker thread's own handle
// never reached it at all.
db.pragma("foreign_keys = ON");

// WAL lets the main process read while the Qdrant worker writes; in the
// default rollback journal every worker write blocked every read, measured at
// 200ms for a 1ms query (docs/benchmarks/FINDINGS.md §2). journal_mode is
// stored in the file, so this is a no-op after the first launch, and the
// worker's handle repeats it harmlessly. synchronous is per connection: NORMAL
// is durable against an app crash in WAL mode and can only lose the last
// commits on a power cut, which FULL would cost an fsync per write to prevent.
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

// A pre-migration snapshot is the user's only insurance: the database is the
// single copy of their journal and there is no undo for a bad ALTER.
const BACKUP_DIR_NAME = "backups";
const BACKUPS_TO_KEEP = 5;

function backupDatabase(fromVersion) {
  if (process.env.MS_SKIP_DB_BACKUP === "1") {
    console.log("Skipping database backup (MS_SKIP_DB_BACKUP=1)");
    return;
  }

  // Not fs.existsSync(dbPath): opening the handle above already created the
  // file, so a fresh install would otherwise write a useless empty backup.
  const tableCount = db
    .prepare(
      `SELECT count(*) AS n FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    )
    .get().n;
  if (tableCount === 0) return;

  // db.name rather than the dbPath constant, so backups follow the database
  // if it ever moves.
  const dir = path.join(path.dirname(db.name), BACKUP_DIR_NAME);
  fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(dir, `mind-sage-v${fromVersion}-${stamp}.db`);

  try {
    // VACUUM INTO rather than a file copy: once WAL is enabled a copy of the
    // main file alone is a silently incomplete snapshot, which is the worst
    // possible failure mode for a safety copy. This writes one
    // self-contained file with no sidecars, and is synchronous, unlike
    // db.backup().
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } catch (err) {
    // VACUUM INTO refuses on a corrupt database, where a raw byte copy still
    // salvages whatever is readable.
    console.error("VACUUM INTO failed, falling back to a file copy:", err);
    fs.copyFileSync(db.name, target);
    for (const suffix of ["-wal", "-shm"]) {
      if (fs.existsSync(db.name + suffix)) {
        fs.copyFileSync(db.name + suffix, target + suffix);
      }
    }
  }

  console.log(`Backed up the database to ${target}`);
  pruneBackups(dir);
}

function pruneBackups(dir) {
  // Only ever after a successful write, so a failed prune cannot leave zero
  // backups behind.
  try {
    const backups = fs
      .readdirSync(dir)
      .filter((name) => name.startsWith("mind-sage-v") && name.endsWith(".db"))
      .sort(); // ISO stamps sort chronologically
    for (const stale of backups.slice(0, -BACKUPS_TO_KEEP)) {
      fs.rmSync(path.join(dir, stale), { force: true });
      fs.rmSync(path.join(dir, stale + "-wal"), { force: true });
      fs.rmSync(path.join(dir, stale + "-shm"), { force: true });
    }
  } catch (err) {
    console.error("Could not prune old database backups:", err);
  }
}

export function initDatabase() {
  // Throws if the backup fails, rather than migrating unprotected. The caller
  // in main.js boots on regardless, which means a stale schema and visible
  // query failures, but the user's data intact.
  const { from, to, applied } = runMigrations(db, MIGRATIONS, {
    beforeMigrate: backupDatabase,
  });

  if (applied.length) {
    console.log(
      `Database migrated from version ${from} to ${to}: ${applied.join(", ")}`,
    );
  }

  // Seeding stays outside the migration list and keeps running every launch,
  // so a deleted system user or category recovers on the next start.

  // Insert a system user if it doesn't exist
  const insertSystemUser = db.prepare(`
        INSERT OR IGNORE INTO users (id, username, email, password_hash, full_name)
        VALUES (0, 'System', 'system@mindsage.app', 'N/A', 'System User')
    `);
  insertSystemUser.run();

  // Seed global categories for the system user
  const categories = [
    { name: "Health", color: "#FF6B6B" },
    { name: "Work", color: "#4ECDC4" },
    { name: "Finance", color: "#FFD93D" },
    { name: "Personal Growth", color: "#6A4C93" },
    { name: "Leisure", color: "#1A535C" },
  ];

  const insertCategory = db.prepare(`
        INSERT OR IGNORE INTO categories (user_id, name, color)
        VALUES (0, ?, ?)
    `);

  categories.forEach((cat) => {
    insertCategory.run(cat.name, cat.color);
  });

  console.log(`Local database ready at schema version ${to}.`);
}
