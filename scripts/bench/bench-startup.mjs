/**
 * Measures cold start, step by step, from the app's own startup log.
 *
 * electron/main.js already writes timestamped markers to
 * `<userData>/main.log` for exactly this purpose ("App ready", "Starting
 * Qdrant", "Sent services-ready to renderer", and so on), so nothing needs
 * instrumenting - this launches the packaged build, waits for the run to
 * complete, and turns those timestamps into per-step deltas.
 *
 * It launches `release/win-unpacked/MindSage.exe` rather than the dev server
 * on purpose: dev mode boots a Vite server and loads unbundled modules, which
 * describes a developer's experience and not a user's.
 *
 * **It runs against a copy of the real profile, never the profile itself.** An
 * empty profile would not be the startup path being measured: Qdrant's start
 * time depends on the size of its collections, and the database open on the
 * size of the journal. So the database, qdrant-data and Local Storage are
 * copied into a scratch directory, and the app is pointed there with APPDATA
 * and MS_USER_DATA_DIR. Caches and media are not copied; startup does not read
 * them. Launching against the real profile used to be the design, and it meant
 * a benchmark could run a schema migration on the user's only journal.
 *
 *   node scripts/bench/bench-startup.mjs --out results.json --runs 2
 */

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { summarise, fmt } from "./lib/stats.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const OUT = flag("--out", null);
const RUNS = Number(flag("--runs", "2"));
const SETTLE_MS = Number(flag("--settle", "6000"));

const exePath = path.join(repoRoot, "release", "win-unpacked", "MindSage.exe");
const realUserData = path.join(
  process.env.APPDATA ||
    (process.platform === "darwin"
      ? path.join(process.env.HOME, "Library", "Preferences")
      : path.join(process.env.HOME, ".local", "share")),
  "MindSage",
);

/** What startup reads. Everything else under userData is cache or media. */
const PROFILE_PARTS = [
  "mind-sage.db",
  "mind-sage.db-wal",
  "mind-sage.db-shm",
  "qdrant-data",
  "Local Storage",
];

const scratchAppData = fs.mkdtempSync(
  path.join(os.tmpdir(), "mindsage-startup-"),
);
const userData = path.join(scratchAppData, "MindSage");
fs.mkdirSync(userData, { recursive: true });
const copied = [];
for (const part of PROFILE_PARTS) {
  const from = path.join(realUserData, part);
  if (!fs.existsSync(from)) continue;
  fs.cpSync(from, path.join(userData, part), { recursive: true });
  copied.push(part);
}
const logPath = path.join(userData, "main.log");

if (!fs.existsSync(exePath)) {
  console.error(
    `Packaged build not found at ${path.relative(repoRoot, exePath)}.\n` +
      "Run `npm run build` first - startup is measured against the packaged app, not dev mode.",
  );
  process.exit(1);
}

/**
 * The markers main.js writes, in order. Each becomes one step, measured from
 * the previous marker.
 */
const MARKERS = [
  "App ready",
  "Splash window shown",
  "Main window created",
  "Initializing localDB",
  "Running OllamaEmbeddingModelSetup",
  "Starting Qdrant",
  "Qdrant started",
  "IPC handlers, event bus, and worker initialized",
  "Sent services-ready to renderer",
  "Renderer signaled visually ready",
];

const LINE = /^\[([^\]]+)\]\s+(.*)$/;

/** Parses the log tail written after `sinceBytes` into ordered marker events. */
function parseRun(sinceBytes) {
  if (!fs.existsSync(logPath)) return [];
  const fd = fs.openSync(logPath, "r");
  const size = fs.statSync(logPath).size;
  const buf = Buffer.alloc(Math.max(0, size - sinceBytes));
  if (buf.length) fs.readSync(fd, buf, 0, buf.length, sinceBytes);
  fs.closeSync(fd);

  const events = [];
  for (const line of buf.toString("utf8").split("\n")) {
    const m = line.match(LINE);
    if (!m) continue;
    const [, iso, message] = m;
    const marker = MARKERS.find((k) => message.trim() === k);
    if (marker) events.push({ marker, at: Date.parse(iso) });
  }
  return events;
}

