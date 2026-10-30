import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tempDir } from "../db/dbTestUtils.js";

// Import during setup (KAN-80) against the real database: a 5,000-entry
// import is written in chunks that yield, reports progress by name, skips
// per-entry AI and marks only the newest entries for the one backfill.
const sent = vi.hoisted(() => []);
vi.mock("electron", () => ({
  app: { getPath: () => process.env.MS_USER_DATA_DIR },
  ipcMain: { handle: () => {}, on: () => {} },
  dialog: {},
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: { send: (channel, payload) => sent.push(payload) },
      },
    ],
  },
}));
// One map for every instance, so a fresh module (a restart) reads what the
// last one saved, like the store file on disk.
const saved = vi.hoisted(() => new Map());
vi.mock("electron-store", () => ({
  default: class {
    get(key) {
      return saved.has(key) ? structuredClone(saved.get(key)) : undefined;
    }
    set(key, value) {
      saved.set(key, structuredClone(value));
    }
    delete(key) {
      saved.delete(key);
    }
  },
}));
const session = vi.hoisted(() => ({ userId: null }));
vi.mock("../session.js", () => ({ currentUserId: () => session.userId }));
const backfillEnrichment = vi.hoisted(() => vi.fn());
vi.mock("./ollama.js", () => ({ backfillEnrichment }));
vi.mock("../ai/llama.js", () => ({ modelsReady: () => false }));
const sweep = vi.hoisted(() => vi.fn());
vi.mock("./search.js", () => ({ getIndexer: () => ({ sweep }) }));

let db;
let portability;
let dir;

beforeAll(async () => {
  dir = tempDir("mindsage-import");
  process.env.MS_DB_DIR = dir;
  process.env.MS_USER_DATA_DIR = dir;
  process.env.MS_SKIP_DB_BACKUP = "1";
  const { default: localDB } = await import("../db/index.js");
  portability = await import("./portability.js");
  db = localDB.db;
  localDB.initDatabase();
  session.userId = Number(
    db
      .prepare(
        `INSERT INTO users (username, email, password_hash) VALUES ('ada', 'ada@example.com', 'x')`,
      )
      .run().lastInsertRowid,
  );
});

