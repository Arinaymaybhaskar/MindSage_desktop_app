/**
 * Benchmark suite launcher.
 *
 * Two things make this a launcher rather than a plain script:
 *
 *   1. better-sqlite3 is compiled against Electron's ABI, so the DB benchmarks
 *      must run under Electron with ELECTRON_RUN_AS_NODE=1 - a plain
 *      `node scripts/bench/bench-db.mjs` throws NODE_MODULE_VERSION. Inline
 *      `VAR=value cmd` is bash-only, so the variable is set here, exactly as
 *      scripts/run-seed.mjs does for the seeder.
 *
 *   2. electron/db/connection.js opens its database at module scope from a path
 *      resolved at import time, and every db module shares that one instance.
 *      One process can therefore hold exactly one database, so each dataset
 *      size needs its own child process.
 *
 * APPDATA is redirected to a scratch directory per child, so the suite never
 * reads or writes the real journal at %APPDATA%/MindSage/mind-sage.db.
 *
 *   npm run bench                                  # baseline, default volumes
 *   npm run bench -- --label after-indexes         # a labelled later run
 *   npm run bench -- --volumes 150,5000            # faster iteration
 *   npm run bench -- --compare baseline            # diff against a stored run
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

import { machineInfo, gitInfo, renderMarkdown, renderComparison } from "./bench/lib/report.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const resultsDir = path.join(repoRoot, "docs", "benchmarks", "results");

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const LABEL = flag("--label", "baseline");
const VOLUMES = flag("--volumes", "150,5000,50000")
  .split(",")
  .map((v) => Number(v.trim()))
  .filter(Boolean);
const RUNS = flag("--runs", "50");
const COMPARE = flag("--compare", null);

/**
 * Model tags for the AI stages.
 *
 * Swapping the chat or embedding model moves the AI numbers further than any
 * code change in the optimisation log, so a model swap has to be runnable as a
 * labelled suite run - otherwise the only way to measure one is to call the
 * individual scripts by hand and the result never lands in a comparable record.
 * Null means "whatever each script defaults to", which is the app's own tag.
 */
const CHAT_MODEL = flag("--chat-model", null);
const EMBED_MODEL = flag("--embed-model", null);
const modelArgs = [
  ...(CHAT_MODEL ? ["--chat-model", CHAT_MODEL] : []),
  ...(EMBED_MODEL ? ["--embed-model", EMBED_MODEL] : []),
];

/**
 * Which parts of the suite to run.
 *
 * The default is the headless trio: fast, needs nothing running, safe to run
 * any time. The remaining stages each need something external - Ollama, the
 * Qdrant binary, the Windows speech API, a packaged build - and together take
 * far longer, so they are opt-in via `--stages all` (npm run bench:full).
 */
const ALL_STAGES = ["db", "media", "size", "ai", "vector", "whisper", "startup", "app", "bundle", "rag", "quality"];
const DEFAULT_STAGES = ["db", "media", "size"];
const stagesArg = flag("--stages", DEFAULT_STAGES.join(","));
const STAGES =
  stagesArg === "all"
    ? ALL_STAGES
    : stagesArg.split(",").map((s) => s.trim()).filter(Boolean);

for (const stage of STAGES) {
  if (!ALL_STAGES.includes(stage)) {
    console.error(`Unknown stage "${stage}". Valid: ${ALL_STAGES.join(", ")}, or "all".`);
    process.exit(1);
  }
}
const RENDER_ONLY = argv.includes("--render");

/**
 * Mirror the finished run to the benchmark API.
 *
 * Opt-in rather than automatic: a smoke run or a throwaway label should not
 * silently join the published dataset. Requires BENCH_API_URL and
 * BENCH_INGEST_TOKEN in the environment.
 */
const PUBLISH = argv.includes("--publish");

