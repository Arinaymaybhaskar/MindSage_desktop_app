import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MIGRATIONS, runMigrations } from "./migrations.js";
import {
  makePreVersioningDb,
  openDb,
  seedJournal,
  tempDir,
} from "./dbTestUtils.js";

// initDatabase() snapshots the journal before it migrates it. This is the
// only copy a user has if a migration goes wrong, so it is tested for real:
// the old database is built first, then connection.js is imported against it.
const dir = tempDir("mindsage-backup");
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const backups = () => {
  const d = path.join(dir, "backups");
  return fs.existsSync(d) ? fs.readdirSync(d).sort() : [];
};

describe("the pre-migration backup", () => {
  it("is taken from an old database, readable on its own, with the old data", async () => {
    // An install from before versioning, with entries in it.
    const file = path.join(dir, "mind-sage.db");
    const old = openDb(file);
    makePreVersioningDb(old, MIGRATIONS);
    const seeded = seedJournal(old, { users: 2, entriesPerUser: 5 });
    old.close();

    process.env.MS_DB_DIR = dir;
    process.env.MS_USER_DATA_DIR = dir;
    delete process.env.MS_SKIP_DB_BACKUP;
    const { initDatabase, db } = await import("./connection.js");
    initDatabase();

    // The live database was migrated...
    expect(db.pragma("user_version", { simple: true })).toBe(
      MIGRATIONS.at(-1).version,
    );
    expect(db.prepare("SELECT count(*) n FROM journal_entries").get().n).toBe(
      seeded.length,
    );

    // ...and one self-contained snapshot of the old version exists.
    const made = backups();
    expect(made).toHaveLength(1);
    expect(made[0]).toMatch(/^mind-sage-v0-.*\.db$/);
    expect(fs.readdirSync(path.join(dir, "backups"))).toEqual(made); // no -wal/-shm sidecars

    const snapshot = openDb(path.join(dir, "backups", made[0]));
    expect(snapshot.pragma("user_version", { simple: true })).toBe(0);
    expect(
      snapshot.prepare("SELECT count(*) n FROM journal_entries").get().n,
    ).toBe(seeded.length);
    expect(
      snapshot
        .prepare("SELECT title FROM journal_entries ORDER BY id LIMIT 1")
        .get().title,
    ).toBe(seeded[0].title);
    expect(snapshot.pragma("integrity_check", { simple: true })).toBe("ok");
    snapshot.close();
  });

  it("is not written for a brand-new install, which has nothing to protect", async () => {
    const fresh = tempDir("mindsage-fresh");
    try {
      vi.resetModules(); // connection.js opens its database on import
      process.env.MS_DB_DIR = fresh;
      process.env.MS_USER_DATA_DIR = fresh;
      const { initDatabase } = await import("./connection.js");
      initDatabase();
      expect(fs.existsSync(path.join(fresh, "backups"))).toBe(false);
    } finally {
      fs.rmSync(fresh, { recursive: true, force: true });
    }
  });

  it("is not taken again when there is nothing to migrate", async () => {
    vi.resetModules();
    process.env.MS_DB_DIR = dir;
    process.env.MS_USER_DATA_DIR = dir;
    const { initDatabase } = await import("./connection.js");
    initDatabase();
    initDatabase();
    expect(backups()).toHaveLength(1);
  });
});

describe("replacing the backups when a profile is deleted (KAN-344)", () => {
  it("swaps old snapshots for one made after the rows were removed", async () => {
    vi.resetModules();
    process.env.MS_DB_DIR = dir;
    process.env.MS_USER_DATA_DIR = dir;
    delete process.env.MS_SKIP_DB_BACKUP;
    const { initDatabase, db, replaceBackups } =
      await import("./connection.js");
    initDatabase();

    const phrase = "zebra-secret-phrase-8c1f";
    const userId = Number(
      db
        .prepare(
          "INSERT INTO users (username, email, password_hash) VALUES ('gone', 'gone@example.com', 'x')",
        )
        .run().lastInsertRowid,
    );
    db.prepare(
      "INSERT INTO journal_entries (user_id, title, content) VALUES (?, 'title', ?)",
    ).run(userId, phrase);

    // A safety copy made while the profile still existed.
    const old = path.join(
      dir,
      "backups",
      "mind-sage-v1-2020-01-01T00-00-00-000Z.db",
    );
    db.exec(`VACUUM INTO '${old.replace(/'/g, "''")}'`);
    expect(fs.readFileSync(old).includes(phrase)).toBe(true);

    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    const result = replaceBackups();

    expect(result.replaced).toBe(true);
    expect(result.removed).toBeGreaterThanOrEqual(2); // the old ones are gone
    expect(fs.existsSync(old)).toBe(false);
    const left = backups();
    expect(left).toHaveLength(1);
    const bytes = fs.readFileSync(path.join(dir, "backups", left[0]));
    expect(bytes.includes(phrase)).toBe(false);
    const snapshot = openDb(path.join(dir, "backups", left[0]));
    expect(snapshot.pragma("user_version", { simple: true })).toBe(
      MIGRATIONS.at(-1).version,
    );
    snapshot.close();
  });
});

