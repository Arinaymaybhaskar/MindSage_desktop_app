import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MIGRATIONS } from "./migrations.js";
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
