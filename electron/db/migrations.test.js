import { describe, it, expect, vi } from "vitest";
import { MIGRATIONS, LATEST_VERSION, runMigrations } from "./migrations.js";

/**
 * A stand-in for a better-sqlite3 Database that records what the runner did.
 * Only the surface runMigrations touches is implemented.
 */
function fakeDb(startVersion = 0) {
  const calls = [];
  let version = startVersion;
  const db = {
    calls,
    get version() {
      return version;
    },
    pragma(statement, options) {
      const match = /^user_version\s*=\s*(\d+)$/.exec(statement.trim());
      if (match) {
        version = Number(match[1]);
        calls.push(`stamp:${version}`);
        return undefined;
      }
      if (statement.trim() === "user_version") {
        return options?.simple ? version : [{ user_version: version }];
      }
      throw new Error(`unexpected pragma: ${statement}`);
    },
    exec(sql) {
      calls.push(`exec:${sql}`);
    },
    transaction(fn) {
      return (...args) => {
        calls.push("begin");
        const result = fn(...args);
        calls.push("commit");
        return result;
      };
    },
  };
  return db;
}

const fixture = [
  { version: 1, name: "one", up: (d) => d.exec("one") },
  { version: 2, name: "two", up: (d) => d.exec("two") },
  { version: 3, name: "three", up: (d) => d.exec("three") },
];

describe("runMigrations", () => {
  it("applies every migration in order to a fresh database", () => {
    const db = fakeDb(0);
    const result = runMigrations(db, fixture);

    expect(result).toEqual({
      from: 0,
      to: 3,
      applied: ["one", "two", "three"],
    });
    expect(db.version).toBe(3);
    expect(db.calls.filter((c) => c.startsWith("exec:"))).toEqual([
      "exec:one",
      "exec:two",
      "exec:three",
    ]);
  });

  it("applies only the migrations newer than the stored version", () => {
    const db = fakeDb(2);
    const result = runMigrations(db, fixture);

    expect(result.applied).toEqual(["three"]);
    expect(db.calls.filter((c) => c.startsWith("exec:"))).toEqual([
      "exec:three",
    ]);
  });

  it("does nothing, and takes no backup, when already current", () => {
    const db = fakeDb(3);
    const beforeMigrate = vi.fn();

    const result = runMigrations(db, fixture, { beforeMigrate });

    // The backup hook staying unused is what keeps the app from copying the
    // user's whole journal on every launch.
    expect(beforeMigrate).not.toHaveBeenCalled();
    expect(result).toEqual({ from: 3, to: 3, applied: [] });
    expect(db.calls).toEqual([]);
  });

  it("calls beforeMigrate once, with the starting version, before any work", () => {
    const db = fakeDb(1);
    const seen = [];
    runMigrations(db, fixture, {
      beforeMigrate: (from) => seen.push([from, db.calls.length]),
    });

    expect(seen).toEqual([[1, 0]]);
  });

  it("stamps the version inside the same transaction as the migration", () => {
    const db = fakeDb(0);
    runMigrations(db, [fixture[0]]);

    expect(db.calls).toEqual(["begin", "exec:one", "stamp:1", "commit"]);
  });

  it("stops at the failing migration and leaves later ones unapplied", () => {
    const db = fakeDb(0);
    const boom = [
      fixture[0],
      {
        version: 2,
        name: "bad",
        up: () => {
          throw new Error("boom");
        },
      },
      fixture[2],
    ];

    expect(() => runMigrations(db, boom)).toThrow("boom");
    expect(db.version).toBe(1);
    expect(db.calls).not.toContain("exec:three");
  });

  it("treats an unreadable user_version as 0", () => {
    const db = fakeDb(0);
    db.pragma = (statement) =>
      statement.trim() === "user_version" ? undefined : undefined;

    expect(runMigrations(db, fixture).from).toBe(0);
  });
});

describe("MIGRATIONS", () => {
  it("is a contiguous list starting at 1, with unique names", () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    MIGRATIONS.forEach((migration, index) => {
      expect(migration.version).toBe(index + 1);
      expect(typeof migration.up).toBe("function");
      expect(migration.name).toBeTruthy();
    });
    expect(new Set(MIGRATIONS.map((m) => m.name)).size).toBe(MIGRATIONS.length);
  });

  it("exposes the highest version as LATEST_VERSION", () => {
    expect(LATEST_VERSION).toBe(MIGRATIONS.length);
  });
});