describe("a migration that fails on every launch (KAN-487)", () => {
  const folders = [];
  afterAll(() => {
    vi.doUnmock("./migrations.js");
    for (const f of folders) fs.rmSync(f, { recursive: true, force: true });
  });

  // A journal at the current schema version, with entries in it.
  const journal = () => {
    const folder = tempDir("mindsage-stuck");
    folders.push(folder);
    const d = openDb(path.join(folder, "mind-sage.db"));
    runMigrations(d, MIGRATIONS);
    seedJournal(d, { users: 1, entriesPerUser: 3 });
    d.close();
    return folder;
  };

  // One launch of the app with one more migration that always throws; the
  // handle is closed afterwards, as quitting would.
  const launch = async (folder) => {
    vi.resetModules();
    vi.doMock("./migrations.js", async (importOriginal) => {
      const real = await importOriginal();
      const failing = {
        version: real.MIGRATIONS.at(-1).version + 1,
        name: "always_fails",
        up() {
          throw new Error("always fails");
        },
      };
      return { ...real, MIGRATIONS: [...real.MIGRATIONS, failing] };
    });
    process.env.MS_DB_DIR = folder;
    process.env.MS_USER_DATA_DIR = folder;
    delete process.env.MS_SKIP_DB_BACKUP;
    const { initDatabase, db } = await import("./connection.js");
    try {
      expect(() => initDatabase()).toThrow("always fails");
    } finally {
      db.close();
    }
  };

  const listIn = (folder) => fs.readdirSync(path.join(folder, "backups"));

  const writeEntry = (folder, n) => {
    const d = openDb(path.join(folder, "mind-sage.db"));
    d.prepare(
      "INSERT INTO journal_entries (user_id, title, content) VALUES (1, ?, 'written on the old schema')",
    ).run(`Entry ${n}`);
    d.close();
  };

  it("takes one backup, not one per launch, while the journal is unchanged", async () => {
    const folder = journal();
    await launch(folder);
    await launch(folder);
    const made = listIn(folder);
    expect(made).toHaveLength(1);
    expect(made[0]).toMatch(
      new RegExp(`^mind-sage-v${MIGRATIONS.at(-1).version}-.*\\.db$`),
    );
  });

  it("never pushes out the older good snapshots", async () => {
    const folder = journal();
    const dir = path.join(folder, "backups");
    fs.mkdirSync(dir);
    const good = [
      "mind-sage-v9-2020-01-01T00-00-00-000Z.db",
      "mind-sage-v12-2020-01-02T00-00-00-000Z.db",
    ];
    for (const name of good) fs.writeFileSync(path.join(dir, name), "good");

    // Entries written between launches, so each launch has something new.
    for (let n = 0; n < 6; n++) {
      writeEntry(folder, n);
      await launch(folder);
    }

    const left = listIn(folder);
    expect(left).toHaveLength(5);
    for (const name of good) expect(left).toContain(name);
  });

  it("keeps the backup it just took when older ones have one-digit versions", async () => {
    const folder = journal();
    const dir = path.join(folder, "backups");
    fs.mkdirSync(dir);
    for (const v of [4, 5, 6, 7, 8]) {
      const name = `mind-sage-v${v}-2020-01-0${v}T00-00-00-000Z.db`;
      fs.writeFileSync(path.join(dir, name), "good");
    }
    await launch(folder);
    const left = listIn(folder);
    expect(left).toHaveLength(5);
    expect(left).not.toContain("mind-sage-v4-2020-01-04T00-00-00-000Z.db");
    expect(
      left.some((n) =>
        n.startsWith(`mind-sage-v${MIGRATIONS.at(-1).version}-`),
      ),
    ).toBe(true);
  });
});
