/**
 * Benchmarks the search index (sqlite-vec): extension load, insert throughput,
 * and search latency as the table grows.
 *
 * Uses the same table the app creates (electron/db/vectorExtension.js: vec0,
 * 768 dimensions, cosine distance, user_id partition key) in a throwaway
 * database file. It never touches the real journal.
 *
 * Tables are filled with random 768-dimension vectors rather than real
 * embeddings: search cost depends on the number and dimension of vectors, not
 * on what they mean, and generating 50,000 real embeddings would take roughly
 * an hour and a half (see bench-ai.mjs). The query vector is likewise random,
 * so this measures latency only. **It says nothing about whether the results
 * are any good**; that is bench-quality.mjs.
 *
 * Runs under Electron-as-Node, where better-sqlite3 is built (`npm run bench`
 * does this for you).
 *
 *   node scripts/bench/bench-vector.mjs --out results.json
 *   node scripts/bench/bench-vector.mjs --sizes 150,5000
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { bench, fmt, fmtBytes } from "./lib/stats.mjs";
import { openVecStore } from "./lib/vecstore.mjs";
import { EMBEDDING_DIM } from "../../electron/db/vectorExtension.js";

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const OUT = flag("--out", null);
const SIZES = flag("--sizes", "150,5000,50000")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter(Boolean);
const RUNS = Number(flag("--runs", "30"));
const DIM = EMBEDDING_DIM;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mindsage-bench-vec-"));
const results = {};

/** Deterministic pseudo-random vector, so runs are comparable. */
let seed = 12345;
const nextFloat = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff - 0.5;
};
const randomVector = () => Array.from({ length: DIM }, nextFloat);

const dirBytes = () =>
  fs
    .readdirSync(dir)
    .reduce((sum, f) => sum + fs.statSync(path.join(dir, f)).size, 0);

let store = null;
try {
  // -------------------------------------------------------------- open ---

  const t0 = performance.now();
  store = openVecStore(path.join(dir, "bench.db"));
  results["vector.extensionLoad"] = {
    n: 1,
    wallMs: Math.round((performance.now() - t0) * 10) / 10,
    version: store.version,
  };
  console.log(
    `  ${"vector.extensionLoad".padEnd(32)} ${fmt(performance.now() - t0)} (sqlite-vec ${store.version})`,
  );

  // --------------------------------------------------- per-size sweeps ---

  let inserted = 0;
  for (const size of SIZES) {
    // Grown cumulatively rather than rebuilt, which matches how a user's index
    // actually develops.
    const toAdd = size - inserted;
    const batch = 500;
    const insertStart = performance.now();
    for (let start = 0; start < toAdd; start += batch) {
      const count = Math.min(batch, toAdd - start);
      store.insertMany(
        Array.from({ length: count }, (_, k) => ({
          id: inserted + start + k + 1,
          vector: randomVector(),
        })),
      );
    }
    const insertSec = (performance.now() - insertStart) / 1000;
    inserted = size;

    results[`upsert.to${size}`] = {
      added: toAdd,
      seconds: Math.round(insertSec * 10) / 10,
      vectorsPerSec: toAdd > 0 ? Math.round(toAdd / insertSec) : null,
    };

    // Search, with the shape semanticSearch uses: k nearest of one user.
    const query = randomVector();
    const searchStats = bench(() => store.search(query, 15), {
      runs: RUNS,
      warmup: 3,
    });

    results[`search.at${size}`] = searchStats;
    results[`vector.rssAt${size}`] = { bytes: process.memoryUsage().rss };

    console.log(
      `  ${`search.at${size}`.padEnd(32)} p50 ${fmt(searchStats.p50).padStart(9)}  ` +
        `p95 ${fmt(searchStats.p95).padStart(9)}  ` +
        `rss ${fmtBytes(results[`vector.rssAt${size}`].bytes)}`,
    );
  }

  store.db.pragma("wal_checkpoint(TRUNCATE)");
  const bytes = dirBytes();
  results["vector.storageOnDisk"] = { bytes, vectors: inserted };
  console.log(
    `  ${"vector.storageOnDisk".padEnd(32)} ${fmtBytes(bytes)} for ${inserted} vectors`,
  );
} finally {
  store?.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

const report = { dimensions: DIM, sizes: SIZES, results };

if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
}
