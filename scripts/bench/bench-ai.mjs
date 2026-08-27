/**
 * Benchmarks the local AI pipeline: embeddings, journal enrichment, chat
 * generation and editor ghost text.
 *
 * This is the half of MindSage that operates in seconds rather than
 * milliseconds, and it is where nearly all user-perceived waiting happens. The
 * SQLite suite measures a 339ms query; a user waiting eleven seconds for a chat
 * reply is not waiting on SQLite.
 *
 * Requires Ollama running with the models the app uses. Prompts come from the
 * real electron/methods/AIPrompts.js, and responses are validated with the real
 * parseJournalMetadata / sanitizeSummary, so the "did the model return
 * something usable" rate is the app's actual rate, not an approximation.
 *
 *   node scripts/bench/bench-ai.mjs --out results.json
 *   node scripts/bench/bench-ai.mjs --runs 5 --chat-model llama3.2:latest
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { summarise, fmt } from "./lib/stats.mjs";
import * as ollama from "./lib/ollama.mjs";
import {
  getAutoPopulateValues,
  parseJournalMetadata,
  AISummaryPrompt,
  sanitizeSummary,
  isSummarizable,
  respondWithoutContext,
} from "../../electron/methods/AIPrompts.js";
import {
  JOURNAL_ENTRIES,
  JOURNAL_MEDIUM,
  CHAT_QUERIES,
  GHOST_TEXT_PROMPTS,
  EMBED_INPUTS,
} from "./fixtures/corpus.mjs";

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const OUT = flag("--out", null);
/** Generation runs default low: each is seconds, and the suite has many. */
const RUNS = Number(flag("--runs", "3"));
const EMBED_RUNS = Number(flag("--embed-runs", "15"));
const CHAT_MODEL = flag("--chat-model", "llama3.2:latest");
const EMBED_MODEL = flag("--embed-model", "nomic-embed-text:v1.5");

if (!(await ollama.isUp())) {
  console.error(
    "Ollama is not reachable at http://localhost:11434.\n" +
      "Start it and ensure the app's models are pulled, then re-run.",
  );
  process.exit(1);
}

const available = await ollama.listModels();
const names = available.map((m) => m.name);
for (const required of [CHAT_MODEL, EMBED_MODEL]) {
  if (!names.includes(required)) {
    console.error(
      `Model "${required}" is not pulled. Available: ${names.join(", ") || "none"}`,
    );
    process.exit(1);
  }
}

console.log(`Chat model:      ${CHAT_MODEL}`);
console.log(`Embedding model: ${EMBED_MODEL}\n`);

const results = {};
const notes = {};

const record = (name, samples, extra = {}) => {
  results[name] = { ...summarise(samples), ...extra };
  const r = results[name];
  console.log(
    `  ${name.padEnd(34)} p50 ${fmt(r.p50).padStart(9)}  p95 ${fmt(r.p95).padStart(9)}` +
      (extra.tokensPerSec ? `  ${extra.tokensPerSec} tok/s` : ""),
  );
};

// ============================================================ embeddings ===

console.log("Embeddings");

for (const input of EMBED_INPUTS) {
  const samples = [];
  let dimensions = null;
  for (let i = 0; i < EMBED_RUNS; i++) {
    const r = await ollama.embed(input.text, EMBED_MODEL);
    if (i === 0)
      dimensions = r.dimensions; // first call warms the model
    else samples.push(r.wallMs);
  }
  record(`embed.${input.name}`, samples, {
    dimensions,
    inputChars: input.text.length,
  });
}

/**
 * Sustained rate, which is what the worker's backfill sweep actually runs at.
 * Measured as one continuous burst rather than derived from the single-call
 * p50, because per-call latency and sustained throughput diverge once the
 * model is resident and requests queue back to back.
 */
{
  const burst = 25;
  const t0 = performance.now();
  for (let i = 0; i < burst; i++)
    await ollama.embed(JOURNAL_MEDIUM, EMBED_MODEL);
  const elapsedSec = (performance.now() - t0) / 1000;
  const perSec = burst / elapsedSec;

  results["embed.sustainedThroughput"] = {
    embeddingsPerSec: Math.round(perSec * 100) / 100,
    msPerEmbedding: Math.round((1000 / perSec) * 10) / 10,
  };

  /**
   * Projected cost of the worker's startup backfill: qdrantWorker.js:546
   * sweeps every entry not marked 'success'.
   *
   * Embedding-only. The real sweep also does a Qdrant upsert and a SQLite
   * write per entry, and that write contends with foreground reads, so these
   * are optimistic lower bounds.
   */
  results["embed.projectedBacklog"] = Object.fromEntries(
    [150, 5000, 50000].map((n) => [
      `${n} entries`,
      `${Math.round((n / perSec / 60) * 10) / 10} min`,
    ]),
  );

  console.log(
    `  ${"embed.sustainedThroughput".padEnd(34)} ${results["embed.sustainedThroughput"].embeddingsPerSec}/sec` +
      `  (${results["embed.sustainedThroughput"].msPerEmbedding}ms each)`,
  );
  for (const [k, v] of Object.entries(results["embed.projectedBacklog"])) {
    console.log(`  ${`  backfill ${k}`.padEnd(34)} ${v}`);
  }
}

