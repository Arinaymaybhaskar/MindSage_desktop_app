import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LATEST_VERSION,
  MIGRATIONS,
  backupDatabase,
  pruneBackups,
  runMigrations,
} from "./migrations.js";

/**
 * Just enough of better-sqlite3 for the runner: user_version, transactions
 * that roll the version back on a throw, and a log of what ran.
 */
function fakeDb(userVersion = 0) {
  const db = {
    userVersion,
    log: [],
    pragma(sql) {
      if (sql === "user_version") return db.userVersion;
      const match = /^user_version = (\d+)$/.exec(sql);
      if (match) db.userVersion = Number(match[1]);
    },
    transaction(fn) {
      return () => {
        const before = db.userVersion;
        try {
          fn();
        } catch (err) {
          db.userVersion = before;
          throw err;
        }
      };
    },
  };
  return db;
}

const migration = (version, onUp) => ({
  version,
  name: `m${version}`,
  up(db) {
    db.log.push(version);
    onUp?.();
  },
});

describe("runMigrations", () => {
  it("applies pending migrations in order and records the version", () => {
    const db = fakeDb(0);
    const result = runMigrations(db, [
      migration(1),
      migration(2),
      migration(3),
    ]);
    expect(db.log).toEqual([1, 2, 3]);
    expect(db.userVersion).toBe(3);
    expect(result).toMatchObject({ from: 0, to: 3, applied: [1, 2, 3] });
  });

  it("skips migrations the database already has", () => {
    const db = fakeDb(2);
    runMigrations(db, [migration(1), migration(2), migration(3)]);
    expect(db.log).toEqual([3]);
  });

  it("does nothing on an up-to-date database", () => {
    const db = fakeDb(3);
    const result = runMigrations(db, [migration(1), migration(3)]);
    expect(db.log).toEqual([]);
    expect(result.applied).toEqual([]);
  });

  it("stops at a failing migration and keeps the last good version", () => {
    const db = fakeDb(0);
    const migrations = [
      migration(1),
      migration(2, () => {
        throw new Error("boom");
      }),
      migration(3),
    ];
    expect(() => runMigrations(db, migrations)).toThrow("boom");
    expect(db.userVersion).toBe(1);
    expect(db.log).toEqual([1, 2]);
  });

  it("leaves a database from a newer build untouched", () => {
    const db = fakeDb(9);
    const result = runMigrations(db, [migration(1)]);
    expect(db.log).toEqual([]);
    expect(db.userVersion).toBe(9);
    expect(result.newerThanApp).toBe(true);
  });

  it("ships strictly increasing versions", () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
    expect(LATEST_VERSION).toBe(versions.at(-1));
  });
});

describe("backups", () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-backups-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("names the snapshot by time and source version", () => {
    const ran = [];
    const db = {
      prepare: (sql) => ({ run: (file) => ran.push([sql, file]) }),
    };
    const file = backupDatabase(
      db,
      dir,
      0,
      new Date("2026-10-06T07:00:00.000Z"),
    );
    expect(path.basename(file)).toBe(
      "mind-sage-2026-10-06T07-00-00-000Z-v0.db",
    );
    expect(ran).toEqual([["VACUUM INTO ?", file]]);
  });

  it("keeps only the newest backups and ignores other files", () => {
    const names = [
      "mind-sage-2026-01-01T00-00-00-000Z-v0.db",
      "mind-sage-2026-02-01T00-00-00-000Z-v1.db",
      "mind-sage-2026-03-01T00-00-00-000Z-v2.db",
      "notes.txt",
    ];
    for (const n of names) fs.writeFileSync(path.join(dir, n), "");
    pruneBackups(dir, 2);
    expect(fs.readdirSync(dir).sort()).toEqual([
      "mind-sage-2026-02-01T00-00-00-000Z-v1.db",
      "mind-sage-2026-03-01T00-00-00-000Z-v2.db",
      "notes.txt",
    ]);
  });
});
