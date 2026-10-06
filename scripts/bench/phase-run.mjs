/**
 * The full benchmark: every stage, run once at the end of each phase of
 * docs/MASTER_TODO.md.
 *
 *   npm run bench:phase -- 1                # after Phase 1
 *   npm run bench:phase -- 1 --no-build     # reuse release/win-unpacked
 *
 * A quick run (pre-commit, `npm run bench:quick`) watches one stage commit by
 * commit. This is the other half: the record a phase is judged by, so it
 * refuses to run as anything less than complete.
 *
 *   1. Ollama must answer, or the AI, RAG and quality stages would record
 *      themselves as skipped and the run would not be full.
 *   2. It builds the packaged app first, so startup, app and size measure the
 *      code being committed rather than whatever was last built.
 *   3. It runs every stage as label `phase-<n>-<date>`, kind "full", and
 *      publishes when .env.bench provides the API settings.
 *   4. It writes a comparison against the previous full run and regenerates
 *      the status board.
 *
 * Commit what it writes under docs/benchmarks/: full runs are the system of
 * record. Then add a row to the run index in OPTIMIZATION_LOG.md saying what
 * the phase changed; the script cannot know that.
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const resultsDir = path.join(repoRoot, "docs", "benchmarks", "results");

const argv = process.argv.slice(2);
const phase = argv.find((a) => /^\d+$/.test(a));
const noBuild = argv.includes("--no-build");

if (!phase) {
  console.error("Usage: npm run bench:phase -- <phase number> [--no-build]");
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

function loadBenchEnv() {
  const file = path.join(repoRoot, ".env.bench");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

function step(title, cmd, args) {
  console.log(`\n== ${title}`);
  const r = spawnSync(cmd, args, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error(
      `\n${title} failed (exit ${r.status}). Nothing was recorded.`,
    );
    process.exit(r.status ?? 1);
  }
}

/** The newest stored full run, by its own timestamp. */
function previousFull() {
  return fs
    .readdirSync(resultsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(resultsDir, f), "utf8")))
    .filter(
      (r) => r.kind === "full" || (!r.kind && (r.stages ?? []).length >= 11),
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .at(-1);
}

loadBenchEnv();

const dirty = execFileSync("git", ["status", "--porcelain"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();
if (dirty) {
  console.log(
    "Note: the working tree has uncommitted changes, so the run is recorded as dirty.",
  );
}

try {
  const res = await fetch("http://127.0.0.1:11434/api/tags", {
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (err) {
  console.error(
    `Ollama is not answering on 127.0.0.1:11434 (${err.message}). Start it and run again:\n` +
      "a full run without it would record the AI, RAG and quality stages as skipped.",
  );
  process.exit(1);
}

if (!noBuild) {
  step("Build the renderer and main process", "npx", ["vite", "build"]);
  step("Package the app (unpacked, no installer upload)", "npx", [
    "electron-builder",
    "--publish",
    "never",
  ]);
}

const before = previousFull();
const label = `phase-${phase}-${new Date().toISOString().slice(0, 10)}`;
const publish =
  env.BENCH_API_URL && env.BENCH_INGEST_TOKEN ? ["--publish"] : [];
if (!publish.length)
  console.log(
    "Not publishing: set BENCH_API_URL and BENCH_INGEST_TOKEN in .env.bench.",
  );

step(`Full suite as ${label}`, process.execPath, [
  "scripts/run-bench.mjs",
  "--stages",
  "all",
  "--kind",
  "full",
  "--label",
  label,
  ...publish,
]);

if (before) {
  step(`Compare with ${before.label}`, process.execPath, [
    "scripts/run-bench.mjs",
    "--compare",
    before.label,
    "--label",
    label,
  ]);
}
step("Regenerate the status board", process.execPath, [
  "scripts/bench/render-board.mjs",
]);

console.log(`
Recorded ${label}. Next:
  1. Read docs/benchmarks/${label.toUpperCase()}.md${before ? ` and the comparison with ${before.label}` : ""}.
  2. Add a run-index row to docs/benchmarks/OPTIMIZATION_LOG.md saying what Phase ${phase} changed.
  3. Commit docs/benchmarks/. Full runs are the system of record.`);
