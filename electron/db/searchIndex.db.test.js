import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { tempDir } from "./dbTestUtils.js";

// The search index against the real database and the real sqlite-vec
// extension: storing, searching, trash and purge, the stale-text race, and the
// retry schedule.
let localDB;
let db;
let idx;
let dir;
let alice;
let bob;

const DIM = 768;
/** A unit vector pointing mostly along axis `a`, slightly along `b`. */
const vec = (a, b = 0, tilt = 0) => {
  const v = new Array(DIM).fill(0);
  v[a] = 1;
  if (tilt) v[b] = tilt;
  return v;
};

beforeAll(async () => {
  dir = tempDir("mindsage-searchindex");
  process.env.MS_DB_DIR = dir;
  process.env.MS_USER_DATA_DIR = dir;
  process.env.MS_SKIP_DB_BACKUP = "1";
  ({ default: localDB } = await import("./index.js"));
  idx = await import("./searchIndex.js");
  db = localDB.db;
  localDB.initDatabase();
  const make = (name) =>
    Number(
      db
        .prepare(
          `INSERT INTO users (username, email, password_hash) VALUES (?, ?, 'x')`,
        )
        .run(name, `${name}@example.com`).lastInsertRowid,
    );
  alice = make("alice");
  bob = make("bob");
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const entry = (userId, overrides = {}) =>
  localDB.createJournalEntry(userId, {
    title: "t",
    content: "some words",
    mood_score: 3,
    mood_tags: ["calm"],
    ...overrides,
  });

/** Embeds the entry as it is now, the way the indexer does. */
const index = (id, vector, type = "journal") => {
  const source = idx.loadSource(type, id);
  idx.markStale(type, id, source.userId);
  return idx.storeVector(type, id, vector, source.hash);
};

describe("the vector extension", () => {
  it("loads and the vector table exists", () => {
    expect(idx.vectorsAvailable()).toBe(true);
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE name = 'vec_entries'")
        .get(),
    ).toBeTruthy();
  });
});

describe("storing and searching", () => {
  it("finds the nearest live item first, with a payload built from the tables", () => {
    const near = entry(alice, { title: "Near", content: "walk by the sea" });
    const far = entry(alice, { title: "Far", content: "tax forms" });
    expect(index(near.id, vec(0))).toBe("ok");
    expect(index(far.id, vec(1))).toBe("ok");

    const hits = idx.searchSimilar(alice, vec(0, 1, 0.1), 5, {
      threshold: 0.1,
    });
    expect(hits[0].payload).toMatchObject({
      source_type: "journal",
      source_id: near.id,
      title: "Near",
      content: "walk by the sea",
      mood_tags: ["calm"],
    });
    expect(hits[0].score).toBeGreaterThan(0.9);
    expect(hits.map((h) => h.payload.source_id)).not.toContain(far.id);
  });

  it("applies the score threshold", () => {
    const hits = idx.searchSimilar(alice, vec(5), 5, { threshold: 0.5 });
    expect(hits).toEqual([]);
  });

  it("never returns another user's items", () => {
    const mine = entry(bob, { content: "bob only" });
    index(mine.id, vec(7));
    expect(idx.searchSimilar(alice, vec(7), 5, { threshold: 0.1 })).toEqual([]);
    expect(
      idx.searchSimilar(bob, vec(7), 5, { threshold: 0.1 })[0].payload
        .source_id,
    ).toBe(mine.id);
  });

  it("re-indexing an item replaces its vector instead of adding a second", () => {
    const e = entry(alice, { content: "moves" });
    index(e.id, vec(10));
    index(e.id, vec(11));
    const rows = db
      .prepare(
        "SELECT COUNT(*) AS n FROM search_index WHERE source_type = 'journal' AND source_id = ?",
      )
      .get(e.id).n;
    expect(rows).toBe(1);
    const hits = idx.searchSimilar(alice, vec(10), 5, { threshold: 0.5 });
    expect(hits.find((h) => h.payload.source_id === e.id)).toBeUndefined();
    expect(
      idx
        .searchSimilar(alice, vec(11), 5, { threshold: 0.5 })
        .some((h) => h.payload.source_id === e.id),
    ).toBe(true);
  });

  it("indexes goals and progress logs and reports their own payloads", async () => {
    const r = await localDB.AddGoal(alice, {
      title: "Run",
      description: "every day",
      target_value: 10,
      unit: "km",
    });
    const goalId = Number(r.lastInsertRowid);
    index(goalId, vec(20), "goal");
    const hits = idx.searchSimilar(alice, vec(20), 5, { threshold: 0.5 });
    expect(hits[0].payload).toMatchObject({
      source_type: "goal",
      title: "Run",
      status: "active",
    });
  });

  it("honours a time range", () => {
    const old = entry(alice, {
      content: "long ago",
      created_at: "2020-01-01T00:00:00.000Z",
    });
    index(old.id, vec(30));
    const inside = idx.searchSimilar(alice, vec(30), 5, {
      threshold: 0.5,
      range: { from: "2019-01-01", to: "2021-01-01" },
    });
    expect(inside.map((h) => h.payload.source_id)).toContain(old.id);
    const outside = idx.searchSimilar(alice, vec(30), 5, {
      threshold: 0.5,
      range: { from: "2024-01-01", to: null },
    });
    expect(outside.map((h) => h.payload.source_id)).not.toContain(old.id);
  });
});

describe("the trash and the purge", () => {
  it("a trashed item is not returned, and comes back on restore without a new embedding", () => {
    const e = entry(alice, { content: "trash me" });
    index(e.id, vec(40));
    localDB.deleteJournalEntry(alice, e.id);
    expect(
      idx
        .searchSimilar(alice, vec(40), 5, { threshold: 0.5 })
        .some((h) => h.payload.source_id === e.id),
    ).toBe(false);
    localDB.restoreJournalEntry?.(alice, e.id);
    db.prepare("UPDATE journal_entries SET is_deleted = 0 WHERE id = ?").run(
      e.id,
    );
    expect(
      idx
        .searchSimilar(alice, vec(40), 5, { threshold: 0.5 })
        .some((h) => h.payload.source_id === e.id),
    ).toBe(true);
  });

  it("removeSources deletes the vector and the state row together", () => {
    const e = entry(alice, { content: "purge me" });
    index(e.id, vec(41));
    expect(idx.removeSources("journal", [e.id])).toBe(1);
    expect(idx.getState("journal", e.id)).toBeNull();
    expect(
      idx
        .searchSimilar(alice, vec(41), 5, { threshold: 0.5 })
        .some((h) => h.payload.source_id === e.id),
    ).toBe(false);
  });

  it("removeUserSources clears one user's vectors only", () => {
    const a = entry(alice, { content: "a" });
    const b = entry(bob, { content: "b" });
    index(a.id, vec(42));
    index(b.id, vec(42));
    idx.removeUserSources(alice);
    expect(idx.getState("journal", a.id)).toBeNull();
    expect(idx.getState("journal", b.id)).not.toBeNull();
    expect(
      idx.searchSimilar(bob, vec(42), 5, { threshold: 0.5 }).length,
    ).toBeGreaterThan(0);
  });
});

describe("races with the embedding", () => {
  it("does not store a vector for text that changed meanwhile, and stays pending", () => {
    const e = entry(alice, { content: "before" });
    const before = idx.loadSource("journal", e.id);
    idx.markStale("journal", e.id, alice);
    db.prepare("UPDATE journal_entries SET content = 'after' WHERE id = ?").run(
      e.id,
    );
    expect(idx.storeVector("journal", e.id, vec(50), before.hash)).toBe(
      "stale",
    );
    expect(idx.getState("journal", e.id).state).toBe("pending");
    expect(
      idx
        .searchSimilar(alice, vec(50), 5, { threshold: 0.5 })
        .some((h) => h.payload.source_id === e.id),
    ).toBe(false);
  });

  it("does not store a vector for an item trashed or purged while embedding (KAN-343)", () => {
    const e = entry(alice, { content: "going" });
    const snap = idx.loadSource("journal", e.id);
    idx.markStale("journal", e.id, alice);
    localDB.deleteJournalEntry(alice, e.id);
    expect(idx.storeVector("journal", e.id, vec(51), snap.hash)).toBe("gone");
    expect(idx.getState("journal", e.id)).toBeNull();
  });
});

describe("retries", () => {
  it("backs off 1 min, 5 min, 30 min, 2 h, 12 h, then waits for a content change", () => {
    const e = entry(alice, { content: "retry" });
    idx.markStale("journal", e.id, alice);
    const now = 1_000_000;
    const waits = [];
    for (let i = 0; i < idx.MAX_ATTEMPTS; i++) {
      const r = idx.markFailure("journal", e.id, alice, new Error("boom"), now);
      waits.push(r.nextAttemptAt === null ? null : r.nextAttemptAt - now);
    }
    expect(waits).toEqual([60_000, 300_000, 1_800_000, 7_200_000, null]);
    const work = (t) =>
      idx
        .pendingWork(500, t)
        .some((w) => w.id === e.id && w.type === "journal");
    expect(work(now + 10 ** 12)).toBe(false); // gave up
    idx.markStale("journal", e.id, alice); // the text was edited
    expect(work(now)).toBe(true);
  });

  it("offers a failed row only once its wait is over", () => {
    const e = entry(alice, { content: "wait" });
    idx.markStale("journal", e.id, alice);
    idx.markFailure("journal", e.id, alice, "x", 5_000);
    const has = (t) =>
      idx
        .pendingWork(500, t)
        .some((w) => w.id === e.id && w.type === "journal");
    expect(has(5_000 + 59_000)).toBe(false);
    expect(has(5_000 + 60_000)).toBe(true);
  });
});

describe("finding work", () => {
  it("lists live items that have no state row at all, but not trashed ones", () => {
    const fresh = entry(alice, { content: "never announced" });
    const gone = entry(alice, { content: "trashed unannounced" });
    localDB.deleteJournalEntry(alice, gone.id);
    const work = idx.pendingWork(1000).map((w) => `${w.type}:${w.id}`);
    expect(work).toContain(`journal:${fresh.id}`);
    expect(work).not.toContain(`journal:${gone.id}`);
  });

  it("counts what is indexed, waiting and missing for a user", () => {
    const user = Number(
      db
        .prepare(
          "INSERT INTO users (username, email, password_hash) VALUES ('carol','c@example.com','x')",
        )
        .run().lastInsertRowid,
    );
    const a = entry(user, { content: "one" });
    entry(user, { content: "two" });
    entry(user, { content: "three" });
    index(a.id, vec(60));
    expect(idx.indexCounts(user)).toMatchObject({
      total: 3,
      ok: 1,
      pending: 0,
      missing: 2,
    });
  });
});

describe("resetting for a different embedding model", () => {
  it("drops every vector and puts every row back to pending", () => {
    const e = entry(alice, { content: "reset" });
    index(e.id, vec(70));
    idx.resetAll(DIM);
    expect(idx.getState("journal", e.id)).toMatchObject({
      state: "pending",
      content_hash: null,
    });
    expect(idx.searchSimilar(alice, vec(70), 5, { threshold: 0.1 })).toEqual(
      [],
    );
  });
});
