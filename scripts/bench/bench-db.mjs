/**
 * SQLite benchmark for one dataset size.
 *
 * Run via `npm run bench`, which launches this once per volume. One process per
 * volume is not an accident: electron/db/connection.js creates its `Database`
 * at module scope from a path fixed at import time, and every db module imports
 * that one instance. A single process therefore gets exactly one database, so
 * comparing 150 against 50,000 entries means comparing across processes.
 *
 * The launcher points APPDATA at a throwaway directory before spawning, so this
 * never touches the real journal at %APPDATA%/MindSage/mind-sage.db.
 *
 * Usage (normally via the launcher):
 *   ELECTRON_RUN_AS_NODE=1 electron scripts/bench/bench-db.mjs --entries 5000 --out results.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { performance } from "node:perf_hooks";

import { bench, benchAsync, summarise } from "./lib/stats.mjs";
import { captureQueries, explainAll, countScans } from "./lib/capture.mjs";
import { buildDataset } from "./lib/volume.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const ENTRIES = Number(flag("--entries", "5000"));
const RUNS = Number(flag("--runs", "50"));
const OUT = flag("--out", null);

if (!process.env.APPDATA) {
  console.error(
    "Refusing to run: APPDATA is unset, so connection.js would open the real database.\n" +
      "Run this through `npm run bench`.",
  );
  process.exit(1);
}

// ------------------------------------------------------------------ setup ---

const { db, initDatabase } = await import("../../electron/db/connection.js");
const journal = await import("../../electron/db/journal.js");
const exportData = await import("../../electron/db/exportData.js");
const dashboard = await import("../../electron/db/dashboard.js");

initDatabase();

const seedStart = performance.now();
const { userId, sampleEntryId } = buildDataset(db, ENTRIES);
const seedMs = performance.now() - seedStart;

/**
 * The pragmas in force while these numbers were taken.
 *
 * Recorded rather than assumed, because the whole point of the baseline is to
 * be comparable against a later run - and "we enabled WAL" is only a valid
 * explanation of a speedup if the before run really was in `delete` mode.
 */
const pragmas = {
  journal_mode: db.pragma("journal_mode", { simple: true }),
  synchronous: db.pragma("synchronous", { simple: true }),
  busy_timeout: db.pragma("busy_timeout", { simple: true }),
  cache_size: db.pragma("cache_size", { simple: true }),
};

// -------------------------------------------------------------- scenarios ---

const today = new Date();
const monthAgo = new Date(today.getTime() - 30 * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);

// Deep pagination has to stay inside the dataset, or the small volumes measure
// an empty result and look artificially fast.
const deepOffset = Math.min(1000, Math.max(0, Math.floor(ENTRIES / 2)));

/** Read-only scenarios: safe to repeat, and query plans get captured for each. */
const reads = {
  "list.page1": () => journal.getAllEntries(userId, 20, 0),
  "list.deepPage": () => journal.getAllEntries(userId, 20, deepOffset),
  "list.dateFiltered": () =>
    journal.getAllEntries(userId, 20, 0, iso(monthAgo), iso(today)),
  "entry.byId": () => journal.getJournalById(userId, sampleEntryId),
  "dashboard.recent": () => journal.getRecentEntries(userId),
  "dashboard.stats": () => dashboard.getUserStats(userId),
  "dashboard.data": () => dashboard.getDashboardData(userId),
  "dashboard.monthlyScores": () => dashboard.getMonthlyScores(userId),
  "dashboard.allTimeScores": () => dashboard.getAllTimeScores(userId),
  "gallery.top": () => journal.getImageKeysAndIds(userId, "top"),
  "gallery.random": () => journal.getImageKeysAndIds(userId, "random"),
  "gallery.all": () => journal.getImageKeysAndIds(userId, "all"),
};

const results = {};
const plans = {};

for (const [name, fn] of Object.entries(reads)) {
  try {
    results[name] = bench(fn, { runs: RUNS });
    plans[name] = explainAll(db, captureQueries(db, fn));
  } catch (err) {
    results[name] = { error: String(err.message ?? err) };
  }
}

// The write path runs last: it grows the table, which would skew any read
// benchmark scheduled after it.
try {
  let n = 0;
  results["write.create"] = bench(
    () =>
      journal.createJournalEntry(userId, {
        title: `Bench write ${n++}`,
        content:
          "A synthetic entry written to measure the insert path. ".repeat(8),
        mood_score: 3,
        mood_tags: ["calm", "focused"],
      }),
    { runs: Math.min(RUNS, 30), warmup: 2 },
  );
} catch (err) {
  results["write.create"] = { error: String(err.message ?? err) };
}