afterAll(() => {
  db?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const text = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");

describe("import of 5,000 entries (KAN-80)", () => {
  it("writes in chunks, names the work and marks the newest for the backfill", async () => {
    const day = (i) =>
      new Date(Date.UTC(2010, 0, 1) + i * 86_400_000).toISOString();
    const rows = Array.from(
      { length: 5000 },
      (_, i) => `${day(i)},"${text} ${i}"`,
    );
    const file = path.join(dir, "journal.csv");
    fs.writeFileSync(file, ["date,text", ...rows].join("\n"));

    const preview = await portability.handleReadImport(null, [file]);
    expect(preview).toMatchObject({ format: "csv", toImport: 5000 });

    const result = await portability.handleCommitImport();
    expect(result.imported).toBe(5000);

    const progress = sent.filter((p) => p.event === "import:bulkProgress");
    expect(progress.length).toBeGreaterThan(1);
    expect(progress[0].data.kind).toBe("CSV entries");
    expect(sent.at(-1)).toMatchObject({
      event: "import:bulkCompleted",
      data: { done: 5000, failed: 0 },
    });

    const counts = Object.fromEntries(
      db
        .prepare(
          `SELECT ai_summary_status AS s, COUNT(*) AS n FROM journal_entries
            WHERE user_id = ? AND is_deleted = 0 GROUP BY s`,
        )
        .all(session.userId)
        .map((r) => [r.s, r.n]),
    );
    expect(counts).toEqual({ failed: 200, not_started: 4800 });
    const newest = db
      .prepare(
        `SELECT ai_metadata_status, created_at FROM journal_entries
          WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at DESC LIMIT 1`,
      )
      .get(session.userId);
    expect(newest.ai_metadata_status).toBe("failed");

    // No models yet: enrichment waits for ai:models-ready; search indexes once.
    expect(backfillEnrichment).not.toHaveBeenCalled();
    expect(sweep).toHaveBeenCalledTimes(1);
  });
});

describe("last import with Undo (KAN-74)", () => {
  let n = 0;
  // A CSV of `count` entries with text no other test uses.
  const importCsv = async (count) => {
    const tag = `batch${++n}`;
    const file = path.join(dir, `${tag}.csv`);
    const rows = Array.from(
      { length: count },
      (_, i) => `2020-0${n}-1${i}T10:00:00Z,"${tag} entry ${i}"`,
    );
    fs.writeFileSync(file, ["date,text", ...rows].join("\n"));
    await portability.handleReadImport(null, [file]);
    await portability.handleCommitImport();
    return db
      .prepare(
        "SELECT id FROM journal_entries WHERE user_id = ? AND content LIKE ? ORDER BY id",
      )
      .all(session.userId, `${tag} %`)
      .map((r) => r.id);
  };
  const live = (ids) =>
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM journal_entries WHERE id IN (${ids.join(",")})`,
      )
      .get().n;

  it("undoes only the latest import, with its AI data and index rows, after a restart", async () => {
    const first = await importCsv(2);
    const second = await importCsv(3);
    const own = Number(
      db
        .prepare(
          "INSERT INTO journal_entries (user_id, content) VALUES (?, 'written here')",
        )
        .run(session.userId).lastInsertRowid,
    );
    db.prepare(
      "INSERT INTO search_index (user_id, source_type, source_id) VALUES (?, 'journal', ?)",
    ).run(session.userId, second[0]);
    db.prepare(
      "INSERT INTO journal_analysis (journal_id, sentiment) VALUES (?, 'calm')",
    ).run(second[0]);

    // A restart: a fresh module with nothing in memory, the store on disk.
    vi.resetModules();
    const restarted = await import("./portability.js");
    expect(await restarted.handleLastImport()).toEqual({
      at: expect.any(String),
      source: "CSV",
      count: 3,
      edited: false,
    });
    expect(await restarted.handleUndoImport()).toEqual({ removed: 3 });

    expect(live(second)).toBe(0);
    expect(live(first)).toBe(2);
    expect(live([own])).toBe(1);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM search_index WHERE source_type = 'journal' AND source_id = ?",
        )
        .get(second[0]).n,
    ).toBe(0);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM journal_analysis WHERE journal_id = ?",
        )
        .get(second[0]).n,
    ).toBe(0);
    // The earlier import was replaced, so there is nothing left to undo.
    expect(await restarted.handleLastImport()).toBeNull();
    await expect(restarted.handleUndoImport()).rejects.toThrow(
      /No import to undo/,
    );
    (await import("../db/connection.js")).db.close();
  });

  it("turns Undo off once an imported entry is edited", async () => {
    const ids = await importCsv(2);
    const { eventBus } = await import("../eventBus.js");
    // What handleUpdateJournal emits when the person saves an entry.
    eventBus.emit("journal:edited", {
      userId: session.userId,
      entry: { id: ids[1] },
    });
    expect(await portability.handleLastImport()).toMatchObject({
      count: 2,
      edited: true,
    });
    await expect(portability.handleUndoImport()).rejects.toThrow(/edited/);
    expect(live(ids)).toBe(2);
  });

  it("turns Undo off once a feeling is accepted on an imported entry (KAN-479)", async () => {
    const ids = await importCsv(2);
    db.prepare(
      "UPDATE journal_entries SET suggested_tags = ? WHERE id = ?",
    ).run(JSON.stringify(["calm"]), ids[0]);
    // The earlier restart closed its connection: start fresh modules.
    vi.resetModules();
    const fresh = await import("./portability.js");
    const { handleAcceptFeeling } = await import("./journal.js");
    try {
      await handleAcceptFeeling(null, ids[0], "calm");
      expect(await fresh.handleLastImport()).toMatchObject({ edited: true });
      await expect(fresh.handleUndoImport()).rejects.toThrow(/edited/);
      expect(live(ids)).toBe(2);
      expect(
        db
          .prepare(
            `SELECT t.name FROM journal_entry_tags jt
               JOIN tags t ON t.id = jt.tag_id WHERE jt.journal_entry_id = ?`,
          )
          .pluck()
          .all(ids[0]),
      ).toEqual(["calm"]);
    } finally {
      (await import("../db/connection.js")).db.close();
    }
  });
});
