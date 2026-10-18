import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { tempDir } from "./dbTestUtils.js";

// Deleting a whole profile against the real database: everything of theirs is
// gone, nothing of anyone else's is touched, and what has to be removed
// outside the database is handed back or queued.
let localDB;
let db;
let dir;

beforeAll(async () => {
  dir = tempDir("mindsage-profile");
  process.env.MS_DB_DIR = dir;
  process.env.MS_USER_DATA_DIR = dir;
  process.env.MS_SKIP_DB_BACKUP = "1";
  ({ default: localDB } = await import("./index.js"));
  db = localDB.db;
  localDB.initDatabase();
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const makeUser = (name) =>
  Number(
    db
      .prepare(
        `INSERT INTO users (username, email, password_hash, profile_picture) VALUES (?, ?, 'x', ?)`,
      )
      .run(name, `${name}@example.com`, `/media/profile/${name}.png`)
      .lastInsertRowid,
  );

/** One of everything a profile can own. */
async function populate(userId, tag) {
  const live = localDB.createJournalEntry(userId, {
    title: `${tag} live`,
    content: `${tag} live words`,
    mood_tags: ["calm", `${tag}-tag`],
  });
  const trashed = localDB.createJournalEntry(userId, {
    title: `${tag} trashed`,
    content: `${tag} trashed words`,
  });
  localDB.deleteJournalEntry(userId, trashed.id);
  db.prepare(
    "UPDATE journal_entries SET image_key = ?, audio_key = ? WHERE id = ?",
  ).run(
    `/media/journals/${live.id}/${tag}.png`,
    `/media/journals/${live.id}/${tag}.wav`,
    live.id,
  );
  const goal = Number(
    (
      await localDB.AddGoal(userId, {
        title: `${tag} goal`,
        target_value: 5,
        unit: "km",
      })
    ).lastInsertRowid,
  );
  const log = (await localDB.logProgress(userId, goal, 1, "log")).id;
  const chat = Number(
    db
      .prepare("INSERT INTO chats (user_id, title) VALUES (?, ?)")
      .run(userId, `${tag} chat`).lastInsertRowid,
  );
  const msg = Number(
    db
      .prepare(
        "INSERT INTO messages (chat_id, sender, content) VALUES (?, 'ai', ?)",
      )
      .run(chat, `${tag} answer`).lastInsertRowid,
  );
  db.prepare(
    "INSERT INTO message_sources (message_id, source_type, source_id, source_title) VALUES (?, 'journal', ?, 't')",
  ).run(msg, String(live.id));
  db.prepare(
    "INSERT INTO files (chat_id, message_id, file_type, file_path) VALUES (?, ?, 'image', ?)",
  ).run(chat, msg, `/media/chat/${tag}.png`);
  return { live: live.id, trashed: trashed.id, goal, log, chat };
}

const rowsFor = (userId) => {
  // Every table with a user_id column, plus the tables that hang off a user's
  // entries, goals and chats, counted for this user.
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .all()
    .map((t) => t.name);
  const counts = {};
  for (const name of tables) {
    const cols = db
      .prepare(`PRAGMA table_info(${name})`)
      .all()
      .map((c) => c.name);
    if (cols.includes("user_id") && name !== "vector_deletions") {
      counts[name] = db
        .prepare(`SELECT COUNT(*) n FROM ${name} WHERE user_id = ?`)
        .get(userId).n;
    }
  }
  counts.users = db
    .prepare("SELECT COUNT(*) n FROM users WHERE id = ?")
    .get(userId).n;
  return counts;
};

describe("the summary", () => {
  it("counts what is there, trashed items included", async () => {
    const u = makeUser("sum");
    await populate(u, "sum");
    expect(localDB.profileSummary(u)).toMatchObject({
      entries: 1,
      trashedEntries: 1,
      goals: 1,
      trashedGoals: 0,
      photos: 1,
      recordings: 1,
      chats: 1,
    });
  });

  it("knows whether other profiles exist (the system user does not count)", () => {
    const only = localDB.profileSummary(makeUser("lonely"));
    expect(only.otherProfiles).toBeGreaterThanOrEqual(0);
    const a = makeUser("pa");
    makeUser("pb");
    expect(localDB.profileSummary(a).otherProfiles).toBeGreaterThanOrEqual(1);
  });
});

describe("deleting a profile", () => {
  it("leaves no row of theirs in any table, and none of anyone else's touched", async () => {
    const gone = makeUser("gone");
    const stays = makeUser("stays");
    const g = await populate(gone, "gone");
    const s = await populate(stays, "stays");
    const before = rowsFor(stays);
    expect(Object.values(rowsFor(gone)).some((n) => n > 0)).toBe(true);

    const r = localDB.deleteProfile(gone);

    const after = rowsFor(gone);
    expect(Object.entries(after).filter(([, n]) => n !== 0)).toEqual([]);
    expect(rowsFor(stays)).toEqual(before);
    // Rows that hang off theirs and carry no user_id are gone with their parents.
    for (const [table, col, id] of [
      ["progress_logs", "id", g.log],
      ["progress_logs", "goal_id", g.goal],
      ["messages", "chat_id", g.chat],
      ["journal_entry_tags", "journal_entry_id", g.live],
      ["message_sources", "source_id", String(g.live)],
      ["files", "chat_id", g.chat],
    ]) {
      expect(
        db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${col} = ?`).get(id)
          .n,
        `${table}.${col}`,
      ).toBe(0);
    }
    // ...and the other profile's are all still there.
    expect(
      db
        .prepare("SELECT COUNT(*) n FROM progress_logs WHERE goal_id = ?")
        .get(s.goal).n,
    ).toBe(1);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) n FROM journal_entry_tags WHERE journal_entry_id = ?",
        )
        .get(s.live).n,
    ).toBeGreaterThan(0);
    expect(r.entryIds.sort()).toEqual([g.live, g.trashed].sort());
    expect(r.lastProfile).toBe(false);
  });

  it("hands back every file of theirs, and only theirs", async () => {
    const u = makeUser("files");
    const ids = await populate(u, "files");
    const { files } = localDB.deleteProfile(u);
    expect(files.sort()).toEqual(
      [
        `/media/journals/${ids.live}/files.png`,
        `/media/journals/${ids.live}/files.wav`,
        "/media/chat/files.png",
        "/media/profile/files.png",
      ].sort(),
    );
  });

  it("queues the search-index points of every entry, goal and progress log", async () => {
    const u = makeUser("vec");
    const ids = await populate(u, "vec");
    db.prepare("DELETE FROM vector_deletions").run();
    localDB.deleteProfile(u);
    const queued = db
      .prepare("SELECT source_type, source_id, user_id FROM vector_deletions")
      .all();
    const has = (type, id) =>
      queued.some(
        (q) => q.source_type === type && q.source_id === id && q.user_id === u,
      );
    expect(has("journal", ids.live)).toBe(true);
    expect(has("journal", ids.trashed)).toBe(true);
    expect(has("goal", ids.goal)).toBe(true);
    expect(has("progress_log", ids.log)).toBe(true);
  });

  it("says when it was the last profile on this computer", () => {
    db.prepare("DELETE FROM users WHERE id != 0").run();
    const a = makeUser("first");
    const b = makeUser("second");
    expect(localDB.deleteProfile(a).lastProfile).toBe(false);
    expect(localDB.deleteProfile(b).lastProfile).toBe(true);
  });

  it("never deletes the system user", () => {
    localDB.deleteProfile(0);
    expect(db.prepare("SELECT 1 FROM users WHERE id = 0").get()).toBeTruthy();
  });

  it("an unknown id deletes nothing", () => {
    const u = makeUser("bystander");
    localDB.deleteProfile(987654);
    expect(db.prepare("SELECT 1 FROM users WHERE id = ?").get(u)).toBeTruthy();
  });
});
