/**
 * Measures whether semantic search returns the *right* entries.
 *
 * The only benchmark in this suite that is not about speed. It exists because
 * retrieval quality is the one thing that can silently collapse while every
 * latency number improves: change the embedding model, the similarity
 * threshold, or how entries are chunked, and search stays fast while quietly
 * returning the wrong journal entries.
 *
 * It is also how embedding models get compared. Retrieval quality is almost
 * entirely a property of the embedding model, and swapping one moves these
 * scores immediately where nothing else in the suite would notice. Pass
 * `--embed-model` to score an alternative against the same corpus.
 *
 * Metrics, over the labelled corpus in fixtures/retrieval.mjs:
 *
 *   recall@k  - share of relevant entries that appear in the top k
 *   MRR       - mean reciprocal rank of the first relevant hit (1.0 = always first)
 *   precision@1 - share of queries whose top hit is relevant
 *
 * Scores are corpus-relative. An absolute number here means little; a *drop*
 * between two runs on the same corpus means something broke.
 *
 *   node scripts/bench/bench-quality.mjs --out results.json
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as ollama from "./lib/ollama.mjs";
import { ENTRIES, QUERIES } from "./fixtures/retrieval.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const OUT = flag("--out", null);
const EMBED_MODEL = flag("--embed-model", "nomic-embed-text:v1.5");
const HTTP_PORT = Number(flag("--port", "6535"));
const K = Number(flag("--k", "5"));

/**
 * nomic-embed-text is trained with task prefixes - `search_document: ` on
 * indexed text and `search_query: ` on queries - and the model card states
 * retrieval degrades without them. The app applies neither
 * (electron/methods/ollama.js:542), so this flag exists to measure what that
 * costs rather than to assume it costs nothing.
 */
const USE_PREFIX = argv.includes("--prefix");
const docPrefix = USE_PREFIX ? "search_document: " : "";
const queryPrefix = USE_PREFIX ? "search_query: " : "";

const BASE = `http://127.0.0.1:${HTTP_PORT}`;
const COLLECTION = "bench_quality";
const VECTOR_NAME = "text_embedding";

if (!(await ollama.isUp())) {
  console.error("Ollama is not reachable at http://localhost:11434.");
  process.exit(1);
}

const binary =
  process.platform === "win32"
    ? path.join(repoRoot, "resources", "win", "qdrant.exe")
    : path.join(repoRoot, "resources", "mac", "qdrant");
if (!fs.existsSync(binary)) {
  console.error(`Qdrant binary not found at ${binary}`);
  process.exit(1);
}

const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "mindsage-bench-quality-"));
const results = {};
let proc = null;

const send = async (url, body, method = "POST") => {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`);
  return res.json();
};

try {
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

  const deadline = Date.now() + 30000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${BASE}/readyz`, { signal: AbortSignal.timeout(1000) })).ok) {
        ready = true;
        break;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!ready) throw new Error("Qdrant did not become ready");

  await fetch(`${BASE}/collections/${COLLECTION}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vectors: { [VECTOR_NAME]: { size: 768, distance: "Cosine" } } }),
  });

  // -------------------------------------------------------------- index ---

  console.log(`  embedding ${ENTRIES.length} labelled entries...`);
  const points = [];
  for (const entry of ENTRIES) {
    const { vector } = await ollama.embed(docPrefix + entry.text, EMBED_MODEL);
    points.push({
      id: entry.id,
      vector: { [VECTOR_NAME]: vector },
      payload: { entry_id: entry.id, topic: entry.topic },
    });
  }
  await send(`${BASE}/collections/${COLLECTION}/points?wait=true`, { points }, "PUT");

  // --------------------------------------------------------- evaluate ---

  console.log(`  scoring ${QUERIES.length} labelled queries (k=${K})`);

  const perQuery = [];
  let recallSum = 0;
  let reciprocalSum = 0;
  let topHitRelevant = 0;

  for (const { query, relevant } of QUERIES) {
    const { vector } = await ollama.embed(queryPrefix + query, EMBED_MODEL);
    const found = await send(`${BASE}/collections/${COLLECTION}/points/search`, {
      vector: { name: VECTOR_NAME, vector },
      limit: K,
      with_payload: true,
    });

    const returned = (found.result ?? []).map((hit) => hit.id);
    const hits = returned.filter((id) => relevant.includes(id));
    const recall = relevant.length ? hits.length / relevant.length : 0;

    // Reciprocal rank of the first relevant result; 0 if none appear.
    const firstIndex = returned.findIndex((id) => relevant.includes(id));
    const reciprocal = firstIndex === -1 ? 0 : 1 / (firstIndex + 1);

    recallSum += recall;
    reciprocalSum += reciprocal;
    if (returned[0] !== undefined && relevant.includes(returned[0])) topHitRelevant++;

    perQuery.push({
      query,
      relevant,
      returned,
      recall: Math.round(recall * 100) / 100,
      reciprocalRank: Math.round(reciprocal * 100) / 100,
      topHitRelevant: relevant.includes(returned[0]),
    });
  }

  const n = QUERIES.length;
  results.summary = {
    embedModel: EMBED_MODEL,
    taskPrefixes: USE_PREFIX,
    k: K,
    corpusEntries: ENTRIES.length,
    queries: n,
    [`recall@${K}`]: Math.round((recallSum / n) * 1000) / 1000,
    mrr: Math.round((reciprocalSum / n) * 1000) / 1000,
    "precision@1": Math.round((topHitRelevant / n) * 1000) / 1000,
  };
  results.perQuery = perQuery;

  console.log(`    recall@${K}     ${results.summary[`recall@${K}`]}`);
  console.log(`    MRR           ${results.summary.mrr}`);
  console.log(`    precision@1   ${results.summary["precision@1"]}`);

  // Naming the misses is what makes the score actionable: a bare 0.7 says
  // nothing, "these four queries returned the wrong entry" says where to look.
  const misses = perQuery.filter((q) => !q.topHitRelevant);
  if (misses.length) {
    console.log(`    --- ${misses.length} queries with an irrelevant top hit ---`);
    for (const m of misses) {
      console.log(`    "${m.query}" -> got ${m.returned[0]}, wanted one of ${m.relevant.join(", ")}`);
    }
  }
} catch (err) {
  console.error(`  bench-quality failed: ${err.message}`);
  results.error = String(err.message ?? err);
} finally {
  if (proc) {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  }
  await new Promise((r) => setTimeout(r, 1000));
  fs.rmSync(storageDir, { recursive: true, force: true });
}

if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
}

if (results.error) process.exit(1);