/** Runs one benchmark script under Electron-as-Node and returns its JSON. */
function runChild(script, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(electronPath, [path.join(here, "bench", script), ...args], {
      stdio: "inherit",
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", ...extraEnv },
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} exited with code ${code}`))
    );
    child.on("error", reject);
  });
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

// ------------------------------------------------------------- comparison ---

if (COMPARE) {
  const beforeFile = path.join(resultsDir, `${COMPARE}.json`);
  const afterFile = path.join(resultsDir, `${LABEL}.json`);
  for (const f of [beforeFile, afterFile]) {
    if (!fs.existsSync(f)) {
      console.error(`No stored run at ${path.relative(repoRoot, f)}.`);
      console.error(`Available: ${fs.existsSync(resultsDir) ? fs.readdirSync(resultsDir).join(", ") : "none"}`);
      process.exit(1);
    }
  }
  const before = readJson(beforeFile);
  const after = readJson(afterFile);
  const outFile = path.join(repoRoot, "docs", "benchmarks", `COMPARISON-${COMPARE}-vs-${LABEL}.md`);
  fs.writeFileSync(outFile, renderComparison(before, after));
  console.log(`\nWrote ${path.relative(repoRoot, outFile)}`);
  process.exit(0);
}

// ------------------------------------------------------------ render only ---

/**
 * Regenerates the markdown for a stored run. Editing the report layout is
 * common; re-measuring a 50,000-entry dataset to see the new layout is not
 * worth six minutes, and re-running would also change the numbers under it.
 */
if (RENDER_ONLY) {
  const jsonFile = path.join(resultsDir, `${LABEL}.json`);
  if (!fs.existsSync(jsonFile)) {
    console.error(`No stored run at ${path.relative(repoRoot, jsonFile)}.`);
    process.exit(1);
  }
  const stored = readJson(jsonFile);
  const mdFile = path.join(repoRoot, "docs", "benchmarks", `${LABEL.toUpperCase()}.md`);
  fs.writeFileSync(mdFile, renderMarkdown(stored));
  console.log(`Wrote ${path.relative(repoRoot, mdFile)}`);
  process.exit(0);
}

// ---------------------------------------------------------------- the run ---

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "mindsage-bench-"));
const timestamp = new Date().toISOString();

console.log(`\nMindSage benchmark — label: ${LABEL}`);
console.log(`Scratch: ${scratch}\n`);

try {
  const dbRuns = [];
  const optional = {};

  /**
   * Runs one optional stage. A stage that cannot run - Ollama down, no
   * packaged build - is recorded as skipped with its reason rather than
   * aborting the suite, so a partial run still produces a usable report that
   * says plainly what is missing.
   */
  const runStage = async (stage, script, args = []) => {
    if (!STAGES.includes(stage)) return;
    console.log(`
${stage}`);
    const out = path.join(scratch, `${stage}.json`);
    try {
      await runChild(script, [...args, "--out", out]);
      optional[stage] = readJson(out);
    } catch (err) {
      console.log(`  skipped: ${err.message}`);
      optional[stage] = { skipped: true, reason: String(err.message ?? err) };
    }
  };

  if (STAGES.includes("db")) {
  console.log("Database");
  for (const entries of VOLUMES) {
    // A fresh APPDATA per volume: connection.js appends "MindSage/mind-sage.db"
    // to whatever it finds, so each child gets its own empty database.
    const appData = path.join(scratch, `vol-${entries}`);
    fs.mkdirSync(appData, { recursive: true });
    const out = path.join(scratch, `db-${entries}.json`);

    await runChild(
      "bench-db.mjs",
      ["--entries", String(entries), "--runs", RUNS, "--out", out],
      { APPDATA: appData }
    );
    dbRuns.push(readJson(out));
    }
  }

  let media = null;
  if (STAGES.includes("media")) {
    console.log("\nMedia over IPC");
    const mediaOut = path.join(scratch, "media.json");
    await runChild("bench-media.mjs", ["--out", mediaOut]);
    media = readJson(mediaOut);
  }

  let size = null;
  if (STAGES.includes("size")) {
    console.log("\nDisk footprint");
    const sizeOut = path.join(scratch, "size.json");
    await runChild("bench-size.mjs", ["--out", sizeOut]);
    size = readJson(sizeOut);
  }

  // Five runs rather than the script default of three: generation latency is
  // high-variance on a laptop, and a three-sample p95 is barely a measurement.
  await runStage("ai", "bench-ai.mjs", ["--runs", "5", ...modelArgs]);
  await runStage("vector", "bench-vector.mjs");
  await runStage("whisper", "bench-whisper.mjs");
  await runStage("startup", "bench-startup.mjs", ["--runs", "3"]);
  // The app stage seeds its own profile, so it takes an entry count rather than
  // the volume list: launching the packaged app once per volume would triple an
  // already slow stage for little extra signal.
  await runStage("app", "bench-app.mjs", ["--entries", String(VOLUMES[Math.min(1, VOLUMES.length - 1)])]);
  await runStage("bundle", "bench-bundle.mjs");
  await runStage("rag", "bench-rag.mjs", modelArgs);
  // bench-quality takes only the embedding model: retrieval quality is decided
  // before any generation happens, so the chat model cannot affect it.
  await runStage(
    "quality",
    "bench-quality.mjs",
    EMBED_MODEL ? ["--embed-model", EMBED_MODEL] : []
  );

  // ------------------------------------------------------------- persist ---

  const machine = machineInfo();
  const git = gitInfo();
  const report = {
    label: LABEL,
    timestamp,
    commit: git.commit,
    branch: git.branch,
    dirty: git.dirty,
    machine,
    stages: STAGES,
    dbRuns,
    media,
    size,
    ai: optional.ai ?? null,
    vector: optional.vector ?? null,
    whisper: optional.whisper ?? null,
    startup: optional.startup ?? null,
    app: optional.app ?? null,
    bundle: optional.bundle ?? null,
    rag: optional.rag ?? null,
    quality: optional.quality ?? null,
  };

  fs.mkdirSync(resultsDir, { recursive: true });
  const jsonFile = path.join(resultsDir, `${LABEL}.json`);
  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2));

  const mdFile = path.join(repoRoot, "docs", "benchmarks", `${LABEL.toUpperCase()}.md`);
  fs.writeFileSync(mdFile, renderMarkdown(report));

  console.log(`\nWrote ${path.relative(repoRoot, jsonFile)}`);
  console.log(`Wrote ${path.relative(repoRoot, mdFile)}`);

  // Publishing is opt-in and always advisory. The files above are the record;
  // the API is a mirror, so a failure here must never cost the run.
  if (PUBLISH) {
    console.log("\nPublishing");
    const { publishRun, publishIssues, reportPublish } = await import("./bench/lib/publish.mjs");
    reportPublish(await publishRun(report), `run "${LABEL}"`);
    reportPublish(
      await publishIssues(path.join(repoRoot, "docs", "benchmarks", "issues.json")),
      "issue list"
    );
  }
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
