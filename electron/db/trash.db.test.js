import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { tempDir } from "./dbTestUtils.js";

// The trash against the real database: what deleting does, what is hidden
// while an item is in it, restore, removal for good, the 30-day purge, and the
// vectors removed with the item.
let localDB;
let idx;
let db;
let dir;
let alice;
let bob;

beforeAll(async () => {
  dir = tempDir("mindsage-trash");
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

const DIM = 768;
const unitVec = (n) => {
  const v = new Array(DIM).fill(0);
  v[n % DIM] = 1;
  return v;
};
/** Gives an item a vector, as the indexer would. */
const indexItem = (type, id, n = id) => {
  const source = idx.loadSource(type, id);
  idx.markStale(type, id, source.userId);
  expect(idx.storeVector(type, id, unitVec(n), source.hash)).toBe("ok");
};

const entry = (userId, overrides = {}) =>
  localDB.createJournalEntry(userId, {
    title: "t",
    content: "some words",
    mood_score: 3,
    mood_tags: ["calm"],
    ...overrides,
  });

const goal = async (userId, title = "Run") => {
  const r = await localDB.AddGoal(userId, {
    title,
    description: "d",
    target_value: 10,
    unit: "km",
  });
  return Number(r.lastInsertRowid);
};

/** Pretend the item was trashed this many days ago. */
const age = (table, id, days) =>
  db
    .prepare(
      `UPDATE ${table} SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?) WHERE id = ?`,
    )
    .run(`-${days} days`, id);

describe("deleting an entry", () => {
  it("moves it to the trash with a timestamp and hides it everywhere", () => {
    const e = entry(alice, { content: "unique-hidden-words" });
    expect(localDB.deleteJournalEntry(alice, e.id)).toBe(1);

    const row = db
      .prepare(
        "SELECT is_deleted, deleted_at FROM journal_entries WHERE id = ?",
      )
      .get(e.id);
    expect(row.is_deleted).toBe(1);
    expect(row.deleted_at).toMatch(/^\d{4}-\d\d-\d\dT/);

    expect(localDB.getJournalById(alice, e.id)).toBeNull();
    expect(
      localDB.getAllEntries(alice, 100, 0).some((x) => x.id === e.id),
    ).toBe(false);
    expect(localDB.getRecentEntries(alice).some((x) => x.id === e.id)).toBe(
      false,
    );
    const trash = localDB.listTrash(alice);
    expect(trash.entries.map((x) => x.id)).toContain(e.id);
  });

  it("deleting twice is a no-op and keeps the first deleted_at", () => {
    const e = entry(alice);
    localDB.deleteJournalEntry(alice, e.id);
    const first = db
      .prepare("SELECT deleted_at FROM journal_entries WHERE id = ?")
      .get(e.id).deleted_at;
    expect(localDB.deleteJournalEntry(alice, e.id)).toBe(0);
    expect(
      db
        .prepare("SELECT deleted_at FROM journal_entries WHERE id = ?")
        .get(e.id).deleted_at,
    ).toBe(first);
  });

  it("is left out of the counts, tags and mood the dashboard shows", () => {
    const u = Number(
      db
        .prepare(
          `INSERT INTO users (username, email, password_hash) VALUES ('counter', 'c@example.com', 'x')`,
        )
        .run().lastInsertRowid,
    );
    entry(u, { content: "kept", mood_tags: ["calm"], mood_score: 4 });
    const gone1 = entry(u, {
      content: "trashed one",
      mood_tags: ["angry"],
      mood_score: 1,
    });
    const gone2 = entry(u, {
      content: "trashed two",
      mood_tags: ["angry"],
      mood_score: 1,
    });
    expect(localDB.getUserStats(u).mostUsedTag).toBe("angry"); // 2 vs 1, live
    localDB.deleteJournalEntry(u, gone1.id);
    localDB.deleteJournalEntry(u, gone2.id);

    const stats = localDB.getUserStats(u);
    expect(stats.totalEntries).toBe(1);
    expect(stats.mostUsedTag).toBe("calm");
    expect(stats.averageMood).toBe(4);
    const dash = localDB.getDashboardData(u);
    expect(JSON.stringify(dash)).not.toContain("trashed one");
    expect(JSON.stringify(dash)).not.toContain("trashed two");
    expect(localDB.getMoodScores(u, 7)).toHaveLength(1);
  });

  it("cannot be edited or re-summarised while it is in the trash", () => {
    const e = entry(alice, { title: "frozen", content: "original words" });
    localDB.deleteJournalEntry(alice, e.id);
    expect(
      localDB.updateJournalEntry(alice, e.id, {
        title: "x",
        content: "changed",
        mood_tags: [],
      }),
    ).toBeNull();
    expect(localDB.addContentSummary("a summary", e.id, alice)).toBe(0);
    const row = db
      .prepare(
        "SELECT content, content_summary FROM journal_entries WHERE id = ?",
      )
      .get(e.id);
    expect(row).toEqual({ content: "original words", content_summary: null });
  });
});

describe("deleting a goal", () => {
  it("moves it to the trash, keeps its progress logs, and hides it", async () => {
    const id = await goal(alice, "Marathon");
    await localDB.logProgress(alice, id, 3, "first run");
    await localDB.deleteGoal(alice, id);

    expect((await localDB.getActiveGoals(alice)).some((g) => g.id === id)).toBe(
      false,
    );
    expect((await localDB.getPinnedGoals(alice)).some((g) => g.id === id)).toBe(
      false,
    );
    expect(await localDB.getGoalById(id, alice)).toBeFalsy();
    expect(
      db
        .prepare("SELECT COUNT(*) n FROM progress_logs WHERE goal_id = ?")
        .get(id).n,
    ).toBe(1);
    expect(localDB.listTrash(alice).goals.map((g) => g.id)).toContain(id);
  });

  it("a trashed goal cannot be edited, pinned, completed or logged to", async () => {
    const id = await goal(alice, "Frozen");
    await localDB.deleteGoal(alice, id);
    expect((await localDB.togglePinGoal(alice, id)).changes).toBe(0);
    expect((await localDB.completeGoal(alice, id)).changes).toBe(0);
    expect(
      (
        await localDB.updateGoal(alice, id, {
          title: "x",
          target_value: 1,
          unit: "u",
          current_value: 0,
          is_pinned: 0,
          is_completed: 0,
        })
      ).changes,
    ).toBe(0);
    expect(await localDB.logProgress(alice, id, 1, "no")).toBeNull();
    expect(await localDB.getProgressLogs(alice, id)).toEqual([]);
  });

  it("progress logs are scoped to the owner's goals", async () => {
    const id = await goal(alice, "Mine");
    expect(await localDB.logProgress(bob, id, 1, "not yours")).toBeNull();
    expect(await localDB.getProgressLogs(bob, id)).toEqual([]);
  });
});

describe("the days-left badge", () => {
  it("counts down from 30 and reaches 0 only when it is due", () => {
    const fresh = entry(alice);
    const mid = entry(alice);
    const last = entry(alice);
    for (const e of [fresh, mid, last]) localDB.deleteJournalEntry(alice, e.id);
    age("journal_entries", mid.id, 10);
    age("journal_entries", last.id, 29.5);
    const byId = Object.fromEntries(
      localDB.listTrash(alice).entries.map((e) => [e.id, e.days_left]),
    );
    expect(byId[fresh.id]).toBe(30);
    expect(byId[mid.id]).toBe(20);
    expect(byId[last.id]).toBe(1);
  });
});

describe("days left", () => {
  it("never exceeds 30, even if the clock was set back when it was deleted", () => {
    const e = entry(alice);
    localDB.deleteJournalEntry(alice, e.id);
    db.prepare(
      "UPDATE journal_entries SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now','+400 days') WHERE id = ?",
    ).run(e.id);
    expect(
      localDB.listTrash(alice).entries.find((x) => x.id === e.id).days_left,
    ).toBe(30);
  });
});

describe("restoring", () => {
  it("handles more ids than SQLite allows in one statement", () => {
    const e = entry(alice);
    localDB.deleteJournalEntry(alice, e.id);
    const ids = Array.from({ length: 40_000 }, (_, i) => i + 1_000_000);
    ids.push(e.id);
    expect(
      localDB.restoreItems(alice, { entryIds: ids, goalIds: [] }).entries,
    ).toBe(1);
  });

  it("brings an entry back with its tags, and a goal with its logs", async () => {
    const e = entry(alice, { mood_tags: ["calm", "grateful"] });
    const g = await goal(alice, "Restorable");
    await localDB.logProgress(alice, g, 2, "log");
    localDB.deleteJournalEntry(alice, e.id);
    await localDB.deleteGoal(alice, g);

    expect(
      localDB.restoreItems(alice, { entryIds: [e.id], goalIds: [g] }),
    ).toEqual({
      entries: 1,
      goals: 1,
    });
    const back = localDB.getJournalById(alice, e.id);
    expect([...back.mood_tags].sort()).toEqual(["calm", "grateful"]);
    expect(back.deleted_at).toBeNull();
    expect((await localDB.getActiveGoals(alice)).some((x) => x.id === g)).toBe(
      true,
    );
    expect(await localDB.getProgressLogs(alice, g)).toHaveLength(1);
  });

  it("restores a goal whose ambition (parent goal) was deleted, on its own", async () => {
    const parent = await goal(alice, "Parent");
    const child = Number(
      (
        await localDB.AddGoal(alice, {
          title: "Child",
          parent_goal: "Parent",
          target_value: 1,
          unit: "x",
        })
      ).lastInsertRowid,
    );
    await localDB.deleteGoal(alice, parent);
    await localDB.deleteGoal(alice, child);
    localDB.restoreItems(alice, { entryIds: [], goalIds: [child] });
    expect(
      (await localDB.getActiveGoals(alice)).some((x) => x.id === child),
    ).toBe(true);
  });

  it("ignores ids that are not in the trash or not the user's", () => {
    const live = entry(alice);
    const theirs = entry(bob);
    localDB.deleteJournalEntry(bob, theirs.id);
    expect(
      localDB.restoreItems(alice, {
        entryIds: [live.id, theirs.id, "x", null],
        goalIds: [],
      }),
    ).toEqual({ entries: 0, goals: 0 });
    expect(localDB.listTrash(bob).entries.map((e) => e.id)).toContain(
      theirs.id,
    );
  });
});

describe("deleting for good", () => {
  it("removes the row and tag links, returns the media files, and removes the vector", () => {
    const e = entry(alice, { mood_tags: ["calm"] });
    indexItem("journal", e.id);
    const vectorCountBefore = db
      .prepare("SELECT COUNT(*) n FROM vec_entries")
      .get().n;
    db.prepare(
      "UPDATE journal_entries SET image_key = ?, audio_key = ? WHERE id = ?",
    ).run("/media/photo.jpg", "/media/voice.wav", e.id);
    localDB.deleteJournalEntry(alice, e.id);

    const r = localDB.deleteForever(alice, { entryIds: [e.id], goalIds: [] });
    expect(r.entries).toBe(1);
    expect(r.files.sort()).toEqual(["/media/photo.jpg", "/media/voice.wav"]);
    expect(
      db.prepare("SELECT 1 FROM journal_entries WHERE id = ?").get(e.id),
    ).toBeUndefined();
    expect(
      db
        .prepare("SELECT 1 FROM journal_entry_tags WHERE journal_entry_id = ?")
        .get(e.id),
    ).toBeUndefined();
    expect(idx.getState("journal", e.id)).toBeNull();
    expect(db.prepare("SELECT COUNT(*) n FROM vec_entries").get().n).toBe(
      vectorCountBefore - 1,
    );
  });

  it("refuses to remove an entry that is not in the trash", () => {
    const live = entry(alice, { content: "live-and-precious" });
    const r = localDB.deleteForever(alice, {
      entryIds: [live.id],
      goalIds: [],
    });
    expect(r).toEqual({ entries: 0, goals: 0, files: [], entryIds: [] });
    expect(localDB.getJournalById(alice, live.id).content).toBe(
      "live-and-precious",
    );
  });

  it("cannot reach another user's trash", () => {
    const theirs = entry(bob);
    localDB.deleteJournalEntry(bob, theirs.id);
    expect(
      localDB.deleteForever(alice, { entryIds: [theirs.id], goalIds: [] })
        .entries,
    ).toBe(0);
    expect(
      db.prepare("SELECT 1 FROM journal_entries WHERE id = ?").get(theirs.id),
    ).toBeTruthy();
  });

  it("removes a goal with its progress logs and all their vectors", async () => {
    const g = await goal(alice, "Doomed");
    const l1 = (await localDB.logProgress(alice, g, 1, "a")).id;
    const l2 = (await localDB.logProgress(alice, g, 2, "b")).id;
    indexItem("goal", g, 900);
    indexItem("progress_log", l1, 901);
    indexItem("progress_log", l2, 902);
    const vectorCountBefore = db
      .prepare("SELECT COUNT(*) n FROM vec_entries")
      .get().n;
    await localDB.deleteGoal(alice, g);
    const r = localDB.deleteForever(alice, { entryIds: [], goalIds: [g] });
    expect(r.goals).toBe(1);
    expect(
      db
        .prepare("SELECT COUNT(*) n FROM progress_logs WHERE goal_id = ?")
        .get(g).n,
    ).toBe(0);
    expect(idx.getState("goal", g)).toBeNull();
    expect(idx.getState("progress_log", l1)).toBeNull();
    expect(idx.getState("progress_log", l2)).toBeNull();
    expect(db.prepare("SELECT COUNT(*) n FROM vec_entries").get().n).toBe(
      vectorCountBefore - 3,
    );
  });

  it("a chat answer that cited the entry keeps its place but loses the title", () => {
    const e = entry(alice, { title: "Private diary title" });
    const chat = Number(
      db
        .prepare("INSERT INTO chats (user_id, title) VALUES (?, 'c')")
        .run(alice).lastInsertRowid,
    );
    const msg = Number(
      db
        .prepare(
          "INSERT INTO messages (chat_id, sender, content) VALUES (?, 'ai', 'answer')",
        )
        .run(chat).lastInsertRowid,
    );
    db.prepare(
      "INSERT INTO message_sources (message_id, source_type, source_id, source_title) VALUES (?, 'journal', ?, ?)",
    ).run(msg, String(e.id), "Private diary title");
    localDB.deleteJournalEntry(alice, e.id);
    localDB.deleteForever(alice, { entryIds: [e.id], goalIds: [] });
    const src = db
      .prepare("SELECT source_title FROM message_sources WHERE message_id = ?")
      .get(msg);
    expect(src.source_title).toBe("Removed entry");
  });

  it("takes the People summaries and lone suggestions the entry gave rise to", () => {
    const e = entry(alice, { content: "Saw Priya. Lunch with Sam." });
    const keep = entry(alice, { content: "Sam again." });
    const person = (name, status) =>
      Number(
        db
          .prepare(
            "INSERT INTO people (user_id, display_name, status) VALUES (?, ?, ?)",
          )
          .run(alice, name, status).lastInsertRowid,
      );
    const priya = person("Priya", "suggested");
    const sam = person("Sam", "confirmed");
    const mention = (entryId, personId, name) =>
      db
        .prepare(
          "INSERT INTO person_mentions (entry_id, person_id, name_as_written, sentence_start, sentence_end, extractor_version) VALUES (?, ?, ?, 0, 5, 1)",
        )
        .run(entryId, personId, name);
    mention(e.id, priya, "Priya");
    mention(e.id, sam, "Sam");
    mention(keep.id, sam, "Sam");
    db.prepare(
      "INSERT INTO person_summaries (person_id, summary_json, mentions_hash) VALUES (?, '[\"Lunch with Sam\"]', 'h')",
    ).run(sam);
    db.prepare("INSERT INTO people_jobs (entry_id, user_id) VALUES (?, ?)").run(
      e.id,
      alice,
    );

    localDB.deleteJournalEntry(alice, e.id);
    localDB.deleteForever(alice, { entryIds: [e.id], goalIds: [] });

    const count = (sql, ...args) => db.prepare(sql).get(...args).n;
    expect(
      count("SELECT COUNT(*) n FROM person_mentions WHERE entry_id = ?", e.id),
    ).toBe(0);
    expect(
      count("SELECT COUNT(*) n FROM people_jobs WHERE entry_id = ?", e.id),
    ).toBe(0);
    expect(
      count("SELECT COUNT(*) n FROM person_summaries WHERE person_id = ?", sam),
    ).toBe(0);
    expect(count("SELECT COUNT(*) n FROM people WHERE id = ?", priya)).toBe(0);
    expect(count("SELECT COUNT(*) n FROM people WHERE id = ?", sam)).toBe(1);
    expect(
      count(
        "SELECT COUNT(*) n FROM person_mentions WHERE entry_id = ?",
        keep.id,
      ),
    ).toBe(1);
  });
});

describe("Empty trash", () => {
  it("takes exactly what the list shows, never rows without a deleted_at", () => {
    const u = Number(
      db
        .prepare(
          `INSERT INTO users (username, email, password_hash) VALUES ('emptier', 'em@example.com', 'x')`,
        )
        .run().lastInsertRowid,
    );
    const listed = entry(u);
    const stray = entry(u);
    localDB.deleteJournalEntry(u, listed.id);
    db.prepare(
      "UPDATE journal_entries SET is_deleted = 1, deleted_at = NULL WHERE id = ?",
    ).run(stray.id);
    expect(localDB.trashedIds(u).entryIds).toEqual([listed.id]);
    expect(localDB.listTrash(u).entries.map((e) => e.id)).toEqual([listed.id]);
  });

  it("deleteForever reports which entries went, so their media folders can follow", () => {
    const e = entry(alice);
    localDB.deleteJournalEntry(alice, e.id);
    const live = entry(alice);
    expect(
      localDB.deleteForever(alice, { entryIds: [e.id, live.id], goalIds: [] })
        .entryIds,
    ).toEqual([e.id]);
  });
});

describe("the 30-day purge", () => {
  it("selects only what is past 30 days, grouped by user", () => {
    const old = entry(alice);
    const recent = entry(alice);
    const bobsOld = entry(bob);
    const oldGoal = db.prepare("SELECT 1").get() && undefined;
    void oldGoal;
    for (const [u, e] of [
      [alice, old],
      [alice, recent],
      [bob, bobsOld],
    ])
      localDB.deleteJournalEntry(u, e.id);
    age("journal_entries", old.id, 31);
    age("journal_entries", bobsOld.id, 40);
    age("journal_entries", recent.id, 29);

    const due = localDB.expiredItems();
    expect(due.get(alice).entryIds).toContain(old.id);
    expect(due.get(alice).entryIds).not.toContain(recent.id);
    expect(due.get(bob).entryIds).toContain(bobsOld.id);
  });

  it("never selects a live item, however old", () => {
    const live = entry(alice);
    db.prepare(
      "UPDATE journal_entries SET created_at = '2001-01-01T00:00:00Z' WHERE id = ?",
    ).run(live.id);
    const all = [...localDB.expiredItems().values()].flatMap((v) => v.entryIds);
    expect(all).not.toContain(live.id);
  });

  it("an entry deleted 40 days ago is gone after the purge, with its media listed", () => {
    const e = entry(alice);
    db.prepare(
      "UPDATE journal_entries SET image_key = '/media/old.jpg' WHERE id = ?",
    ).run(e.id);
    localDB.deleteJournalEntry(alice, e.id);
    age("journal_entries", e.id, 40);
    const files = [];
    for (const [userId, ids] of localDB.expiredItems()) {
      files.push(...localDB.deleteForever(userId, ids).files);
    }
    expect(
      db.prepare("SELECT 1 FROM journal_entries WHERE id = ?").get(e.id),
    ).toBeUndefined();
    expect(files).toContain("/media/old.jpg");
  });
});

describe("deleting for good while the search extension cannot load (KAN-368)", () => {
  let vectorSupport;
  beforeAll(async () => {
    ({ vectorSupport } = await import("./connection.js"));
  });
  const vectorIds = () =>
    db
      .prepare("SELECT rowid AS id FROM vec_entries")
      .all()
      .map((r) => Number(r.id));
  /** Runs fn the way a process that could not load sqlite-vec would. */
  const withoutExtension = (fn) => {
    vectorSupport.ok = false;
    try {
      return fn();
    } finally {
      vectorSupport.ok = true;
    }
  };
  const nextStart = () => localDB.initDatabase();

  it("the vector left behind is removed at the next start that loads the extension", () => {
    const e = entry(alice, { content: "purged while search was off" });
    indexItem("journal", e.id);
    const rowid = idx.getState("journal", e.id).id;
    localDB.deleteJournalEntry(alice, e.id);

    withoutExtension(() =>
      localDB.deleteForever(alice, { entryIds: [e.id], goalIds: [] }),
    );
    expect(idx.getState("journal", e.id)).toBeNull();
    // vec_entries could not be touched in that process.
    expect(vectorIds()).toContain(rowid);

    nextStart();
    expect(vectorIds()).not.toContain(rowid);
  });

  it("an item given the purged item's id never inherits its vector", () => {
    const old = entry(alice, { content: "old private words" });
    indexItem("journal", old.id, 300);
    const rowid = idx.getState("journal", old.id).id;
    localDB.deleteJournalEntry(alice, old.id);

    const fresh = withoutExtension(() => {
      localDB.deleteForever(alice, { entryIds: [old.id], goalIds: [] });
      const e = entry(alice, { content: "new words" });
      idx.markStale("journal", e.id, alice); // what journal:created does
      return e;
    });
    // SQLite hands the freed id on, so the danger is real.
    expect(idx.getState("journal", fresh.id).id).toBe(rowid);

    const hitsFor = (n) =>
      idx
        .searchSimilar(alice, unitVec(n), 10, { threshold: 0.99 })
        .map((h) => h.payload.source_id);
    // Even before the sweep, the old vector does not find the new entry.
    expect(hitsFor(300)).not.toContain(fresh.id);

    nextStart();
    expect(vectorIds()).not.toContain(rowid);
    expect(idx.getState("journal", fresh.id)).toMatchObject({
      state: "pending",
    });

    // The new entry gets its own vector, and only that one finds it.
    indexItem("journal", fresh.id, 301);
    expect(hitsFor(301)).toContain(fresh.id);
    expect(hitsFor(300)).not.toContain(fresh.id);
  });

  it("a goal purged without the extension loses its own and its logs' vectors", async () => {
    const g = await goal(alice, "Swim");
    const logId = (await localDB.logProgress(alice, g, 1, "lap")).id;
    indexItem("goal", g, 910);
    indexItem("progress_log", logId, 911);
    const rowids = [
      idx.getState("goal", g).id,
      idx.getState("progress_log", logId).id,
    ];
    await localDB.deleteGoal(alice, g);
    withoutExtension(() =>
      localDB.deleteForever(alice, { entryIds: [], goalIds: [g] }),
    );
    nextStart();
    for (const id of rowids) expect(vectorIds()).not.toContain(id);
  });
});
