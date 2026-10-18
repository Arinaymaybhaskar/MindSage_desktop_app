import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { LATEST_VERSION, MIGRATIONS, runMigrations } from "./migrations.js";
import {
  columnNames,
  indexNames,
  makePreVersioningDb,
  openDb,
  seedJournal,
  tableNames,
  tempDir,
} from "./dbTestUtils.js";

// Real SQLite, real DDL. The unit tests in migrations.test.js use a fake
// database to pin the runner's behaviour; these pin what the migrations do.

const dirs = [];
const open = (name = "t.db") => {
  const dir = tempDir();
  dirs.push(dir);
  return { dir, db: openDb(path.join(dir, name)) };
};
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
});

const version = (d) => d.pragma("user_version", { simple: true });
const integrityOk = (d) => {
  expect(d.pragma("integrity_check", { simple: true })).toBe("ok");
  expect(d.pragma("foreign_key_check")).toEqual([]);
};

describe("the migration list", () => {
  it("is contiguous from 1, so no version can be skipped or removed quietly", () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual(
      MIGRATIONS.map((_, i) => i + 1),
    );
    expect(LATEST_VERSION).toBe(MIGRATIONS.length);
    expect(new Set(MIGRATIONS.map((m) => m.name)).size).toBe(MIGRATIONS.length);
  });
});

describe("a fresh database", () => {
  it("reaches the latest version with the whole schema and a clean integrity check", () => {
    const { db } = open();
    const result = runMigrations(db);
    expect(result.to).toBe(LATEST_VERSION);
    expect(version(db)).toBe(LATEST_VERSION);
    expect(tableNames(db)).toEqual(
      expect.arrayContaining([
        "users",
        "user_settings",
        "journal_entries",
        "tags",
        "journal_entry_tags",
        "categories",
        "goals",
        "progress_logs",
        "chats",
        "messages",
        "files",
        "message_sources",
      ]),
    );
    expect(tableNames(db)).not.toContain("user_challenges");
    expect(tableNames(db)).not.toContain("daily_challenges");
    expect(columnNames(db, "journal_entries")).toEqual(
      expect.arrayContaining([
        "ai_metadata_status",
        "ai_summary_status",
        "ai_metadata_error",
        "ai_summary_error",
      ]),
    );
    expect(columnNames(db, "users")).toContain("profile_picture");
    expect(indexNames(db)).toContain(
      "idx_journal_entries_user_deleted_created",
    );
    integrityOk(db);
  });

  it("does nothing the second time", () => {
    const { db } = open();
    runMigrations(db);
    expect(runMigrations(db)).toEqual({
      from: LATEST_VERSION,
      to: LATEST_VERSION,
      applied: [],
    });
  });
});

describe("each migration on top of the last, with data in the tables", () => {
  it("applies one at a time, stamps its own version, and never loses a row", () => {
    const { db } = open();
    let seeded = null;
    for (const migration of MIGRATIONS) {
      const result = runMigrations(db, MIGRATIONS.slice(0, migration.version));
      expect(result.applied).toEqual([migration.name]);
      expect(version(db)).toBe(migration.version);
      if (migration.version === 1) {
        seeded = seedJournal(db);
        db.exec(`UPDATE users SET full_name = full_name`); // touch, still valid
      }
      expect(
        db.prepare("SELECT count(*) n FROM journal_entries").get().n,
        `after v${migration.version}`,
      ).toBe(seeded.length);
      integrityOk(db);
    }
    // Content survived byte for byte, including non-ASCII text.
    const row = db
      .prepare("SELECT content FROM journal_entries WHERE id = ?")
      .get(seeded[0].id);
    expect(row.content).toBe("Content 1.0 — café ☕ 日本語");
  });
});

