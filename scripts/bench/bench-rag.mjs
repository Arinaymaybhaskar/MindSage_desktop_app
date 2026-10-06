/**
 * Breaks the chat RAG pipeline into its four stages and times each.
 *
 * `aiResponse` (electron/methods/chat.js:84) runs, in order:
 *
 *   1. a generation that plans the query and decides whether context is needed
 *   2. an embedding of the resulting base query
 *   3. a Qdrant similarity search
 *   4. a second generation that answers using the retrieved entries
 *
 * All four are serialized, and Ollama serves requests one at a time, so the
 * total is a sum rather than a maximum. COVERAGE.md 2.4 notes that nobody knows
 * which stage dominates - that is the whole point of measuring them separately,
 * because the fix for "retrieval is slow" and the fix for "generation is slow"
 * have nothing in common.
 *
 * Runs against a throwaway Qdrant instance seeded with *real* embeddings of the
 * fixture entries. Random vectors would be fine for latency, but stage 4's cost
 * depends on how much retrieved text gets stuffed into the prompt, and that
 * only behaves realistically if the retrieved entries are real ones.
 *
 *   node scripts/bench/bench-rag.mjs --out results.json
 *
 * Requires Ollama running and the bundled Qdrant binary.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { summarise, fmt } from "./lib/stats.mjs";
import * as ollama from "./lib/ollama.mjs";
import {
  generateContextTimeAndBaseQueryPrompt,
  respondWithContext,
} from "../../electron/methods/AIPrompts.js";
import {
  JOURNAL_ENTRIES,
  CHAT_QUERIES,
  JOURNAL_MEDIUM,
} from "./fixtures/corpus.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const OUT = flag("--out", null);
const RUNS = Number(flag("--runs", "3"));
const CORPUS_SIZE = Number(flag("--corpus", "60"));
const CHAT_MODEL = flag("--chat-model", "llama3.2:latest");
const EMBED_MODEL = flag("--embed-model", "nomic-embed-text:v1.5");
const HTTP_PORT = Number(flag("--port", "6534"));

const BASE = `http://127.0.0.1:${HTTP_PORT}`;
const COLLECTION = "bench_rag";
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

const storageDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "mindsage-bench-rag-"),
);
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
  // -------------------------------------------------------- start Qdrant ---

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
      if (
        (await fetch(`${BASE}/readyz`, { signal: AbortSignal.timeout(1000) }))
          .ok
      ) {
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
    body: JSON.stringify({
      vectors: { [VECTOR_NAME]: { size: 768, distance: "Cosine" } },
    }),
  });

  // ------------------------------------------------------- seed the store ---

  /**
   * Real embeddings of the fixture entries, rotated to fill the collection.
   * At roughly 100ms each this is the slowest part of setup, which is itself a
   * restatement of the backfill finding in FINDINGS.md 5.2.
   */
  console.log(
    `  embedding ${CORPUS_SIZE} entries into a throwaway collection...`,
  );
  const points = [];
  for (let i = 0; i < CORPUS_SIZE; i++) {
    const entry = JOURNAL_ENTRIES[i % JOURNAL_ENTRIES.length];
    const { vector } = await ollama.embed(entry.text, EMBED_MODEL);
    points.push({
      id: i + 1,
      vector: { [VECTOR_NAME]: vector },
      payload: { user_id: 1, entry_id: i + 1, content: entry.text },
    });
  }
  await send(
    `${BASE}/collections/${COLLECTION}/points?wait=true`,
    { points },
    "PUT",
  );

  // ------------------------------------------------------- the four stages ---

  console.log("  RAG pipeline stages");

  const stage1 = [];
  const stage2 = [];
  const stage3 = [];
  const stage4 = [];
  const totals = [];
  let planParsed = 0;
  let planAttempts = 0;

  for (let run = 0; run < RUNS; run++) {
    for (const query of CHAT_QUERIES.slice(0, 3)) {
      const runStart = performance.now();

      // 1. Query planning (JSON mode, the call parseAIWithRetries wraps).
      const t1 = performance.now();
      const planned = await ollama.generate({
        model: CHAT_MODEL,
        prompt: generateContextTimeAndBaseQueryPrompt(
          query,
          new Date().toISOString(),
        ),
        jsonMode: true,
        numPredict: 300,
      });
      stage1.push(performance.now() - t1);
      planAttempts++;

      // The app parses this with a schema and retries up to three times; a
      // parse failure therefore costs a whole extra generation.
      let plan = null;
      try {
        plan = JSON.parse(planned.text);
        planParsed++;
      } catch {
        /* counted as a failure below */
      }
      const baseQuery = plan?.base_query || query;

      // 2. Embedding.
      const t2 = performance.now();
      const { vector } = await ollama.embed(baseQuery, EMBED_MODEL);
      stage2.push(performance.now() - t2);

      // 3. Vector search, same shape as SemanticSearch (qdrant.js:33).
      const t3 = performance.now();
      const found = await send(
        `${BASE}/collections/${COLLECTION}/points/search`,
        {
          vector: { name: VECTOR_NAME, vector },
          limit: 5,
          with_payload: true,
        },
      );
      stage3.push(performance.now() - t3);

      const context = (found.result ?? []).map((hit) => ({
        content: hit.payload?.content ?? JOURNAL_MEDIUM,
        created_at: new Date().toISOString(),
      }));

      // 4. The answering generation, with retrieved entries in the prompt.
      const t4 = performance.now();
      await ollama.generate({
        model: CHAT_MODEL,
        // respondWithContext calls formatContext itself, so the raw array goes in.
        // Passing a pre-formatted string makes it call .map on a string.
        prompt: respondWithContext(query, context),
        jsonMode: true,
        numPredict: 300,
      });
      stage4.push(performance.now() - t4);

      totals.push(performance.now() - runStart);
    }
  }

  const record = (name, samples, extra = {}) => {
    results[name] = { ...summarise(samples), ...extra };
    console.log(
      `    ${name.padEnd(28)} p50 ${fmt(results[name].p50).padStart(9)}  p95 ${fmt(results[name].p95).padStart(9)}`,
    );
  };

  record("rag.1.queryPlanning", stage1, {
    planParseRate: `${planParsed}/${planAttempts}`,
  });
  record("rag.2.embedding", stage2);
  record("rag.3.vectorSearch", stage3);
  record("rag.4.answerGeneration", stage4);
  record("rag.total", totals);

  // Share of total per stage - the number that says where to spend effort.
  const totalP50 = results["rag.total"].p50 || 1;
  results["rag.shareOfTotal"] = Object.fromEntries(
    [
      "rag.1.queryPlanning",
      "rag.2.embedding",
      "rag.3.vectorSearch",
      "rag.4.answerGeneration",
    ].map((k) => [
      k,
      `${Math.round((results[k].p50 / totalP50) * 1000) / 10}%`,
    ]),
  );
  console.log("    --- share of total ---");
  for (const [k, v] of Object.entries(results["rag.shareOfTotal"])) {
    console.log(`    ${k.padEnd(28)} ${v}`);
  }
} catch (err) {
  console.error(`  bench-rag failed: ${err.message}`);
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

const report = {
  chatModel: CHAT_MODEL,
  embedModel: EMBED_MODEL,
  corpusSize: CORPUS_SIZE,
  runs: RUNS,
  results,
};

if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
}

if (results.error) process.exit(1);
