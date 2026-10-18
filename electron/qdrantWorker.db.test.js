import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { tempDir } from "./db/dbTestUtils.js";

// The background AI worker, run for real as a worker thread against a real
// SQLite database, with fake Ollama and fake Qdrant servers on the network
// boundary. Nothing inside the worker is replaced, so breaking its message
// handling, its SQL, or the bookkeeping it does on failure fails these tests.
//
// The worker reaches Ollama at a fixed http://localhost:11434, so the fake
// has to own that port; the suite skips (loudly) if a real Ollama is there.

const workerFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "qdrantWorker.js",
);

const EMBEDDING = [0.25, -0.5, 0.75];
const ollama = { requests: [], mode: "ok" };
const qdrant = {
  requests: [],
  mode: "ok",
  // The client also makes housekeeping calls (a version check); the tests
  // care about the writes.
  get upserts() {
    return this.requests.filter((r) => r.method === "PUT");
  },
};
let ollamaServer;
let qdrantServer;
let ollamaFree = true;
let dir;
let localDB;
let worker;
let events;
let user;

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString() || "null"));
  });

function listen(handler, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.once("error", reject);
    server.listen(port, () => resolve(server));
  });
}

beforeAll(async () => {
  dir = tempDir("mindsage-worker");
  process.env.MS_DB_DIR = dir;
  process.env.MS_USER_DATA_DIR = dir;
  process.env.MS_SKIP_DB_BACKUP = "1";
  ({ default: localDB } = await import("./db/index.js"));
  localDB.initDatabase();
  user = localDB.createUser({
    username: "worker",
    email: "worker@example.com",
    password: "pw-worker-1",
    full_name: "Worker",
  });

  qdrantServer = await listen(async (req, res) => {
    const body = JSON.parse(await readBody(req));
    qdrant.requests.push({ method: req.method, url: req.url, body });
    if (qdrant.mode === "down") {
      res.writeHead(500, { "content-type": "application/json" });
      return res.end(JSON.stringify({ status: { error: "qdrant is down" } }));
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        result: { operation_id: 1, status: "completed" },
        status: "ok",
        time: 0,
      }),
    );
  }, 0);

  try {
    ollamaServer = await listen(async (req, res) => {
      const body = JSON.parse(await readBody(req));
      ollama.requests.push({ method: req.method, url: req.url, body });
      if (ollama.mode === "down") {
        res.writeHead(500);
        return res.end("model not loaded");
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ embedding: EMBEDDING }));
    }, 11434);
  } catch (err) {
    ollamaFree = false;
    console.warn(
      `SKIPPING worker tests: port 11434 is taken (${err.code}). Stop Ollama to run them.`,
    );
  }

  worker = new Worker(workerFile, {
    env: {
      ...process.env,
      QDRANT_HTTP_PORT: String(qdrantServer.address().port),
    },
  });
  events = [];
  worker.on("message", (m) => events.push(m));
  worker.on("error", (e) =>
    events.push({ type: "worker-error", error: String(e) }),
  );
  // The worker says so once its listeners are registered.
  await waitFor(() =>
    events.some((m) => /Qdrant worker started/.test(String(m))),
  );
});