describe("an install from before migrations were versioned", () => {
  function preVersioning() {
    const ctx = open();
    makePreVersioningDb(ctx.db, MIGRATIONS);
    const seeded = seedJournal(ctx.db, { users: 3, entriesPerUser: 4 });
    ctx.db
      .prepare(
        "INSERT INTO user_challenges (user_id, challenge_id) VALUES (1, 1)",
      )
      .run();
    return { ...ctx, seeded };
  }

  it("really is the old shape before it is migrated (the fixture is honest)", () => {
    const { db } = preVersioning();
    expect(version(db)).toBe(0);
    expect(columnNames(db, "journal_entries")).not.toContain(
      "ai_metadata_status",
    );
    expect(columnNames(db, "users")).not.toContain("profile_picture");
    expect(tableNames(db)).toContain("user_challenges");
    expect(indexNames(db)).not.toContain(
      "idx_journal_entries_user_deleted_created",
    );
  });

  it("upgrades to the latest version and keeps every user, entry and tag", () => {
    const { db, seeded } = preVersioning();
    const before = {
      users: db.prepare("SELECT * FROM users ORDER BY id").all(),
      entries: db.prepare("SELECT * FROM journal_entries ORDER BY id").all(),
      links: db.prepare("SELECT * FROM journal_entry_tags ORDER BY 1, 2").all(),
    };

    const result = runMigrations(db);
    expect(result.from).toBe(0);
    expect(result.to).toBe(LATEST_VERSION);

    const after = {
      users: db.prepare("SELECT * FROM users ORDER BY id").all(),
      entries: db.prepare("SELECT * FROM journal_entries ORDER BY id").all(),
      links: db.prepare("SELECT * FROM journal_entry_tags ORDER BY 1, 2").all(),
    };
    expect(after.entries).toHaveLength(seeded.length);
    // Every pre-existing column is unchanged; new ones only add to the row.
    for (const key of ["users", "entries"]) {
      after[key].forEach((row, i) => expect(row).toMatchObject(before[key][i]));
    }
    expect(after.links).toEqual(before.links);

    // New columns arrive with the defaults the app relies on.
    const entry = db.prepare("SELECT * FROM journal_entries LIMIT 1").get();
    expect(entry.ai_metadata_status).toBe("not_started");
    expect(entry.ai_summary_status).toBe("not_started");
    expect(entry.ai_metadata_error).toBeNull();
    expect(columnNames(db, "users")).toContain("profile_picture");
    // The Daily Challenge tables, and their rows, are gone.
    expect(tableNames(db)).not.toContain("user_challenges");
    expect(tableNames(db)).not.toContain("daily_challenges");
    integrityOk(db);
  });

  it("enforces the AI status CHECK constraints it added", () => {
    const { db, seeded } = preVersioning();
    runMigrations(db);
    expect(() =>
      db
        .prepare(
          "UPDATE journal_entries SET ai_metadata_status = 'bogus' WHERE id = ?",
        )
        .run(seeded[0].id),
    ).toThrow(/CHECK constraint/);
    db.prepare(
      "UPDATE journal_entries SET ai_summary_status = 'skipped' WHERE id = ?",
    ).run(seeded[0].id);
  });

  it("makes the journal list query use the new index", () => {
    const { db } = preVersioning();
    runMigrations(db);
    const plan = db
      .prepare(
        `EXPLAIN QUERY PLAN SELECT * FROM journal_entries
          WHERE user_id = 1 AND is_deleted = 0
          ORDER BY created_at DESC LIMIT 10`,
      )
      .all()
      .map((r) => r.detail)
      .join("\n");
    expect(plan).toMatch(/idx_journal_entries_user_deleted_created/);
  });
});

describe("a migration that fails", () => {
  it("leaves the database at the last version that fully applied, with its data", () => {
    const { db } = open();
    runMigrations(db);
    const seeded = seedJournal(db);
    const broken = [
      ...MIGRATIONS,
      {
        version: LATEST_VERSION + 1,
        name: "half-done",
        up: (d) => {
          d.exec("ALTER TABLE journal_entries ADD COLUMN scratch TEXT");
          d.exec("DELETE FROM journal_entries"); // destructive, then it dies
          throw new Error("boom");
        },
      },
    ];
    expect(() => runMigrations(db, broken)).toThrow("boom");
    expect(version(db)).toBe(LATEST_VERSION);
    expect(columnNames(db, "journal_entries")).not.toContain("scratch");
    expect(db.prepare("SELECT count(*) n FROM journal_entries").get().n).toBe(
      seeded.length,
    );
    integrityOk(db);
  });
});

describe("a journal of 5,000 entries", () => {
  it("migrates from before versioning in well under a minute, losing nothing", () => {
    const { db } = open();
    makePreVersioningDb(db, MIGRATIONS);
    const insert = db.prepare(
      `INSERT INTO users (username, email, password_hash) VALUES ('big', 'big@example.com', 'x')`,
    );
    const userId = Number(insert.run().lastInsertRowid);
    const add = db.prepare(
      `INSERT INTO journal_entries (user_id, title, content, mood_score, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    db.transaction(() => {
      for (let i = 0; i < 5000; i++) {
        const at = new Date(Date.UTC(2020, 0, 1) + i * 3_600_000).toISOString();
        add.run(
          userId,
          `Entry ${i}`,
          `Body of entry ${i}. `.repeat(40),
          (i % 5) + 1,
          at,
          at,
        );
      }
    })();

    const started = performance.now();
    const result = runMigrations(db);
    const seconds = (performance.now() - started) / 1000;

    expect(result.to).toBe(LATEST_VERSION);
    expect(seconds).toBeLessThan(60);
    expect(db.prepare("SELECT count(*) n FROM journal_entries").get().n).toBe(
      5000,
    );
    integrityOk(db);
    console.log(`5,000-entry migration took ${seconds.toFixed(2)} s`);
  });
});
