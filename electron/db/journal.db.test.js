import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { tempDir } from "./dbTestUtils.js";

// Journal CRUD through the real db modules (connection.js opens the database
// as a side effect, so the folder is chosen before the first import).
let localDB;
let dir;
let alice;
let bob;

beforeAll(async () => {
  dir = tempDir("mindsage-journal");
  process.env.MS_DB_DIR = dir;
  process.env.MS_USER_DATA_DIR = dir; // a scratch profile always gets its own db
  process.env.MS_SKIP_DB_BACKUP = "1";
  ({ default: localDB } = await import("./index.js"));
  localDB.initDatabase();
  alice = Number(
    localDB.createUser({
      username: "alice",
      email: "alice@example.com",
      password: "pw-alice-1",
      full_name: "Alice",
    }).id ?? 1,
  );
  bob = Number(
    localDB.createUser({
      username: "bob",
      email: "bob@example.com",
      password: "pw-bob-1",
      full_name: "Bob",
    }).id ?? 2,
  );
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const iso = (day, hour = 9) =>
  new Date(Date.UTC(2026, 2, day, hour)).toISOString();

describe("creating and reading", () => {
  it("stores an entry with its tags and reads it back by id", () => {
    const created = localDB.createJournalEntry(alice, {
      title: "A walk",
      content: "I felt calm and happy after the walk.",
      mood_score: 4,
      mood_tags: ["calm", "outdoors"],
      created_at: iso(1),
    });
    expect(created).toMatchObject({
      user_id: alice,
      title: "A walk",
      mood_score: 4,
      is_deleted: 0,
      ai_metadata_status: "not_started",
      ai_summary_status: "not_started",
    });
    expect([...created.mood_tags].sort()).toEqual(["calm", "outdoors"]);

    const read = localDB.getJournalById(alice, created.id);
    expect(read.content).toBe("I felt calm and happy after the walk.");
    expect([...read.mood_tags].sort()).toEqual(["calm", "outdoors"]);
  });

  it("scores sentiment on write, between -1 and 1, positive for happy text", () => {
    const happy = localDB.createJournalEntry(alice, {
      content: "wonderful, great, love this lovely day",
    });
    const sad = localDB.createJournalEntry(alice, {
      content: "terrible awful horrible day, I hate it",
    });
    expect(happy.sentiment_score).toBeGreaterThan(0);
    expect(sad.sentiment_score).toBeLessThan(0);
    for (const e of [happy, sad]) {
      expect(Math.abs(e.sentiment_score)).toBeLessThanOrEqual(1);
    }
  });

  it("keeps text exactly as written: unicode, quotes, SQL-looking text", () => {
    const text = `It's "fine"; DROP TABLE journal_entries; -- café ☕ 日本語 \n second line`;
    const e = localDB.createJournalEntry(alice, { title: text, content: text });
    expect(localDB.getJournalById(alice, e.id)).toMatchObject({
      title: text,
      content: text,
    });
    expect(localDB.getAllEntries(alice, 1000, 0).length).toBeGreaterThan(0); // the table is still there
  });

  it("accepts an entry with no title, tags or mood", () => {
    const e = localDB.createJournalEntry(alice, { content: "just words" });
    expect(e).toMatchObject({ title: null, mood_score: null, mood_tags: [] });
  });
});

describe("listing", () => {
  beforeAll(() => {
    for (let d = 10; d <= 19; d++) {
      localDB.createJournalEntry(bob, {
        title: `Bob day ${d}`,
        content: `entry for day ${d}`,
        created_at: iso(d),
      });
    }
  });

  it("returns newest first and pages without gaps or repeats", () => {
    const page1 = localDB.getAllEntries(bob, 4, 0);
    const page2 = localDB.getAllEntries(bob, 4, 4);
    const page3 = localDB.getAllEntries(bob, 4, 8);
    const titles = [...page1, ...page2, ...page3].map((e) => e.title);
    expect(titles).toEqual(
      Array.from({ length: 10 }, (_, i) => `Bob day ${19 - i}`),
    );
  });

  it("filters by an inclusive date range", () => {
    const rows = localDB.getAllEntries(bob, 100, 0, "2026-03-12", "2026-03-14");
    expect(rows.map((e) => e.title)).toEqual([
      "Bob day 14",
      "Bob day 13",
      "Bob day 12",
    ]);
  });

  it("recent entries are the three newest", () => {
    expect(localDB.getRecentEntries(bob).map((e) => e.title)).toEqual([
      "Bob day 19",
      "Bob day 18",
      "Bob day 17",
    ]);
  });
});

describe("updating", () => {
  it("replaces content and tags, and refuses another user's entry", () => {
    const e = localDB.createJournalEntry(alice, {
      title: "Before",
      content: "before",
      mood_tags: ["old"],
    });
    const updated = localDB.updateJournalEntry(alice, e.id, {
      title: "After",
      content: "after",
      mood_score: 2,
      mood_tags: ["new", "newer"],
    });
    expect(updated).toMatchObject({
      title: "After",
      content: "after",
      mood_score: 2,
    });
    expect([...updated.mood_tags].sort()).toEqual(["new", "newer"]);

    expect(
      localDB.updateJournalEntry(bob, e.id, {
        content: "hijack",
        mood_tags: [],
      }),
    ).toBeNull();
    expect(localDB.getJournalById(alice, e.id).content).toBe("after");
  });

  it("updating a missing entry returns null instead of creating one", () => {
    expect(
      localDB.updateJournalEntry(alice, 999_999, {
        content: "x",
        mood_tags: [],
      }),
    ).toBeNull();
  });

  it("AI status updates touch only the AI columns", () => {
    const e = localDB.createJournalEntry(alice, {
      title: "Keep me",
      content: "user words",
      mood_score: 3,
      mood_tags: ["keep"],
    });
    expect(
      localDB.updateAIStatus(alice, e.id, {
        ai_metadata_status: "failed",
        ai_metadata_error: "Ollama was not running",
        title: "ignored",
        content: "ignored",
      }),
    ).toBe(1);
    const after = localDB.getJournalById(alice, e.id);
    expect(after).toMatchObject({
      title: "Keep me",
      content: "user words",
      mood_score: 3,
      ai_metadata_status: "failed",
      ai_metadata_error: "Ollama was not running",
    });
    expect(after.mood_tags).toEqual(["keep"]);
    expect(localDB.updateAIStatus(alice, e.id, { nonsense: 1 })).toBe(0);
    expect(() =>
      localDB.updateAIStatus(alice, e.id, { ai_summary_status: "bogus" }),
    ).toThrow(/CHECK constraint/);
  });
});

describe("deleting", () => {
  it("soft-deletes: gone from every read, still in the table", () => {
    const e = localDB.createJournalEntry(alice, { content: "delete me" });
    expect(localDB.deleteJournalEntry(alice, e.id)).toBe(1);
    expect(localDB.getJournalById(alice, e.id)).toBeNull();
    expect(
      localDB.getAllEntries(alice, 1000, 0).some((x) => x.id === e.id),
    ).toBe(false);
    expect(localDB.getRecentEntries(alice).some((x) => x.id === e.id)).toBe(
      false,
    );
    const row = localDB.db
      .prepare(
        "SELECT is_deleted, sync_action FROM journal_entries WHERE id = ?",
      )
      .get(e.id);
    expect(row).toEqual({ is_deleted: 1, sync_action: "delete" });
  });

  it("another user cannot read an entry by its id either", () => {
    const e = localDB.createJournalEntry(alice, { content: "private" });
    expect(localDB.getJournalById(bob, e.id)).toBeNull();
    expect(localDB.getJournalById(alice, e.id)).not.toBeNull();
  });

  it("cannot delete another user's entry", () => {
    const e = localDB.createJournalEntry(alice, { content: "mine" });
    expect(localDB.deleteJournalEntry(bob, e.id)).toBe(0);
    expect(localDB.getJournalById(alice, e.id)).not.toBeNull();
  });
});

describe("separation between users", () => {
  it("one user never sees the other's entries in any listing", () => {
    const aliceIds = new Set(
      localDB.getAllEntries(alice, 1000, 0).map((e) => e.user_id),
    );
    const bobIds = new Set(
      localDB.getAllEntries(bob, 1000, 0).map((e) => e.user_id),
    );
    expect([...aliceIds]).toEqual([alice]);
    expect([...bobIds]).toEqual([bob]);
  });
});

describe("startup seeding", () => {
  it("creates the system user and its categories, and does it again harmlessly", () => {
    const count = () =>
      localDB.db
        .prepare("SELECT count(*) n FROM categories WHERE user_id = 0")
        .get().n;
    expect(count()).toBe(5);
    localDB.initDatabase();
    expect(count()).toBe(5);
    expect(
      localDB.db.prepare("SELECT username FROM users WHERE id = 0").get(),
    ).toEqual({ username: "System" });
  });
});