// ----------------------------------------------------------------- export ---

/**
 * Whole-journal export.
 *
 * `exportEverything` queries every table for the user, copies referenced media
 * into a staging tree and zips it (electron/db/exportData.js:18). It runs on
 * the main process behind `user:export-data`, so its cost is a freeze, not a
 * background job - and it is the one operation whose cost scales with the
 * user's entire history rather than a page of it.
 *
 * Media files are not created by the volume seeder, so what is measured here is
 * the query-and-serialise half. A real export also copies photos, which will
 * add materially at large journal sizes.
 */
try {
  const exportDir = path.join(path.dirname(db.name), "bench-exports");
  fs.mkdirSync(exportDir, { recursive: true });
  let n = 0;

  results["export.everything"] = await benchAsync(
    () =>
      exportData.exportEverything(
        userId,
        path.join(exportDir, `export-${n++}.zip`),
      ),
    { runs: 3, warmup: 1, budgetMs: 120000 },
  );

  const written = fs
    .readdirSync(exportDir)
    .map((f) => fs.statSync(path.join(exportDir, f)).size)
    .filter((size) => size > 0);
  if (written.length) {
    results["export.everything"].archiveBytes = Math.max(...written);
  }
  fs.rmSync(exportDir, { recursive: true, force: true });
} catch (err) {
  results["export.everything"] = { error: String(err.message ?? err) };
}

// ------------------------------------------------------------- contention ---

/**
 * Measures what the background worker does to foreground reads.
 *
 * This is the scenario PERFORMANCE.md §1.1 describes and the one a user
 * actually feels: electron/qdrantWorker.js opens the same database file from a
 * second thread and writes embedding/sync status while the UI is reading. In
 * the default `delete` journal mode a writer takes an exclusive lock, so reads
 * queue behind it and simultaneous access can throw SQLITE_BUSY outright. A
 * single-threaded benchmark would never surface any of that.
 *
 * `busyErrors` matters as much as the timings here - it is a correctness
 * symptom, not just a slow one.
 *
 * The loop runs to a minimum sample count rather than to a fixed wall-clock
 * budget. A time-boxed loop collects hundreds of samples at 150 entries and
 * about ten at 50,000, where p95 then degenerates into "the slowest of ten" and
 * reads as noise across the volume columns. `maxMs` still bounds the worst case.
 */
async function benchContention({ minSamples = 30, maxMs = 20000 } = {}) {
  const worker = new Worker(path.join(here, "lib", "writer-worker.mjs"), {
    workerData: { userId },
    env: process.env,
  });

  await new Promise((resolve) =>
    worker.once("message", (m) => m === "ready" && resolve()),
  );

  const samples = [];
  let busyErrors = 0;
  const softDeadline = performance.now() + 4000;
  const hardDeadline = performance.now() + maxMs;

  while (
    performance.now() < hardDeadline &&
    (performance.now() < softDeadline || samples.length < minSamples)
  ) {
    const t0 = performance.now();
    try {
      journal.getAllEntries(userId, 20, 0);
      samples.push(performance.now() - t0);
    } catch (err) {
      if (/SQLITE_BUSY|database is locked/i.test(String(err.message ?? err))) {
        busyErrors++;
      } else {
        throw err;
      }
    }
    // Yield, so the reader doesn't monopolise the event loop and starve the
    // writer thread of a chance to actually contend.
    await new Promise((r) => setImmediate(r));
  }

  const writes = await new Promise((resolve) => {
    worker.once("message", (m) => resolve(typeof m === "object" ? m : {}));
    worker.postMessage("stop");
  });
  await worker.terminate();

  return {
    ...summarise(samples),
    busyErrors,
    writesCompleted: writes.completed ?? null,
  };
}

try {
  results["contention.listWhileWorkerWrites"] = await benchContention();
} catch (err) {
  results["contention.listWhileWorkerWrites"] = {
    error: String(err.message ?? err),
  };
}

// ------------------------------------------------------------------ output --

const dbFile = db.name;
const sizeBytes = fs.existsSync(dbFile) ? fs.statSync(dbFile).size : 0;

const report = {
  entries: ENTRIES,
  runs: RUNS,
  seedMs: Math.round(seedMs),
  dbSizeBytes: sizeBytes,
  pragmas,
  totalScans: countScans(Object.values(plans).flat()),
  results,
  plans,
};

if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
}

console.log(
  `  ${String(ENTRIES).padStart(6)} entries  ` +
    `seed ${Math.round(seedMs)}ms  ` +
    `db ${(sizeBytes / 1024 / 1024).toFixed(1)}MB  ` +
    `scans ${report.totalScans}`,
);

db.close();
