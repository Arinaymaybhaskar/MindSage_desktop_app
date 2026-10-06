/**
 * The quick benchmark: run by the pre-commit hook, or by hand with
 * `npm run bench:quick`.
 *
 * It answers "did this commit make the database layer slower?" in about 25
 * seconds: the db stage at 150 and 5,000 entries, 20 samples each, compared
 * with the previous quick run on this machine. The full suite (every stage,
 * about half an hour, needs Ollama and a packaged build) is what
 * `npm run bench:phase` runs at the end of each MASTER_TODO phase.
 *
 * Rules, all deliberate:
 *
 *   - It never blocks a commit. Every exit is 0. Twenty samples at small
 *     volumes are a trend line, and single scenarios move up to about 2x
 *     between identical runs, so a hard gate would refuse good commits.
 *     A regression is printed loudly instead.
 *   - It only runs when the commit stages code the app runs (electron/, src/
 *     outside tests, package.json, vite.config.ts). A docs commit measures
 *     nothing new.
 *   - It skips during a merge, rebase or cherry-pick, which replay commits
 *     already measured, and when MS_SKIP_BENCH=1.
 *   - Results go to docs/benchmarks/results/quick/, which is not committed,
 *     and are published with kind "quick" when .env.bench (or the
 *     environment) provides BENCH_API_URL and BENCH_INGEST_TOKEN.
 *
 * It measures the working tree, staged and unstaged together. Its label
 * carries the staged tree's hash, so a run can be matched to what was
 * committed.
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const quickDir = path.join(repoRoot, "docs", "benchmarks", "results", "quick");
const KEEP = 50;

const fromHook = process.argv.includes("--hook");
const git = (...args) =>
  execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
const say = (line = "") => console.log(`[bench:quick] ${line}`);

/** Paths whose change can move a database benchmark. */
const RUNTIME = [
  /^electron\//,
  /^src\//,
  /^package(-lock)?\.json$/,
  /^vite\.config\.ts$/,
];
const NOT_RUNTIME = [/\.test\.[jt]sx?$/, /^src\/test\//];

function shouldRun() {
  if (process.env.MS_SKIP_BENCH === "1") return "MS_SKIP_BENCH=1";
  if (!fromHook) return null;
  const gitDir = git("rev-parse", "--git-dir");
  for (const marker of [
    "MERGE_HEAD",
    "rebase-merge",
    "rebase-apply",
    "CHERRY_PICK_HEAD",
  ]) {
    if (fs.existsSync(path.join(repoRoot, gitDir, marker)))
      return `a ${marker.replace(/_HEAD|-merge|-apply/, "").toLowerCase()} is in progress`;
  }
  const staged = git("diff", "--cached", "--name-only").split("\n");
  const relevant = staged.filter(
    (f) =>
      RUNTIME.some((r) => r.test(f)) && !NOT_RUNTIME.some((r) => r.test(f)),
  );
  return relevant.length ? null : "no runtime code staged";
}

/** KEY=value lines from .env.bench, without overriding the environment. */
function loadBenchEnv() {
  const file = path.join(repoRoot, ".env.bench");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

/** p95 per scenario and volume, keyed "5000 list.page1". */
function p95s(record) {
  const out = new Map();
  for (const run of record?.dbRuns ?? []) {
    for (const [scenario, stats] of Object.entries(run.results ?? {})) {
      if (typeof stats?.p95 === "number")
        out.set(`${run.entries} ${scenario}`, stats.p95);
    }
  }
  return out;
}

function prune() {
  const files = fs
    .readdirSync(quickDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP)))
    fs.rmSync(path.join(quickDir, f), { force: true });
}

/**
 * True when the website stores a run's kind. Until it does, a published quick
 * run would sit on the board as an "after", so it is kept local instead. This
 * turns itself on once the website is deployed with kind support.
 */
