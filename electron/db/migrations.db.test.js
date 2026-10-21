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
    // The two Qdrant columns are the one deliberate removal (migration 8).
    const dropped = ["synced_to_qdrant", "qdrant_id"];
    const kept = (row) =>
      Object.fromEntries(
        Object.entries(row).filter(([k]) => !dropped.includes(k)),
      );
    for (const key of ["users", "entries"]) {
      after[key].forEach((row, i) =>
        expect(row).toMatchObject(kept(before[key][i])),
      );
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

describe("the search-index migration", () => {
  it("adds one state row per item and only known kinds and states", () => {
    const { db } = open();
    runMigrations(db, MIGRATIONS.slice(0, 6));
    expect(tableNames(db)).not.toContain("search_index");
    expect(runMigrations(db, MIGRATIONS.slice(0, 7)).applied).toEqual([
      "search-index",
    ]);
    expect(indexNames(db)).toEqual(
      expect.arrayContaining([
        "idx_search_index_work",
        "idx_search_index_user",
      ]),
    );
    const add = db.prepare(
      "INSERT INTO search_index (user_id, source_type, source_id) VALUES (1, ?, ?)",
    );
    add.run("journal", 5);
    expect(() => add.run("journal", 5)).toThrow(/UNIQUE/);
    expect(() => add.run("chat", 5)).toThrow(/CHECK/);
    expect(
      db.prepare("SELECT state, attempts FROM search_index").get(),
    ).toEqual({ state: "pending", attempts: 0 });
    integrityOk(db);
  });
});

describe("the drop-qdrant-state migration", () => {
  it("removes the Qdrant bookkeeping and keeps every row", () => {
    const { db } = open();
    runMigrations(db, MIGRATIONS.slice(0, 7));
    const seeded = seedJournal(db, { users: 1, entriesPerUser: 4 });
    db.prepare(
      "INSERT INTO goals (user_id, title, target_value, unit, qdrant_id) VALUES (?, 'g', 1, 'x', 'abc')",
    ).run(seeded[0].userId);
    const goalId = db.prepare("SELECT id FROM goals").get().id;
    db.prepare(
      "INSERT INTO progress_logs (goal_id, value, description) VALUES (?, 1, 'd')",
    ).run(goalId);
    db.prepare(
      "INSERT INTO vector_deletions (user_id, source_type, source_id) VALUES (1, 'journal', 9)",
    ).run();
    const before = db.prepare("SELECT COUNT(*) n FROM journal_entries").get().n;

    expect(runMigrations(db, MIGRATIONS.slice(0, 8)).applied).toEqual([
      "drop-qdrant-state",
    ]);

    expect(tableNames(db)).not.toContain("vector_deletions");
    for (const table of ["journal_entries", "goals", "progress_logs"]) {
      expect(columnNames(db, table)).not.toContain("synced_to_qdrant");
      expect(columnNames(db, table)).not.toContain("qdrant_id");
    }
    expect(indexNames(db)).not.toContain("idx_goals_synced_to_qdrant");
    expect(indexNames(db)).not.toContain("idx_progress_logs_synced_to_qdrant");
    expect(db.prepare("SELECT COUNT(*) n FROM journal_entries").get().n).toBe(
      before,
    );
    expect(db.prepare("SELECT title FROM goals").get().title).toBe("g");
    expect(db.prepare("SELECT description FROM progress_logs").get()).toEqual({
      description: "d",
    });
    integrityOk(db);
  });
});

describe("the people-tables migration", () => {
  it("adds the People tables, all cascading from the user, entry or person", () => {
    const { db } = open();
    runMigrations(db, MIGRATIONS.slice(0, 8));
    const seeded = seedJournal(db, { users: 1, entriesPerUser: 2 });
    const before = db.prepare("SELECT COUNT(*) n FROM journal_entries").get().n;

    expect(runMigrations(db, MIGRATIONS.slice(0, 9)).applied).toEqual([
      "people-tables",
    ]);
    expect(tableNames(db)).toEqual(
      expect.arrayContaining([
        "people",
        "person_aliases",
        "person_mentions",
        "person_summaries",
        "people_jobs",
      ]),
    );
    expect(db.prepare("SELECT COUNT(*) n FROM journal_entries").get().n).toBe(
      before,
    );

    const { userId } = seeded[0];
    const [e1, e2] = db
      .prepare("SELECT id FROM journal_entries WHERE user_id = ? ORDER BY id")
      .all(userId)
      .map((r) => r.id);
    const person = Number(
      db
        .prepare(
          "INSERT INTO people (user_id, display_name, status) VALUES (?, 'Sam', 'confirmed')",
        )
        .run(userId).lastInsertRowid,
    );
    expect(() =>
      db
        .prepare(
          "INSERT INTO people (user_id, display_name, status) VALUES (?, 'X', 'maybe')",
        )
        .run(userId),
    ).toThrow(/CHECK/);
    const mention = db.prepare(
      "INSERT INTO person_mentions (entry_id, person_id, name_as_written, sentence_start, sentence_end, extractor_version) VALUES (?, ?, 'Sam', 0, 3, 1)",
    );
    mention.run(e1, person);
    mention.run(e2, person);
    db.prepare("INSERT INTO people_jobs (entry_id, user_id) VALUES (?, ?)").run(
      e1,
      userId,
    );

    db.prepare("DELETE FROM journal_entries WHERE id = ?").run(e1);
    const n = (sql) => db.prepare(sql).get().n;
    expect(n("SELECT COUNT(*) n FROM person_mentions")).toBe(1);
    expect(n("SELECT COUNT(*) n FROM people_jobs")).toBe(0);

    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    expect(n("SELECT COUNT(*) n FROM people")).toBe(0);
    expect(n("SELECT COUNT(*) n FROM person_mentions")).toBe(0);
    integrityOk(db);
  });
});

describe("the users-email-optional migration", () => {
  it("lets email be empty and keeps every user, entry, id and cascade", () => {
    const { db } = open();
    runMigrations(db, MIGRATIONS.slice(0, 9));
    const seeded = seedJournal(db, { users: 2, entriesPerUser: 3 });
    // The newest profile was deleted: its id must not be handed out again.
    const gone = Number(
      db
        .prepare(
          "INSERT INTO users (username, email, password_hash) VALUES ('gone', 'g@example.com', 'x')",
        )
        .run().lastInsertRowid,
    );
    db.prepare("DELETE FROM users WHERE id = ?").run(gone);
    const users = db.prepare("SELECT * FROM users ORDER BY id").all();
    const entries = db.prepare("SELECT * FROM journal_entries").all().length;

    expect(runMigrations(db).applied).toEqual(["users-email-optional"]);

    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(db.prepare("SELECT * FROM users ORDER BY id").all()).toEqual(users);
    expect(db.prepare("SELECT * FROM journal_entries").all()).toHaveLength(
      entries,
    );
    const add = db.prepare(
      "INSERT INTO users (username, email, password_hash) VALUES (?, ?, 'x')",
    );
    const a = Number(add.run("nomail1", null).lastInsertRowid);
    add.run("nomail2", null);
    expect(a).toBeGreaterThan(gone);
    expect(() => add.run("nomail1", null)).toThrow(/UNIQUE/);
    expect(() => add.run("dup", "user1@example.com")).toThrow(/UNIQUE/);

    // Child tables still point at users and still cascade.
    db.prepare("DELETE FROM users WHERE id = ?").run(seeded[0].userId);
    expect(
      db
        .prepare("SELECT count(*) n FROM journal_entries WHERE user_id = ?")
        .get(seeded[0].userId).n,
    ).toBe(0);
    integrityOk(db);
  });
});

describe("the trash migration", () => {
  it("stamps entries already soft-deleted with the upgrade time, and leaves live ones alone", () => {
    const { db } = open();
    runMigrations(db, MIGRATIONS.slice(0, 4));
    const seeded = seedJournal(db, { users: 1, entriesPerUser: 3 });
    const [live, deleted] = seeded;
    db.prepare(
      "UPDATE journal_entries SET is_deleted = 1, updated_at = '2026-01-05T08:30:00.000Z' WHERE id = ?",
    ).run(deleted.id);
    db.prepare(
      "INSERT INTO goals (user_id, title, target_value, unit) VALUES (?, 'g', 1, 'x')",
    ).run(live.userId);

    expect(runMigrations(db, MIGRATIONS.slice(0, 5)).applied).toEqual([
      "trash",
    ]);

    const row = (id) =>
      db
        .prepare(
          "SELECT is_deleted, deleted_at FROM journal_entries WHERE id = ?",
        )
        .get(id);
    expect(row(live.id)).toEqual({ is_deleted: 0, deleted_at: null });
    // Their 30 days start at the upgrade, not at the old deletion.
    const stamped = Date.parse(row(deleted.id).deleted_at);
    expect(Math.abs(Date.now() - stamped)).toBeLessThan(60_000);
    expect(
      db.prepare("SELECT is_deleted, deleted_at FROM goals").get(),
    ).toEqual({
      is_deleted: 0,
      deleted_at: null,
    });
    expect(tableNames(db)).toContain("vector_deletions");
    expect(indexNames(db)).toEqual(
      expect.arrayContaining([
        "idx_goals_user_deleted",
        "idx_journal_entries_trashed",
      ]),
    );
    integrityOk(db);
  });

  it("gives the index queue one row per item and only known kinds", () => {
    const { db } = open();
    runMigrations(db, MIGRATIONS.slice(0, 7));
    const add = db.prepare(
      "INSERT INTO vector_deletions (user_id, source_type, source_id) VALUES (1, ?, ?)",
    );
    add.run("journal", 5);
    expect(() => add.run("journal", 5)).toThrow(/UNIQUE/);
    expect(() => add.run("chat", 5)).toThrow(/CHECK/);
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

describe("the message-sources lookup migration", () => {
  it("adds the index the purge uses, and nothing else", () => {
    const { db } = open();
    runMigrations(db, MIGRATIONS.slice(0, 5));
    const names = () =>
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all()
        .map((r) => r.name);
    expect(names()).not.toContain("idx_message_sources_source");
    expect(runMigrations(db, MIGRATIONS.slice(0, 6)).applied).toEqual([
      "message-sources-lookup",
    ]);
    expect(names()).toContain("idx_message_sources_source");
    const plan = db
      .prepare(
        "EXPLAIN QUERY PLAN SELECT 1 FROM message_sources WHERE source_type = 'journal' AND source_id = '1'",
      )
      .all()
      .map((r) => r.detail)
      .join(" ");
    expect(plan).toContain("idx_message_sources_source");
  });
});
