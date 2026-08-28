/**
 * Benchmarks Qdrant: process startup, upsert throughput, and search latency as
 * the collection grows.
 *
 * Spawns the bundled binary directly with the same environment variables
 * electron/services/qdrantManager.js uses, into a throwaway storage directory,
 * on a port chosen to avoid a running app. It never touches the real vector
 * store.
 *
 * Collections are filled with random 768-dimension vectors rather than real
 * embeddings. Search cost in an HNSW index depends on the number and dimension
 * of vectors, not on what they mean - and generating 50,000 real embeddings
 * would take roughly an hour and a half (see bench-ai.mjs). The query vector is
 * likewise random, so this measures latency only. **It says nothing about
 * whether the results are any good**; recall against a labelled query set is a
 * separate exercise noted in COVERAGE.md 3.4.
 *
 *   node scripts/bench/bench-vector.mjs --out results.json
 *   node scripts/bench/bench-vector.mjs --sizes 150,5000
 */

import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { benchAsync, fmt, fmtBytes } from "./lib/stats.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

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

/** Matches qdrantManager.js:118 - 768 dimensions, cosine, named vector. */
const DIM = 768;
const VECTOR_NAME = "text_embedding";
const COLLECTION = "bench_entries";

// A port well away from the app's default 6333, so a running MindSage does not
// get benchmarked by accident or have its store written to.
const HTTP_PORT = Number(flag("--port", "6533"));
const BASE = `http://127.0.0.1:${HTTP_PORT}`;

const binary =
  process.platform === "win32"
    ? path.join(repoRoot, "resources", "win", "qdrant.exe")
    : path.join(repoRoot, "resources", "mac", "qdrant");

if (!fs.existsSync(binary)) {
  console.error(`Qdrant binary not found at ${binary}`);
  process.exit(1);
}

const storageDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "mindsage-bench-qdrant-"),
);
const results = {};
let proc = null;

/** Resident set size of a pid, in bytes. Best-effort and platform-specific. */
function rssOf(pid) {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "tasklist",
        ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
        { encoding: "utf8" },
      );
      // The last CSV field is memory as `"123,456 K"` - splitting on commas
      // would cut the number in half, so match the final quoted field instead.
      const field = out.trim().match(/"([^"]*)"\s*$/)?.[1] ?? "";
      const kb = field.replace(/[^\d]/g, "");
      return kb ? Number(kb) * 1024 : null;
    }
    const out = execFileSync("ps", ["-o", "rss=", "-p", String(pid)], {
      encoding: "utf8",
    });
    return Number(out.trim()) * 1024;
  } catch {
    return null;
  }
}

const send = async (url, body, method = "POST") => {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`);
  return res.json();
};

const post = (url, body) => send(url, body, "POST");
// Upserting points is PUT. POST on the same path is the *delete* endpoint and
// fails asking for an `ids` field, which is a confusing way to learn this.
const put = (url, body) => send(url, body, "PUT");

/** Deterministic pseudo-random vector, so runs are comparable. */
let seed = 12345;
const nextFloat = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff - 0.5;
};
const randomVector = () => Array.from({ length: DIM }, nextFloat);

try {
  // ------------------------------------------------------------ startup ---

  const t0 = performance.now();
  proc = spawn(binary, [], {
    env: {
      ...process.env,
      QDRANT__STORAGE__STORAGE_PATH: storageDir,
      QDRANT__SERVICE__HTTP_PORT: String(HTTP_PORT),
      QDRANT__SERVICE__GRPC_PORT: String(HTTP_PORT + 1),
      QDRANT__SERVICE__HOST: "127.0.0.1",
    },
    cwd: path.dirname(binary),
    stdio: ["ignore", "ignore", "ignore"],
  });

  // Poll readiness rather than waiting on a log line: this is the number that
  // lands on the app's cold-start critical path (main.js:112).
  let ready = false;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/readyz`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!ready) throw new Error("Qdrant did not become ready within 30s");

  results["qdrant.startupToReady"] = {
    n: 1,
    wallMs: Math.round(performance.now() - t0),
  };
  console.log(
    `  ${"qdrant.startupToReady".padEnd(32)} ${fmt(performance.now() - t0)}`,
  );
  results["qdrant.rssIdle"] = { bytes: rssOf(proc.pid) };

  // --------------------------------------------------- per-size sweeps ---

  let inserted = 0;
  for (const size of SIZES) {
    // Collections are grown cumulatively rather than rebuilt, which matches how
    // a user's store actually develops and avoids re-uploading from zero.
    if (inserted === 0) {
      await fetch(`${BASE}/collections/${COLLECTION}`, { method: "DELETE" });
      await fetch(`${BASE}/collections/${COLLECTION}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vectors: { [VECTOR_NAME]: { size: DIM, distance: "Cosine" } },
        }),
      });
    }

    const toAdd = size - inserted;
    const batchSize = 500;
    const upsertStart = performance.now();
    for (let start = 0; start < toAdd; start += batchSize) {
      const count = Math.min(batchSize, toAdd - start);
      const points = Array.from({ length: count }, (_, k) => ({
        id: inserted + start + k + 1,
        vector: { [VECTOR_NAME]: randomVector() },
        payload: { user_id: 1, entry_id: inserted + start + k + 1 },
      }));
      await put(`${BASE}/collections/${COLLECTION}/points?wait=true`, {
        points,
      });
    }
    const upsertSec = (performance.now() - upsertStart) / 1000;
    inserted = size;

    results[`upsert.to${size}`] = {
      added: toAdd,
      seconds: Math.round(upsertSec * 10) / 10,
      vectorsPerSec: toAdd > 0 ? Math.round(toAdd / upsertSec) : null,
    };

    // Search, with the same shape SemanticSearch uses (qdrant.js:33).
    const query = randomVector();
    const searchStats = await benchAsync(
      () =>
        post(`${BASE}/collections/${COLLECTION}/points/search`, {
          vector: { name: VECTOR_NAME, vector: query },
          limit: 5,
          with_payload: true,
        }),
      { runs: RUNS, warmup: 3 },
    );

    results[`search.at${size}`] = searchStats;
    results[`qdrant.rssAt${size}`] = { bytes: rssOf(proc.pid) };

    console.log(
      `  ${`search.at${size}`.padEnd(32)} p50 ${fmt(searchStats.p50).padStart(9)}  ` +
        `p95 ${fmt(searchStats.p95).padStart(9)}  ` +
        `rss ${fmtBytes(results[`qdrant.rssAt${size}`].bytes ?? 0)}`,
    );
  }

  // Storage on disk, for the "runs entirely on your laptop" claim.
  //
  // Qdrant preallocates mmap segment files, so this substantially overstates
  // the bytes actually occupied by vector data at small collection sizes.
  // Useful as a disk-footprint figure, misleading as a per-vector cost.
  let storageBytes = 0;
  const stack = [storageDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) storageBytes += fs.statSync(full).size;
    }
  }
  results["qdrant.storageOnDisk"] = { bytes: storageBytes, vectors: inserted };
  console.log(
    `  ${"qdrant.storageOnDisk".padEnd(32)} ${fmtBytes(storageBytes)} for ${inserted} vectors`,
  );
} finally {
  if (proc) {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  }
  // Qdrant needs a moment to release its file handles before the tree can go.
  await new Promise((r) => setTimeout(r, 1000));
  fs.rmSync(storageDir, { recursive: true, force: true });
}

const report = { dimensions: DIM, sizes: SIZES, results };

if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
}