async function websiteKnowsKinds(url) {
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/api/runs?limit=1`, {
      signal: AbortSignal.timeout(5000),
    });
    const body = await res.json();
    return (
      Array.isArray(body.runs) && body.runs.length > 0 && "kind" in body.runs[0]
    );
  } catch {
    return false;
  }
}

async function main() {
  const skip = shouldRun();
  if (skip) {
    if (fromHook) say(`skipped: ${skip}`);
    return;
  }
  loadBenchEnv();

  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const tree = fromHook ? git("write-tree").slice(0, 7) : "worktree";
  const label = `quick-${stamp}-${tree}`;
  const previousFiles = fs.existsSync(quickDir)
    ? new Set(fs.readdirSync(quickDir))
    : new Set();

  say(`running ${label} (db stage, 150 and 5,000 entries, about 25s)`);
  say("skip with MS_SKIP_BENCH=1 git commit ...");
  const env = { ...process.env };
  // The suite sets this itself for its children; inherited here it would turn
  // any app launch into a bare Node process.
  delete env.ELECTRON_RUN_AS_NODE;
  const args = [
    path.join(repoRoot, "scripts", "run-bench.mjs"),
    "--stages",
    "db",
    "--volumes",
    "150,5000",
    "--runs",
    "20",
    "--kind",
    "quick",
    "--label",
    label,
  ];
  if (!env.BENCH_API_URL || !env.BENCH_INGEST_TOKEN)
    say(
      "not publishing: set BENCH_API_URL and BENCH_INGEST_TOKEN in .env.bench",
    );
  else if (!(await websiteKnowsKinds(env.BENCH_API_URL)))
    say("not publishing: the website does not store run kinds yet");
  else args.push("--publish");

  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    say(`the run failed; the commit goes ahead. Output:`);
    console.log((result.stdout ?? "") + (result.stderr ?? ""));
    return;
  }
  for (const line of (result.stdout ?? "").split("\n")) {
    if (/published|failed|warn/i.test(line)) say(line.trim());
  }

  const current = JSON.parse(
    fs.readFileSync(path.join(quickDir, `${label}.json`), "utf8"),
  );
  // The previous run, not this one: compare against what was there before.
  const previous = (() => {
    const before = [...previousFiles].filter((f) => f.endsWith(".json"));
    if (!before.length) return null;
    const records = before.map((f) =>
      JSON.parse(fs.readFileSync(path.join(quickDir, f), "utf8")),
    );
    return (
      records
        .filter((r) => r.machine?.platform === current.machine?.platform)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        .at(-1) ?? null
    );
  })();
  prune();

  if (!previous) {
    say(`recorded ${label}; no earlier quick run on this machine to compare`);
    return;
  }
  const now = p95s(current);
  const then = p95s(previous);
  // Twice as slow and at least 2ms worse: below that, noise between identical
  // runs of this suite produces "regressions" every other commit.
  // Recorded, but never warned on: the contention read samples only a few
  // times at 5,000 entries, and write.create pays one fsync per call. Two
  // identical runs moved these 6x apart while this hook was being built.
  const NOISY = /contention\.|write\.create/;
  const worse = [];
  for (const [key, p95] of now) {
    if (NOISY.test(key)) continue;
    const old = then.get(key);
    if (old && p95 / old >= 2 && p95 - old >= 2) worse.push([key, old, p95]);
  }
  if (!worse.length) {
    say(`recorded ${label}; nothing 2x slower than ${previous.label}`);
    return;
  }
  say(`recorded ${label}. Slower than ${previous.label} (p95):`);
  for (const [key, old, p95] of worse)
    say(
      `  ${key.padEnd(40)} ${old.toFixed(2)}ms -> ${p95.toFixed(2)}ms (${(p95 / old).toFixed(1)}x)`,
    );
  say("Single runs are noisy. If it is real, `npm run bench:quick` again");
  say("should reproduce it before you read anything into it.");
}

try {
  await main();
} catch (err) {
  say(`error, the commit goes ahead: ${err?.message ?? err}`);
}
process.exit(0);
