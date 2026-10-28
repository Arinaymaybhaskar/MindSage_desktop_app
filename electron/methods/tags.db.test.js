import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tempDir } from "../db/dbTestUtils.js";

// Feeling words in the user's own words (KAN-94) against the real database:
// any script, a family required, built-in words matched rather than copied,
// and the words reaching the export and the most-used tag.
vi.mock("electron", () => ({
  app: { getPath: () => process.env.MS_USER_DATA_DIR },
  ipcMain: { handle: () => {}, on: () => {} },
  dialog: {},
  BrowserWindow: { getAllWindows: () => [] },
}));
vi.mock("electron-store", () => ({
  default: class {
    get() {
      return undefined;
    }
    set() {}
  },
}));
const session = vi.hoisted(() => ({ userId: null }));
vi.mock("../session.js", () => ({
  requireUserId: () => {
    if (!session.userId) throw new Error("Not signed in");
    return session.userId;
  },
  currentUserId: () => session.userId,
}));
vi.mock("./ollama.js", () => ({ backfillEnrichment: () => {} }));
vi.mock("../ai/llama.js", () => ({ modelsReady: () => false }));
vi.mock("./search.js", () => ({ getIndexer: () => ({ sweep: () => {} }) }));

let localDB;
let db;
let tags;
let dir;
let ada;
let bob;

beforeAll(async () => {
  dir = tempDir("mindsage-tags");
  process.env.MS_DB_DIR = dir;
  process.env.MS_USER_DATA_DIR = dir;
  process.env.MS_SKIP_DB_BACKUP = "1";
  ({ default: localDB } = await import("../db/index.js"));
  tags = await import("./tags.js");
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
  ada = make("ada");
  bob = make("bob");
  session.userId = ada;
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const add = (name, family) => tags.handleAddCustomWord(null, { name, family });
const tagRows = (userId) =>
  db
    .prepare(`SELECT name, family FROM tags WHERE user_id = ? ORDER BY id`)
    .all(userId);

describe("adding a word of your own", () => {
  it("keeps Devanagari and RTL text exactly as written, with its family", () => {
    expect(add("  खुशी  ", "Happy")).toEqual({ name: "खुशी", family: "Happy" });
    // A right-to-left mark first, as RTL keyboards often type one.
    const rtl = "‏מתגעגע";
    expect(add(rtl, "Sad")).toEqual({ name: rtl, family: "Sad" });
    expect(tagRows(ada)).toEqual([
      { name: "खुशी", family: "Happy" },
      { name: rtl, family: "Sad" },
    ]);
  });

  it("requires a family, and refuses an empty word or one that would split", () => {
    expect(add("wistful", undefined).error).toMatch(/family/);
    expect(add("wistful", "Nope").error).toMatch(/family/);
    expect(add("   ", "Sad").error).toBeTruthy();
    expect(add("a, b", "Sad").error).toBeTruthy();
    expect(add("x".repeat(41), "Sad").error).toBeTruthy();
    expect(tagRows(ada).map((t) => t.name)).not.toContain("wistful");
  });

  it("matches a built-in word that differs by case or accents", () => {
    const before = tagRows(ada).length;
    expect(add("CONTENT", "Sad")).toEqual({ name: "Content", family: "Happy" });
    expect(add("Contént", "Sad")).toEqual({ name: "Content", family: "Happy" });
    expect(add("anxious", undefined)).toEqual({
      name: "Anxious",
      family: "Fearful",
    });
    expect(tagRows(ada)).toHaveLength(before);
  });

  it("matches a word of the user's own by case or accents, not a new row", () => {
    add("Hüzün", "Sad");
    const before = tagRows(ada).length;
    expect(add("huzun", "Bad")).toEqual({ name: "Hüzün", family: "Sad" });
    expect(tagRows(ada)).toHaveLength(before);
  });

  it("gives an imported tag of the same name a family instead of a copy", () => {
    db.prepare(`INSERT INTO tags (user_id, name) VALUES (?, 'Rainy')`).run(ada);
    expect(add("rainy", "Bad")).toEqual({ name: "Rainy", family: "Bad" });
  });

  it("keeps each profile's words apart", () => {
    expect(tagRows(bob)).toEqual([]);
  });
});

describe("the user's words in use", () => {
  it("lists them most used first, counting only entries not in the Trash", () => {
    const entry = (tagNames, extra = {}) =>
      localDB.createJournalEntry(ada, {
        content: "x",
        mood_tags: tagNames,
        ...extra,
      });
    entry(["Rainy"]);
    entry(["Rainy", "खुशी"]);
    const trashed = entry(["खुशी"]);
    entry(["खुशी"]);
    entry(["खुशी"]);
    db.prepare(`UPDATE journal_entries SET is_deleted = 1 WHERE id = ?`).run(
      trashed.id,
    );

    const words = tags.handleListCustomWords();
    expect(words.slice(0, 2)).toEqual([
      { name: "खुशी", family: "Happy", uses: 3 },
      { name: "Rainy", family: "Bad", uses: 2 },
    ]);
    // Built-in words are not "your own".
    expect(words.map((w) => w.name)).not.toContain("Content");
    expect(localDB.customFeelingWords(ada, 1)).toHaveLength(1);
  });

  it("reach the most-used tag on the dashboard", () => {
    expect(localDB.getUserStats(ada).mostUsedTag).toBe("खुशी");
  });

  it("reach the export unchanged", async () => {
    const rtl = tagRows(ada)[1].name;
    localDB.createJournalEntry(ada, { content: "y", mood_tags: [rtl] });
    const { handleExportJournal } = await import("./portability.js");
    const destinationPath = path.join(dir, "out.csv");
    await handleExportJournal(null, { format: "csv", destinationPath });
    const csv = fs.readFileSync(destinationPath, "utf8");
    expect(csv).toMatch(/,(Rainy\|खुशी|खुशी\|Rainy),/);
    expect(csv).toContain(rtl);
  });
});