afterAll(async () => {
  await worker?.terminate();
  await new Promise((r) => ollamaServer?.close(r) ?? r());
  await new Promise((r) => qdrantServer?.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  ollama.requests.length = 0;
  ollama.mode = "ok";
  qdrant.requests.length = 0;
  qdrant.mode = "ok";
  events.length = 0;
});

async function waitFor(predicate, ms = 15_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(
    `timed out; worker said: ${JSON.stringify(events.slice(-8))}`,
  );
}

const activity = (event, match = () => true) =>
  events.find(
    (m) => m?.type === "ai-activity" && m.event === event && match(m.data),
  );

const entry = (overrides = {}) =>
  localDB.createJournalEntry(user.id, {
    title: "A walk",
    content: "I felt calm after walking by the river.",
    mood_score: 4,
    mood_tags: ["calm"],
    ...overrides,
  });

const status = (id) =>
  localDB.db
    .prepare(
      "SELECT synced_to_qdrant AS s, qdrant_id FROM journal_entries WHERE id = ?",
    )
    .get(id);

const sync = (journalId) =>
  worker.postMessage({ type: "journal:sync-requested", data: { journalId } });

describe("the worker indexes a journal entry", () => {
  it.skipIf(!ollamaFree)(
    "embeds its title and text, upserts the point, and marks it synced",
    async () => {
      const e = entry();
      sync(e.id);
      await waitFor(() =>
        activity("journal:indexCompleted", (d) => d.entryId === e.id),
      );

      expect(ollama.requests).toHaveLength(1);
      expect(ollama.requests[0]).toMatchObject({
        method: "POST",
        url: "/api/embeddings",
        body: {
          model: "nomic-embed-text:v1.5",
          prompt: "A walk I felt calm after walking by the river.",
        },
      });
      expect(qdrant.upserts).toHaveLength(1);
      const { method, url, body } = qdrant.upserts[0];
      expect(method).toBe("PUT");
      expect(url).toMatch(/^\/collections\/mind_entries\/points/);
      const [point] = body.points;
      expect(point.vectors ?? point.vector).toEqual({
        text_embedding: EMBEDDING,
      });
      expect(point.payload).toMatchObject({
        user_id: user.id,
        source_type: "journal",
        source_id: e.id,
        title: "A walk",
        content: "I felt calm after walking by the river.",
        mood_score: 4,
      });

      const row = status(e.id);
      expect(row.s).toBe("success");
      expect(row.qdrant_id).toBe(point.id);
      expect(
        activity("journal:indexStarted", (d) => d.entryId === e.id),
      ).toBeTruthy();
    },
  );

  it.skipIf(!ollamaFree)(
    "re-syncing an edited entry updates its point instead of adding another",
    async () => {
      const e = entry();
      sync(e.id);
      await waitFor(() =>
        activity("journal:indexCompleted", (d) => d.entryId === e.id),
      );
      const firstId = qdrant.upserts[0].body.points[0].id;

      events.length = 0;
      localDB.updateJournalEntry(user.id, e.id, {
        title: "A longer walk",
        content: "Edited text.",
        mood_tags: [],
      });
      sync(e.id);
      await waitFor(() =>
        activity("journal:indexCompleted", (d) => d.entryId === e.id),
      );

      expect(qdrant.upserts).toHaveLength(2);
      expect(qdrant.upserts[1].body.points[0].id).toBe(firstId);
      expect(qdrant.upserts[1].body.points[0].payload.content).toBe(
        "Edited text.",
      );
      expect(ollama.requests[1].body.prompt).toBe("A longer walk Edited text.");
    },
  );

  it.skipIf(!ollamaFree)(
    "an entry with no title embeds just its text",
    async () => {
      const e = entry({ title: undefined, content: "only words" });
      sync(e.id);
      await waitFor(() =>
        activity("journal:indexCompleted", (d) => d.entryId === e.id),
      );
      expect(ollama.requests[0].body.prompt).toBe("only words");
    },
  );
});

describe("when something it depends on is down", () => {
  it.skipIf(!ollamaFree)(
    "Ollama failing marks the entry failed, tells the window, and never reaches Qdrant",
    async () => {
      const e = entry();
      ollama.mode = "down";
      sync(e.id);
      await waitFor(() =>
        activity("journal:indexFailed", (d) => d.entryId === e.id),
      );

      expect(status(e.id).s).toBe("failed");
      expect(activity("journal:indexFailed").data.error).toMatch(
        /Ollama embedding API error: 500/,
      );
      expect(qdrant.upserts).toHaveLength(0);
      expect(activity("journal:indexCompleted")).toBeUndefined();
    },
  );

  it.skipIf(!ollamaFree)(
    "Qdrant failing marks the entry failed and leaves no qdrant_id behind",
    async () => {
      const e = entry();
      qdrant.mode = "down";
      sync(e.id);
      await waitFor(() =>
        activity("journal:indexFailed", (d) => d.entryId === e.id),
      );

      expect(status(e.id)).toEqual({ s: "failed", qdrant_id: null });
    },
  );

  it.skipIf(!ollamaFree)(
    "a failed entry is picked up and fixed by the next bulk sync",
    async () => {
      const e = entry();
      ollama.mode = "down";
      sync(e.id);
      await waitFor(() =>
        activity("journal:indexFailed", (d) => d.entryId === e.id),
      );

      ollama.mode = "ok";
      events.length = 0;
      worker.postMessage({ type: "journal:bulk-sync-requested" });
      await waitFor(() => activity("qdrant:bulkCompleted"));
      expect(status(e.id).s).toBe("success");
    },
  );
});

describe("bulk sync", () => {
  it.skipIf(!ollamaFree)(
    "syncs every entry that is not yet synced, skips the rest, and reports one aggregate",
    async () => {
      // Everything earlier tests left behind is settled first.
      worker.postMessage({ type: "journal:bulk-sync-requested" });
      await waitFor(() => activity("qdrant:bulkCompleted"));
      events.length = 0;
      ollama.requests.length = 0;
      qdrant.requests.length = 0;

      const fresh = [
        entry({ title: "one" }),
        entry({ title: "two" }),
        entry({ title: "three" }),
      ];
      const done = entry({ title: "already done" });
      localDB.db
        .prepare(
          "UPDATE journal_entries SET synced_to_qdrant = 'success' WHERE id = ?",
        )
        .run(done.id);
      localDB.db
        .prepare(
          "UPDATE journal_entries SET synced_to_qdrant = NULL WHERE id = ?",
        )
        .run(fresh[2].id);

      worker.postMessage({ type: "journal:bulk-sync-requested" });
      await waitFor(() => activity("qdrant:bulkCompleted"));

      expect(ollama.requests).toHaveLength(3);
      expect(qdrant.upserts).toHaveLength(3);
      for (const f of fresh) expect(status(f.id).s).toBe("success");
      expect(status(done.id).qdrant_id).toBeNull(); // untouched

      expect(activity("qdrant:bulkStarted").data).toEqual({
        kind: "journals",
        total: 3,
      });
      expect(activity("qdrant:bulkCompleted").data).toEqual({
        kind: "journals",
        total: 3,
        failed: 0,
      });
      // One aggregate row, not one per entry.
      expect(activity("journal:indexStarted")).toBeUndefined();
      expect(
        events.filter((m) => m?.event === "qdrant:bulkProgress"),
      ).toHaveLength(3);
    },
  );
});

describe("messages it should shrug off", () => {
  it("a sync request for an entry that does not exist does nothing and does not crash", async () => {
    sync(987_654);
    await waitFor(() =>
      events.some((m) => /Journal 987654 not found/.test(String(m))),
    );
    expect(ollama.requests).toHaveLength(0);
    expect(qdrant.upserts).toHaveLength(0);
    expect(events.some((m) => m?.type === "worker-error")).toBe(false);
  });

  it("an unknown message type is ignored and the worker keeps working", async () => {
    worker.postMessage({ type: "something:unheard-of", data: {} });
    sync(987_655);
    await waitFor(() =>
      events.some((m) => /Journal 987655 not found/.test(String(m))),
    );
    expect(events.some((m) => m?.type === "worker-error")).toBe(false);
  });
});