/** Kills the whole process tree - Electron spawns helpers and Qdrant. */
function killTree(pid) {
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } catch {
    /* already exited */
  }
}

const runs = [];

for (let i = 0; i < RUNS; i++) {
  const startBytes = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;

  const t0 = Date.now();
  // ELECTRON_RUN_AS_NODE must be stripped. The suite runner sets it for every
  // child so better-sqlite3 loads against Electron's ABI, but it is inherited
  // here too - and it turns MindSage.exe into a bare Node process that exits
  // immediately with code 0, logging nothing. That failure looks exactly like
  // a broken build, which is a costly hour to spend.
  const appEnv = {
    ...process.env,
    APPDATA: scratchAppData,
    MS_USER_DATA_DIR: userData,
  };
  delete appEnv.ELECTRON_RUN_AS_NODE;

  const proc = spawn(exePath, [], {
    detached: true,
    stdio: "ignore",
    env: appEnv,
  });

  // Poll the log rather than the process: the window appearing is what ends a
  // startup, and the process stays alive long after that.
  let events = [];
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    events = parseRun(startBytes);
    if (events.some((e) => e.marker === "Renderer signaled visually ready"))
      break;
    await new Promise((r) => setTimeout(r, 250));
  }

  const complete = events.some(
    (e) => e.marker === "Renderer signaled visually ready",
  );
  const spawnToFirstMarker = events.length ? events[0].at - t0 : null;

  killTree(proc.pid);
  // Let ports and file locks clear before the next launch, or Qdrant's port
  // probe and the SQLite open race the dying process and skew the next run.
  await new Promise((r) => setTimeout(r, SETTLE_MS));

  if (!complete) {
    console.log(
      `  run ${i + 1}: incomplete (no visually-ready marker within 120s)`,
    );
    continue;
  }

  const steps = {};
  for (let k = 1; k < events.length; k++) {
    steps[events[k].marker] = events[k].at - events[k - 1].at;
  }
  const total = events[events.length - 1].at - events[0].at;

  runs.push({
    // Labelled because the OS file cache makes every run after the first
    // materially faster. Only a launch after a reboot is genuinely cold.
    kind: i === 0 ? "first-of-session" : "warm-filesystem-cache",
    spawnToAppReadyMs: spawnToFirstMarker,
    steps,
    totalMs: total,
  });

  console.log(
    `  run ${i + 1} (${runs[runs.length - 1].kind}): total ${fmt(total)}`,
  );
  for (const [marker, ms] of Object.entries(steps)) {
    if (ms >= 1) console.log(`      ${marker.padEnd(48)} ${fmt(ms)}`);
  }
}

// The last run's processes are dead (killTree plus the settle wait), so the
// copy can go. A failure here only leaves files in the temp directory.
try {
  fs.rmSync(scratchAppData, { recursive: true, force: true, maxRetries: 5 });
} catch {
  /* best effort */
}

if (runs.length === 0) {
  console.error("No complete startup runs were captured.");
  process.exit(1);
}

/** Per-step aggregate across runs, so one slow launch does not define a step. */
const stepStats = {};
for (const marker of MARKERS.slice(1)) {
  const samples = runs
    .map((r) => r.steps[marker])
    .filter((v) => typeof v === "number");
  if (samples.length) stepStats[marker] = summarise(samples);
}

const report = {
  target: path.relative(repoRoot, exePath),
  runs: runs.length,
  perRun: runs,
  stepStats,
  totals: summarise(runs.map((r) => r.totalMs)),
  profile: `copy of the real profile: ${copied.join(", ") || "nothing found, empty profile"}`,
  note:
    "Measured against the packaged build and a copy of the real user profile. The first run " +
    "of a session is the closest to cold; later runs benefit from the OS file cache. " +
    "A launch after a reboot would be colder than anything measured here.",
};

if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
}

console.log(`\n  total startup p50: ${fmt(report.totals.p50)}`);
