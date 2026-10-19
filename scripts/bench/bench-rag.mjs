/**
 * Breaks the chat RAG pipeline into its four stages and times each.
 *
 * `aiResponse` (electron/methods/chat.js:84) runs, in order:
 *
 *   1. a generation that plans the query and decides whether context is needed
 *   2. an embedding of the resulting base query
 *   3. a sqlite-vec similarity search
 *   4. a second generation that answers using the retrieved entries
 *
 * All four are serialized, and Ollama serves requests one at a time, so the
 * total is a sum rather than a maximum. COVERAGE.md 2.4 notes that nobody knows
 * which stage dominates - that is the whole point of measuring them separately,
 * because the fix for "retrieval is slow" and the fix for "generation is slow"
 * have nothing in common.
 *
 * Runs against a throwaway sqlite-vec table seeded with *real* embeddings of the
 * fixture entries. Random vectors would be fine for latency, but stage 4's cost
 * depends on how much retrieved text gets stuffed into the prompt, and that
 * only behaves realistically if the retrieved entries are real ones.
 *
 *   node scripts/bench/bench-rag.mjs --out results.json
 *
 * Requires Ollama running (run it under Electron-as-Node, as `npm run bench` does).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { summarise, fmt } from "./lib/stats.mjs";
import * as ollama from "./lib/ollama.mjs";
import { openVecStore } from "./lib/vecstore.mjs";
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

if (!(await ollama.isUp())) {
  console.error("Ollama is not reachable at http://localhost:11434.");
  process.exit(1);
}

const results = {};
let store = null;

try {
  // ------------------------------------------------------- open the store ---

  store = openVecStore();

  // ------------------------------------------------------- seed the store ---

  /**
   * Real embeddings of the fixture entries, rotated to fill the collection.
   * At roughly 100ms each this is the slowest part of setup, which is itself a
   * restatement of the backfill finding in FINDINGS.md 5.2.
   */
  console.log(
    `  embedding ${CORPUS_SIZE} entries into a throwaway sqlite-vec table...`,
  );
  const points = [];
  for (let i = 0; i < CORPUS_SIZE; i++) {
    const entry = JOURNAL_ENTRIES[i % JOURNAL_ENTRIES.length];
    const { vector } = await ollama.embed(entry.text, EMBED_MODEL);
    points.push({ id: i + 1, vector, content: entry.text });
  }
  store.insertMany(points);
  const contentById = new Map(points.map((p) => [p.id, p.content]));

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

      // 3. Vector search, same shape as semanticSearch (electron/db/searchIndex.js).
      const t3 = performance.now();
      const found = store.search(vector, 5);
      stage3.push(performance.now() - t3);

      const context = found.map((hit) => ({
        content: contentById.get(hit.id) ?? JOURNAL_MEDIUM,
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
  store?.close();
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