// ====================================================== cold vs warm gen ===

console.log("\nModel load (cold vs warm)");

{
  await ollama.unload(CHAT_MODEL);
  const cold = await ollama.generate({
    model: CHAT_MODEL,
    prompt: "Reply with the single word: ready.",
    numPredict: 8,
  });
  const warm = await ollama.generate({
    model: CHAT_MODEL,
    prompt: "Reply with the single word: ready.",
    numPredict: 8,
  });

  results["generate.coldStart"] = {
    n: 1,
    wallMs: Math.round(cold.wallMs),
    loadMs: cold.loadMs ? Math.round(cold.loadMs) : null,
  };
  results["generate.warm"] = {
    n: 1,
    wallMs: Math.round(warm.wallMs),
    loadMs: warm.loadMs ? Math.round(warm.loadMs) : null,
  };
  notes.coldStart =
    "Single sample each. Cold = first call after an explicit keep_alive:0 unload.";

  console.log(
    `  ${"generate.coldStart".padEnd(34)} ${fmt(cold.wallMs)} (load ${fmt(cold.loadMs)})`,
  );
  console.log(
    `  ${"generate.warm".padEnd(34)} ${fmt(warm.wallMs)} (load ${fmt(warm.loadMs)})`,
  );
}

// ==================================================== journal enrichment ===

console.log("\nJournal enrichment");

for (const entry of JOURNAL_ENTRIES) {
  // --- metadata: title, mood score, mood tags (JSON mode) ---
  const metaSamples = [];
  const tokenRates = [];
  let metaParsed = 0;
  for (let i = 0; i < RUNS; i++) {
    const r = await ollama.generate({
      model: CHAT_MODEL,
      prompt: getAutoPopulateValues(entry.text),
      jsonMode: true,
      numPredict: 300,
    });
    metaSamples.push(r.wallMs);
    if (r.tokensPerSec) tokenRates.push(r.tokensPerSec);
    // The real validator: syntactically valid JSON can still fail here by
    // inventing tags or omitting a key, and the app treats that as a failure.
    if (parseJournalMetadata(r.text)) metaParsed++;
  }
  record(`enrich.metadata.${entry.name}`, metaSamples, {
    parseSuccessRate: `${metaParsed}/${RUNS}`,
    tokensPerSec: tokenRates.length
      ? Math.round(
          (tokenRates.reduce((a, b) => a + b, 0) / tokenRates.length) * 10,
        ) / 10
      : null,
  });

  // --- summary ---
  if (!isSummarizable(entry.text)) {
    results[`enrich.summary.${entry.name}`] = {
      skipped: true,
      reason: "below MIN_SUMMARY_WORDS (25) - the app skips this path",
    };
    console.log(
      `  ${`enrich.summary.${entry.name}`.padEnd(34)} skipped (too short)`,
    );
  } else {
    const sumSamples = [];
    let sumOk = 0;
    for (let i = 0; i < RUNS; i++) {
      const r = await ollama.generate({
        model: CHAT_MODEL,
        prompt: AISummaryPrompt(entry.text),
        numPredict: 300,
      });
      sumSamples.push(r.wallMs);
      // sanitizeSummary strips refusals and preambles and returns falsy when
      // the model produced nothing usable - the app's real success condition.
      if (sanitizeSummary(r.text)) sumOk++;
    }
    record(`enrich.summary.${entry.name}`, sumSamples, {
      usableRate: `${sumOk}/${RUNS}`,
    });
  }
}

