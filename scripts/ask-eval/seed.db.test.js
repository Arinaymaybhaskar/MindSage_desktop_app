import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { tempDir } from "../../electron/db/dbTestUtils.js";
import { buildJournal } from "./journal.mjs";
import { seedJournal } from "./seed.mjs";

// The demo journal written to a real database (KAN-445): the right rows, in
// the right profiles, and Ask's tools show A only A's live rows.
vi.mock("electron", () => ({
  ipcMain: { handle: () => {} },
  BrowserWindow: { getAllWindows: () => [] },
}));
const VEC = Array.from({ length: 768 }, (_, i) => (i === 3 ? 1 : 0));
vi.mock("../../electron/ai/client.js", () => ({
  embed: vi.fn(async () => VEC),
}));
const session = vi.hoisted(() => ({ userId: null }));
vi.mock("../../electron/session.js", () => ({
  currentUserId: () => session.userId,
}));

let dir;
let db;
let seeded;
const journal = buildJournal();

beforeAll(async () => {
  dir = tempDir("mindsage-ask-eval");
  process.env.MS_DB_DIR = dir;
  process.env.MS_USER_DATA_DIR = dir;
  process.env.MS_SKIP_DB_BACKUP = "1";
  const { default: localDB } = await import("../../electron/db/index.js");
  const index = await import("../../electron/db/searchIndex.js");
  db = localDB.db;
  localDB.initDatabase();
  seeded = await seedJournal({ db, localDB, index }, journal, async () => VEC);
  session.userId = seeded.userIds.A;
});
afterAll(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const count = (sql, ...p) => db.prepare(sql).get(...p).n;

describe("seedJournal", () => {
  it("writes both profiles, their entries and the trashed ones", () => {
    const { A, B } = seeded.userIds;
    expect(A).not.toBe(B);
    expect(seeded.entries).toBe(journal.entries.length);
    const own = (id, deleted) =>
      count(
        `SELECT COUNT(*) n FROM journal_entries WHERE user_id = ? AND is_deleted = ?`,
        id,
        deleted,
      );
    expect(own(A, 1)).toBe(
      journal.entries.filter((e) => e.user === "A" && e.trashed).length,
    );
    expect(own(A, 0)).toBe(journal.live.length);
    expect(own(B, 0)).toBe(
      journal.entries.filter((e) => e.user === "B").length,
    );
  });

  it("keeps entry dates, moods and feeling words", () => {
    const e = journal.entry("lisbon1");
    const row = db
      .prepare(`SELECT * FROM journal_entries WHERE title = ? AND user_id = ?`)
      .get(e.title, seeded.userIds.A);
    expect(row.created_at).toBe(e.created_at);
    expect(row.mood_score).toBe(5);
    expect(
      count(
        `SELECT COUNT(*) n FROM journal_entry_tags WHERE journal_entry_id = ?`,
        row.id,
      ),
    ).toBe(1);
  });

  it("writes goals with their logs, the completed and the trashed", () => {
    expect(count(`SELECT COUNT(*) n FROM goals`)).toBe(journal.goals.length);
    expect(count(`SELECT COUNT(*) n FROM goals WHERE is_completed = 1`)).toBe(
      journal.goals.filter((g) => g.completed).length,
    );
    expect(count(`SELECT COUNT(*) n FROM goals WHERE is_deleted = 1`)).toBe(1);
    expect(count(`SELECT COUNT(*) n FROM progress_logs`)).toBe(
      journal.goals.reduce((n, g) => n + g.logs.length, 0),
    );
  });

  it("indexes every live entry, so search has something to search", () => {
    expect(
      count(`SELECT COUNT(*) n FROM search_index WHERE state = 'ok'`),
    ).toBe(journal.entries.filter((e) => !e.trashed).length);
  });

  it("shows profile A none of B's rows and none of the Trash", async () => {
    const { runTool } = await import("../../electron/methods/askTools.js");
    const wide = { from: "2000-01-01", to: journal.today, limit: 10 };
    const seen = [];
    seen.push(
      (await runTool("get_entries_by_date", wide)).text,
      (await runTool("search_entries", { query: "codename", limit: 10 })).text,
      (await runTool("search_entries", { query: "singing group", limit: 10 }))
        .text,
      (await runTool("get_goals", { status: "all" })).text,
    );
    const text = seen.join("\n");
    for (const word of [
      "Kestrel",
      "Zephyr",
      "baritone",
      "Zanzibar",
      "Goa",
      "unicycle",
    ])
      expect(text).not.toContain(word);
    expect(text).toContain("Run 100 km");
  });
});
