import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { tempDir } from "../db/dbTestUtils.js";

// The indexer loop against the real database, with a fake embedding model.
let localDB;
let db;
let idx;
let createIndexer;
let dir;
let alice;

const DIM = 768;
const unit = (n) => {
  const v = new Array(DIM).fill(0);
  v[n % DIM] = 1;
  return v;
};

let clock = 1_000_000_000;
const advance = (ms) => (clock += ms);

beforeAll(async () => {
  dir = tempDir("mindsage-indexer");
  process.env.MS_DB_DIR = dir;
  process.env.MS_USER_DATA_DIR = dir;
  process.env.MS_SKIP_DB_BACKUP = "1";
  ({ default: localDB } = await import("../db/index.js"));
  idx = await import("../db/searchIndex.js");
  ({ createIndexer } = await import("./indexer.js"));
  db = localDB.db;
  localDB.initDatabase();
  alice = Number(
    db
      .prepare(
        `INSERT INTO users (username, email, password_hash) VALUES ('alice','a@example.com','x')`,
      )
      .run().lastInsertRowid,
  );
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const entry = (overrides = {}) =>
  localDB.createJournalEntry(alice, {
    title: "t",
    content: "some words",
    mood_score: 3,
    mood_tags: [],
    ...overrides,
  });

const make = (embed, events = []) =>
  createIndexer({
    embed,
    report: (event, data) => events.push([event, data]),
    wait: async () => {
      advance(5_000);
    },
    now: () => clock,
    batchSize: 5,
    pauseMs: 0,
  });

const stateOf = (id) => idx.getState("journal", id);

describe("the indexer", () => {
  it("fills an empty index in batches and reports progress", async () => {
    const ids = Array.from(
      { length: 12 },
      (_, i) => entry({ content: `entry number ${i}` }).id,
    );
    const calls = [];
    const events = [];
    const indexer = make(async (text) => {
      calls.push(text);
      return unit(calls.length);
    }, events);
    advance(10_000);
    await indexer.drain();
    for (const id of ids) expect(stateOf(id).state).toBe("ok");
    expect(calls.length).toBeGreaterThanOrEqual(12);
    const names = events.map((e) => e[0]);
    expect(names[0]).toBe("index:bulkStarted");
    expect(names.at(-1)).toBe("index:bulkCompleted");
    expect(events.at(-1)[1].failed).toBe(0);
    expect(events.at(-1)[1].total).toBeGreaterThanOrEqual(12);
  });

  it("embeds the latest text when an entry changes after it was queued", async () => {
    const e = entry({ content: "first draft" });
    const seen = [];
    const indexer = make(async (text) => {
      seen.push(text);
      return unit(1);
    });
    idx.markStale("journal", e.id, alice);
    db.prepare("UPDATE journal_entries SET content = ? WHERE id = ?").run(
      "final draft",
      e.id,
    );
    advance(10_000);
    await indexer.drain();
    expect(seen).toEqual(["t final draft"]);
    expect(stateOf(e.id).state).toBe("ok");
  });

  it("does not embed again when only tags or mood changed", async () => {
    const e = entry({ content: "steady" });
    let embeds = 0;
    const indexer = make(async () => {
      embeds += 1;
      return unit(2);
    });
    advance(10_000);
    indexer.noteChanged("journal", e.id);
    advance(10_000);
    await indexer.drain();
    expect(embeds).toBe(1);
    db.prepare("UPDATE journal_entries SET mood_score = 5 WHERE id = ?").run(
      e.id,
    );
    indexer.noteChanged("journal", e.id);
    advance(10_000);
    await indexer.drain();
    expect(embeds).toBe(1);
  });

  it("gives up on an item that always fails after five attempts, and leaves the rest alone", async () => {
    // Index everything else first so only the bad item is outstanding.
    const ok = make(async () => unit(3));
    advance(10_000);
    await ok.drain();

    const bad = entry({ content: "poison" });
    let tries = 0;
    const indexer = make(async () => {
      tries += 1;
      throw new Error("model said no");
    });
    indexer.noteChanged("journal", bad.id);
    for (let i = 0; i < 8; i++) {
      advance(13 * 3_600_000); // past the longest wait
      await indexer.drain();
    }
    expect(tries).toBe(idx.MAX_ATTEMPTS);
    expect(stateOf(bad.id)).toMatchObject({
      state: "failed",
      attempts: idx.MAX_ATTEMPTS,
      next_attempt_at: null,
    });
    // Editing the text wakes it again.
    db.prepare("UPDATE journal_entries SET content = 'fixed' WHERE id = ?").run(
      bad.id,
    );
    const fixed = make(async () => unit(4));
    fixed.noteChanged("journal", bad.id);
    advance(10_000);
    await fixed.drain();
    expect(stateOf(bad.id).state).toBe("ok");
  });

  it("retries a goal that gave up at the next launch (KAN-472)", async () => {
    const goal = Number(
      db
        .prepare(
          `INSERT INTO goals (user_id, title, target_value, unit)
           VALUES (?, 'run a marathon', 42, 'km')`,
        )
        .run(alice).lastInsertRowid,
    );
    for (let i = 0; i < idx.MAX_ATTEMPTS; i++) {
      idx.markFailure("goal", goal, alice, new Error("model said no"), clock);
    }
    expect(idx.getState("goal", goal)).toMatchObject({
      state: "failed",
      next_attempt_at: null,
    });

    const indexer = make(async () => unit(10));
    indexer.start();
    try {
      advance(10_000);
      await indexer.drain();
      expect(idx.getState("goal", goal)).toMatchObject({
        state: "ok",
        attempts: 0,
      });
    } finally {
      indexer.stop();
    }
  });

  it("does not spend attempts while the embedding model is unavailable", async () => {
    const e = entry({ content: "while ollama is down" });
    const down = make(async () => {
      throw new Error("fetch failed");
    });
    down.noteChanged("journal", e.id);
    advance(10_000);
    await down.drain();
    down.stop();
    expect(stateOf(e.id)).toMatchObject({ state: "pending", attempts: 0 });
    const up = make(async () => unit(5));
    advance(10_000);
    await up.drain();
    expect(stateOf(e.id).state).toBe("ok");
  });

  it("does not spend attempts while the built-in model is not downloaded", async () => {
    const e = entry({ content: "before the model download" });
    const missing = make(async () => {
      throw Object.assign(new Error("not downloaded"), {
        code: "AI_UNAVAILABLE",
      });
    });
    missing.noteChanged("journal", e.id);
    advance(10_000);
    await missing.drain();
    missing.stop();
    expect(stateOf(e.id)).toMatchObject({ state: "pending", attempts: 0 });
  });

  it("marks a blank entry done without embedding it, and drops its old vector (KAN-391)", async () => {
    const e = entry({ title: "", content: "had words" });
    const sent = [];
    const indexer = make(async (text) => {
      sent.push(text);
      // What Ollama answers for an empty prompt.
      return text.trim() ? unit(7) : [];
    });
    indexer.noteChanged("journal", e.id);
    advance(10_000);
    await indexer.drain();
    const rowid = BigInt(stateOf(e.id).id);
    const vectors = () =>
      db
        .prepare("SELECT COUNT(*) AS n FROM vec_entries WHERE rowid = ?")
        .get(rowid).n;
    expect(vectors()).toBe(1);

    db.prepare("UPDATE journal_entries SET content = ' \n ' WHERE id = ?").run(
      e.id,
    );
    indexer.noteChanged("journal", e.id);
    advance(10_000);
    await indexer.drain();
    expect(sent.filter((t) => !t.trim())).toEqual([]);
    expect(stateOf(e.id)).toMatchObject({ state: "ok", attempts: 0 });
    expect(vectors()).toBe(0);
    // Nothing left to retry: another change notice queues nothing.
    expect(idx.noteChanged("journal", e.id)).toBe(false);
  });

  it("embeds a shorter start of an entry too long for the model (KAN-391)", async () => {
    const e = entry({ content: "word ".repeat(10_000) });
    const sent = [];
    const indexer = make(async (text) => {
      if (text.length > 1_000) sent.push(text.length);
      if (text.length > 3_000) {
        throw new Error(
          "Ollama embedding API error: 500 Internal Server Error",
        );
      }
      return unit(8);
    });
    indexer.noteChanged("journal", e.id);
    advance(10_000);
    await indexer.drain();
    expect(sent).toEqual([8_000, 4_000, 2_000]);
    expect(stateOf(e.id)).toMatchObject({ state: "ok", attempts: 0 });
  });

  it("drops an item purged while its embedding was being made", async () => {
    const e = entry({ content: "purged midway" });
    const indexer = make(async () => {
      localDB.deleteJournalEntry(alice, e.id);
      return unit(6);
    });
    indexer.noteChanged("journal", e.id);
    advance(10_000);
    await indexer.drain();
    expect(stateOf(e.id)).toBeNull();
  });

  it("indexes an entry trashed mid-embedding and then restored, after the restore's sweep (KAN-372)", async () => {
    const e = entry({ content: "trashed midway, then restored" });
    const embed = async () => unit(9);
    const first = make(async () => {
      localDB.deleteJournalEntry(alice, e.id);
      return unit(9);
    });
    first.noteChanged("journal", e.id);
    advance(10_000);
    await first.drain();
    first.stop();
    expect(stateOf(e.id)).toBeNull(); // the "gone" path removed its row

    localDB.restoreItems(alice, { entryIds: [e.id], goalIds: [] });
    expect(stateOf(e.id)).toBeNull(); // restoring alone indexes nothing
    const indexer = make(embed);
    indexer.sweep(); // what trash:restore now calls
    await new Promise((resolve) => setTimeout(resolve, 20));
    await indexer.idle();
    indexer.stop();
    expect(stateOf(e.id).state).toBe("ok");
  });
});