/**
 * The whole per-entry cost, in the order the app incurs it.
 *
 * Ollama serves requests serially, so these three queue behind one another
 * even though the app fires them from independent event listeners
 * (PERFORMANCE.md 3.1). Measuring them together is the only way to see the
 * number a user actually waits through after saving an entry.
 */
{
  const samples = [];
  const breakdown = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    const meta = await ollama.generate({
      model: CHAT_MODEL,
      prompt: getAutoPopulateValues(JOURNAL_MEDIUM),
      jsonMode: true,
      numPredict: 300,
    });
    const summary = await ollama.generate({
      model: CHAT_MODEL,
      prompt: AISummaryPrompt(JOURNAL_MEDIUM),
      numPredict: 300,
    });
    const embedding = await ollama.embed(JOURNAL_MEDIUM, EMBED_MODEL);
    samples.push(performance.now() - t0);
    breakdown.push({
      metadataMs: Math.round(meta.wallMs),
      summaryMs: Math.round(summary.wallMs),
      embeddingMs: Math.round(embedding.wallMs),
    });
  }
  record("enrich.endToEnd.medium", samples, {
    lastBreakdown: breakdown[breakdown.length - 1],
  });
}

// ================================================================== chat ===

console.log("\nChat generation");

{
  const ttfts = [];
  const totals = [];
  const rates = [];
  for (let i = 0; i < Math.min(RUNS, CHAT_QUERIES.length); i++) {
    // respondWithoutContext is the real no-RAG-hits prompt. The with-context
    // variant needs retrieved entries and is covered by bench-vector.mjs.
    const r = await ollama.generateStream({
      model: CHAT_MODEL,
      prompt: respondWithoutContext(CHAT_QUERIES[i]),
      numPredict: 300,
      // respondWithoutContext demands a JSON object, and chat.js parses one
      // back with a schema, so JSON mode is part of the path being measured.
      jsonMode: true,
    });
    if (r.ttftMs) ttfts.push(r.ttftMs);
    totals.push(r.wallMs);
    if (r.tokensPerSec) rates.push(r.tokensPerSec);
  }
  record("chat.timeToFirstToken", ttfts);
  record("chat.totalGeneration", totals, {
    tokensPerSec: rates.length
      ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10
      : null,
  });
}

// ============================================================ ghost text ===

console.log("\nEditor ghost text");

{
  const samples = [];
  for (const prompt of GHOST_TEXT_PROMPTS) {
    for (let i = 0; i < RUNS; i++) {
      const r = await ollama.generate({
        model: CHAT_MODEL,
        prompt,
        numPredict: 20,
        system:
          "You are a raw text completion model. Your only job is to continue the user's text. Do not add any commentary, greetings, or conversational filler. Directly output the next sequence of words.",
        temperature: 0.2,
      });
      samples.push(r.wallMs);
    }
  }
  record("ghostText.suggestion", samples, {
    budgetNote:
      "Fires while the user types. Above a few hundred ms the suggestion arrives after the thought and is worse than absent.",
  });
}

// ================================================ blocking shell-out cost ===

/**
 * `execSync("ollama list")` from handleGetOllamaModels (ollama.js:17).
 *
 * PERFORMANCE.md 3.2 flags this as freezing the main process. Whatever this
 * measures is time during which *every* IPC channel is unresponsive, not just
 * the Model Settings page that triggers it - the main process services all IPC
 * on one thread.
 *
 * Only the warm daemon is measured. Timing a cold one means stopping the Ollama
 * service, which is too disruptive to do inside a benchmark run; a cold daemon
 * is strictly worse than what is recorded here.
 */
console.log("\nBlocking shell-out");
{
  const samples = [];
  for (let i = 0; i < 6; i++) {
    const t0 = performance.now();
    try {
      execSync("ollama list", { stdio: "ignore" });
      if (i > 0) samples.push(performance.now() - t0); // discard first
    } catch {
      break;
    }
  }
  if (samples.length) {
    record("ollamaList.execSyncBlock", samples, {
      note: "Main process is fully unresponsive for this duration (warm daemon).",
    });
  } else {
    results["ollamaList.execSyncBlock"] = { error: "ollama CLI not on PATH" };
    console.log(
      "  ollamaList.execSyncBlock         skipped - ollama CLI not on PATH",
    );
  }
}

// ================================================================ output ===

const report = {
  ollama: {
    chatModel: CHAT_MODEL,
    embedModel: EMBED_MODEL,
    modelsAvailable: available,
  },
  runs: RUNS,
  embedRuns: EMBED_RUNS,
  notes,
  results,
};

if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
}
