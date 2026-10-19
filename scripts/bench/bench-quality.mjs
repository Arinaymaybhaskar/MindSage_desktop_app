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

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as ollama from "./lib/ollama.mjs";
import { openVecStore } from "./lib/vecstore.mjs";
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

if (!(await ollama.isUp())) {
  console.error("Ollama is not reachable at http://localhost:11434.");
  process.exit(1);
}

const results = {};
let store = null;

try {
  store = openVecStore();

  // -------------------------------------------------------------- index ---

  console.log(`  embedding ${ENTRIES.length} labelled entries...`);
  const points = [];
  for (const entry of ENTRIES) {
    const { vector } = await ollama.embed(docPrefix + entry.text, EMBED_MODEL);
    points.push({ id: entry.id, vector });
  }
  store.insertMany(points);

  // --------------------------------------------------------- evaluate ---

  console.log(`  scoring ${QUERIES.length} labelled queries (k=${K})`);

  const perQuery = [];
  let recallSum = 0;
  let reciprocalSum = 0;
  let topHitRelevant = 0;

  for (const { query, relevant } of QUERIES) {
    const { vector } = await ollama.embed(queryPrefix + query, EMBED_MODEL);
    const returned = store.search(vector, K).map((hit) => hit.id);
    const hits = returned.filter((id) => relevant.includes(id));
    const recall = relevant.length ? hits.length / relevant.length : 0;

    // Reciprocal rank of the first relevant result; 0 if none appear.
    const firstIndex = returned.findIndex((id) => relevant.includes(id));
    const reciprocal = firstIndex === -1 ? 0 : 1 / (firstIndex + 1);

    recallSum += recall;
    reciprocalSum += reciprocal;
    if (returned[0] !== undefined && relevant.includes(returned[0]))
      topHitRelevant++;

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
    console.log(
      `    --- ${misses.length} queries with an irrelevant top hit ---`,
    );
    for (const m of misses) {
      console.log(
        `    "${m.query}" -> got ${m.returned[0]}, wanted one of ${m.relevant.join(", ")}`,
      );
    }
  }
} catch (err) {
  console.error(`  bench-quality failed: ${err.message}`);
  results.error = String(err.message ?? err);
} finally {
  store?.close();
}

if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
}

if (results.error) process.exit(1);
