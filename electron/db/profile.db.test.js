import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tempDir } from "./dbTestUtils.js";

// The delete runs through methods/profileDelete.js, as the app's handler does,
// which reaches Electron for the userData folder and electron-store for the
// session. Both stand in here; userData is this test's temp folder.
vi.mock("electron", () => ({
  app: { getPath: () => process.env.MS_USER_DATA_DIR },
  ipcMain: { handle: () => {}, on: () => {} },
  BrowserWindow: { getAllWindows: () => [] },
}));
const storeData = vi.hoisted(() => new Map());
vi.mock("electron-store", () => ({
  default: class {
    get(key) {
      return storeData.get(key) ?? null;
    }
    set(key, value) {
      storeData.set(key, value);
    }
    delete(key) {
      storeData.delete(key);
    }
  },
}));

// Deleting a whole profile against the real database: everything of theirs is
// gone, nothing of anyone else's is touched, and what has to be removed
// outside the database is handed back.
let localDB;
let idx;
let db;
let dir;

beforeAll(async () => {
  dir = tempDir("mindsage-profile");
  process.env.MS_DB_DIR = dir;
  process.env.MS_USER_DATA_DIR = dir;
  process.env.MS_SKIP_DB_BACKUP = "1";
  ({ default: localDB } = await import("./index.js"));
  idx = await import("./searchIndex.js");
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
  const person = Number(
    db
      .prepare(
        "INSERT INTO people (user_id, display_name, status) VALUES (?, ?, 'confirmed')",
      )
      .run(userId, `${tag} friend`).lastInsertRowid,
  );
  db.prepare(
    "INSERT INTO person_aliases (person_id, alias, alias_normalised) VALUES (?, ?, ?)",
  ).run(person, `${tag} friend`, `${tag} friend`);
  db.prepare(
    "INSERT INTO person_mentions (entry_id, person_id, name_as_written, sentence_start, sentence_end, extractor_version) VALUES (?, ?, ?, 0, 4, 1)",
  ).run(live.id, person, `${tag} friend`);
  db.prepare(
    "INSERT INTO person_summaries (person_id, summary_json, mentions_hash) VALUES (?, ?, 'h')",
  ).run(person, JSON.stringify([`${tag} summary`]));
  db.prepare("INSERT INTO people_jobs (entry_id, user_id) VALUES (?, ?)").run(
    live.id,
    userId,
  );
  return { live: live.id, trashed: trashed.id, goal, log, chat, person };
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
      ["person_aliases", "person_id", g.person],
      ["person_mentions", "person_id", g.person],
      ["person_summaries", "person_id", g.person],
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

  it("removes the vectors and index state of every entry, goal and progress log", async () => {
    const u = makeUser("vec");
    const ids = await populate(u, "vec");
    const other = makeUser("vecother");
    const keep = await populate(other, "vecother");
    const index = (type, id, n) => {
      const source = idx.loadSource(type, id);
      idx.markStale(type, id, source.userId);
      const v = new Array(768).fill(0);
      v[n] = 1;
      expect(idx.storeVector(type, id, v, source.hash)).toBe("ok");
    };
    index("journal", ids.live, 1);
    index("goal", ids.goal, 2);
    index("progress_log", ids.log, 3);
    index("journal", keep.live, 4);
    const before = db.prepare("SELECT COUNT(*) n FROM vec_entries").get().n;

    localDB.deleteProfile(u);

    expect(idx.getState("journal", ids.live)).toBeNull();
    expect(idx.getState("goal", ids.goal)).toBeNull();
    expect(idx.getState("progress_log", ids.log)).toBeNull();
    expect(db.prepare("SELECT COUNT(*) n FROM vec_entries").get().n).toBe(
      before - 3,
    );
    // Another profile's vector is untouched.
    expect(idx.getState("journal", keep.live)).not.toBeNull();
  });

  it("drops the profile's last-import record and keeps others' (KAN-441)", async () => {
    const { getLast, setLast } = await import("../lastImport.js");
    const gone = makeUser("importgone");
    const kept = makeUser("importkept");
    const record = { at: "2026-01-01", source: "x", ids: [1], edited: false };
    setLast(gone, record);
    setLast(kept, record);
    const { deleteProfileEverything } =
      await import("../methods/profileDelete.js");
    await deleteProfileEverything(gone);
    expect(getLast(gone)).toBeNull();
    expect(getLast(kept)).toEqual(record);
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

describe("after a profile is deleted, no file holds its text (KAN-371)", () => {
  // Every file under the profile folder, read as raw bytes: the database, its
  // -wal and -shm, the backups, logs and the pending-deletions list.
  const filesUnder = (root) =>
    fs.readdirSync(root, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(root, e.name);
      return e.isDirectory() ? filesUnder(full) : [full];
    });
  const filesHolding = (word) =>
    filesUnder(dir)
      .filter((f) => fs.readFileSync(f).includes(Buffer.from(word, "utf8")))
      .map((f) => path.relative(dir, f));

  it("the database file, its WAL and shm, and the fresh backup hold none of it", async () => {
    const gone = "zebrafinchgone";
    const kept = "otterkeptstays";
    const u = makeUser(gone);
    const other = makeUser(kept);
    const writeAll = async (userId, word, n) => {
      const entry = localDB.createJournalEntry(userId, {
        title: `${word} title ${n}`,
        content: `Today the ${word} note number ${n} was written. `.repeat(20),
        mood_tags: [`${word}-tag-${n}`],
      });
      await localDB.AddGoal(userId, {
        title: `${word} goal ${n}`,
        target_value: 3,
        unit: "km",
      });
      const chat = Number(
        db
          .prepare("INSERT INTO chats (user_id, title) VALUES (?, ?)")
          .run(userId, `${word} chat ${n}`).lastInsertRowid,
      );
      const msg = Number(
        db
          .prepare(
            "INSERT INTO messages (chat_id, sender, content) VALUES (?, 'user', ?)",
          )
          .run(chat, `What did the ${word} say ${n}?`).lastInsertRowid,
      );
      db.prepare(
        "INSERT INTO files (chat_id, message_id, file_type, file_path) VALUES (?, ?, 'image', ?)",
      ).run(chat, msg, `/media/chat/${word}-${n}.png`);
      return entry.id;
    };
    // The first batch reaches the main file (as the automatic checkpoint at
    // 1000 pages would have done), the second is only in the WAL.
    await writeAll(u, gone, 1);
    await writeAll(other, kept, 1);
    db.pragma("wal_checkpoint(TRUNCATE)");
    await writeAll(u, gone, 2);
    await writeAll(other, kept, 2);
    expect(filesHolding(gone)).toContain("mind-sage.db");
    expect(filesHolding(gone).some((f) => f.endsWith("-wal"))).toBe(true);

    // The app's own path: the handler calls deleteProfileEverything. A fresh
    // backup is made after the rows go, as with other profiles left.
    delete process.env.MS_SKIP_DB_BACKUP;
    let result;
    try {
      const { deleteProfileEverything } =
        await import("../methods/profileDelete.js");
      result = await deleteProfileEverything(u);
    } finally {
      process.env.MS_SKIP_DB_BACKUP = "1";
    }

    expect(filesHolding(gone)).toEqual([]);
    expect(result.lastProfile).toBe(false);
    expect(result.walFolded).toBe(true);
    // The scan does find text that is still there: the other profile's.
    expect(filesHolding(kept)).toContain("mind-sage.db");
    expect(
      filesHolding(kept).some((f) => f.startsWith(`backups${path.sep}`)),
    ).toBe(true);
    const wal = path.join(dir, "mind-sage.db-wal");
    if (fs.existsSync(wal)) expect(fs.statSync(wal).size).toBe(0);
  });
});
