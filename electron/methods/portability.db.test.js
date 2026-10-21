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
vi.mock("electron-store", () => ({
  default: class {
    get() {
      return undefined;
    }
    set() {}
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
