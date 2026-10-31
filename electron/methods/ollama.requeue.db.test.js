import { afterAll, beforeAll, expect, it, vi } from "vitest";
import fs from "node:fs";
import { tempDir } from "../db/dbTestUtils.js";

// KAN-495: the launch requeue against the real database. A row left 'pending'
// by the last close is retried; an entry saved soon after launch is enriched
// once and never shows failed.
vi.mock("electron", () => ({
  app: { getPath: () => process.env.MS_USER_DATA_DIR },
}));
vi.mock("electron-store", () => ({ default: class {} }));
vi.mock("../session.js", () => ({ currentUserId: () => null }));
vi.mock("../ai/llama.js", () => ({ isDownloaded: () => false }));
vi.mock("../ai/onnx.js", () => ({
  classifyFeelings: async () => null,
  summarySupported: async () => null,
}));
vi.mock("../ai/features.js", async (orig) => ({
  ...(await orig()),
  getFeatures: () => ({ enrich: true, feelings: true, suggestions: true }),
}));
const generate = vi.hoisted(() => vi.fn());
vi.mock("../ai/client.js", () => ({ generate, taskModel: (task) => task }));

const METADATA = '{"title":"A walk","mood":"Good","mood_tags":["Content"]}';
const SUMMARY = "The writer walked home in the rain and felt calm.";
const words = (w) => Array.from({ length: 30 }, (_, i) => `${w}${i}`).join(" ");

let dir;
let db;
let localDB;
let ollama;
let eventBus;
let background;
let userId;

beforeAll(async () => {
  dir = tempDir("mindsage-requeue");
  process.env.MS_DB_DIR = dir;
  process.env.MS_USER_DATA_DIR = dir;
  process.env.MS_SKIP_DB_BACKUP = "1";
  localDB = (await import("../db/index.js")).default;
  db = localDB.db;
  localDB.initDatabase();
  ollama = await import("./ollama.js");
  await import("./journal.js"); // the persisters that mark 'completed'
  ({ eventBus } = await import("../eventBus.js"));
  ({ background } = await import("../ai/queue.js"));
  userId = Number(
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

const insert = (content, status) =>
  Number(
    db
      .prepare(
        `INSERT INTO journal_entries (user_id, title, content, ai_metadata_status, ai_summary_status)
         VALUES (?, '', ?, ?, ?)`,
      )
      .run(userId, content, status, status).lastInsertRowid,
  );
const status = (id) =>
  db
    .prepare(
      `SELECT ai_metadata_status AS metadata, ai_summary_status AS summary
       FROM journal_entries WHERE id = ?`,
    )
    .get(id);
const callsFor = (w) =>
  generate.mock.calls.filter(([prompt]) => prompt.includes(`${w}0`)).length;
const drained = () => background(() => {});

it("requeues a stale row from the last run and leaves a job of this run alone", async () => {
  generate.mockImplementation(async (_prompt, opts) =>
    opts.schema ? METADATA : SUMMARY,
  );
  const stale = insert(words("stale"), "pending");
  const trashed = insert(words("trashed"), "pending");
  db.prepare(`UPDATE journal_entries SET is_deleted = 1 WHERE id = ?`).run(
    trashed,
  );

  // Launch, before the journal handlers register (main.js).
  ollama.markInterruptedEnrichment();
  expect(status(stale)).toEqual({ metadata: "failed", summary: "failed" });
  expect(status(trashed)).toEqual({ metadata: "pending", summary: "pending" });

  // Seconds later the user saves an entry; its job is still running...
  let release;
  generate.mockImplementationOnce(
    () => new Promise((r) => (release = () => r(METADATA))),
  );
  const fresh = insert(words("fresh"), null);
  eventBus.emit("journal:created", {
    entry: localDB.getJournalById(userId, fresh),
  });
  await vi.waitFor(() => expect(callsFor("fresh")).toBe(1));

  // ...when the 20 s launch timer fires.
  ollama.backfillEnrichment();
  expect(status(fresh)).toEqual({ metadata: "pending", summary: "pending" });

  release();
  await drained();
  expect(callsFor("fresh")).toBe(2); // details once, summary once
  expect(status(fresh)).toEqual({
    metadata: "completed",
    summary: "completed",
  });
  expect(callsFor("stale")).toBe(2);
  expect(status(stale)).toEqual({
    metadata: "completed",
    summary: "completed",
  });
  expect(callsFor("trashed")).toBe(0);
});
