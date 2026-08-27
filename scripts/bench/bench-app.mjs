/**
 * Drives the packaged app against a seeded, throwaway profile.
 *
 * This is the harness that makes app-level measurement reproducible. Everything
 * here — IPC round-trip cost, renderer frame rate, memory growth, time to
 * interactive — depends on how much data the journal holds, and running it
 * against the developer's real profile would make every number a one-off that
 * nobody else can reproduce or compare against.
 *
 * The trick is that both halves already resolve their state from the
 * environment: `electron/db/connection.js` builds its database path from
 * `APPDATA`, and `electron/main.js` opens a CDP endpoint when `MS_REMOTE_DEBUG`
 * is set. So the app can be pointed at a generated profile of any size and then
 * driven through the same Chrome DevTools Protocol client the screenshot
 * tooling uses.
 *
 * Sequence: seed a scratch profile -> launch the packaged app against it ->
 * log in through the real IPC handler -> measure -> kill and delete.
 *
 *   node scripts/bench/bench-app.mjs --entries 5000 --out results.json
 *
 * Requires a packaged build (`npm run build`).
 */

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { attach } from "../lib/cdp.mjs";
import { summarise, fmt, fmtBytes } from "./lib/stats.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const OUT = flag("--out", null);
const ENTRIES = Number(flag("--entries", "5000"));
const PORT = flag("--port", "9333");
const RUNS = Number(flag("--runs", "20"));

const exePath = path.join(repoRoot, "release", "win-unpacked", "MindSage.exe");
if (!fs.existsSync(exePath)) {
  console.error(
    `Packaged build not found at ${path.relative(repoRoot, exePath)}. Run npm run build first.`
  );
  process.exit(1);
}

// ------------------------------------------------------- seed the profile ---

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "mindsage-bench-app-"));
const profile = path.join(scratch, "profile");
fs.mkdirSync(profile, { recursive: true });

// connection.js resolves its path from APPDATA at import time, so this has to
// be set before the dynamic import below - not after.
const realAppData = process.env.APPDATA;
process.env.APPDATA = profile;

const { db, initDatabase } = await import("../../electron/db/connection.js");
const { buildDataset, BENCH_USER } = await import("./lib/volume.mjs");

initDatabase();
buildDataset(db, ENTRIES);
db.close();
process.env.APPDATA = realAppData;

console.log(`  seeded ${ENTRIES.toLocaleString()} entries into a scratch profile`);

// ------------------------------------------------------------ launch app ---

const results = {};
let proc = null;
let cdp = null;

/** Resident memory of the whole app process tree, in bytes. */
function treeRss() {
  try {
    const out = execFileSync(
      "tasklist",
      ["/FI", "IMAGENAME eq MindSage.exe", "/FO", "CSV", "/NH"],
      { encoding: "utf8" }
    );
    let total = 0;
    for (const line of out.trim().split("\n")) {
      const field = line.trim().match(/"([^"]*)"\s*$/)?.[1] ?? "";
      const kb = field.replace(/[^\d]/g, "");
      if (kb) total += Number(kb) * 1024;
    }
    return total || null;
  } catch {
    return null;
  }
}

function killTree(pid) {
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    /* already gone */
  }
}

try {
  // ELECTRON_RUN_AS_NODE must go: the suite runner sets it so better-sqlite3
  // loads against Electron's ABI, and inheriting it here turns MindSage.exe
  // into a bare Node process that exits immediately with code 0.
  const appEnv = { ...process.env, APPDATA: profile, MS_REMOTE_DEBUG: PORT };
  delete appEnv.ELECTRON_RUN_AS_NODE;

  proc = spawn(exePath, [], { detached: true, stdio: "ignore", env: appEnv });

  // Wait for the CDP endpoint rather than a fixed sleep.
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      cdp = await attach(PORT);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!cdp) throw new Error(`No CDP endpoint on port ${PORT} within 90s`);

  await cdp.waitUntil("!!window.electron", 60000);

  /**
   * Wait for IPC handlers, not just for the bridge.
   *
   * `window.electron` is exposed by the preload script the moment the renderer
   * loads, but `ipcHandlers.js` does not run until the startup sequence reaches
   * services-ready - Qdrant spawn alone is most of a second. Invoking in that
   * gap fails with "No handler registered", which looks like a missing channel
   * rather than a race.
   */
  const handlersReady = await cdp.waitUntil(
    `(async () => {
      try {
        await window.electron.ipcRenderer.invoke("category:get-all", "offline", "probe");
        return true;
      } catch (err) {
        return !/No handler registered/.test(String(err && err.message || err));
      }
    })()`,
    60000
  );
  if (!handlersReady) throw new Error("IPC handlers never registered within 60s");

  // ---------------------------------------------------------------- login ---

  /**
   * Logs in through the real `auth:login` handler rather than forging a token.
   * Nine handlers currently only `jwt.decode`, so a forged token would work
   * today and silently stop working the moment that is fixed.
   */
  const session = await cdp.evaluate(`(async () => {
    const res = await window.electron.ipcRenderer.invoke("auth:login", "offline", {
      identifier: ${JSON.stringify(BENCH_USER.email)},
      password: ${JSON.stringify(BENCH_USER.password)},
    });
    if (!res || !res.accessToken) return { error: JSON.stringify(res) };
    localStorage.setItem("authMode", "offline");
    localStorage.setItem("accessToken", res.accessToken);
    localStorage.setItem("userInfo", JSON.stringify(res.user ?? {}));
    return { token: res.accessToken };
  })()`);

  if (session?.error || !session?.token) {
    throw new Error(`Login failed: ${session?.error ?? "no token returned"}`);
  }
  const token = session.token;

  await cdp.reload();
  await cdp.waitUntil("!!window.electron", 30000);

  // ------------------------------------------------- IPC round-trip (1.5) ---

  console.log("  IPC round-trip");

  const auth = ["offline", token];
  const ipcScenarios = {
    "journal:get-all (10)": ["journal:get-all", [...auth, 1, 10]],
    "journal:get-all (50)": ["journal:get-all", [...auth, 1, 50]],
    "journal:get-recent": ["journal:get-recent", auth],
    "journal:get-images (top)": ["journal:get-images", [...auth, "top"]],
    "dashboard:get-data": ["dashboard:get-data", auth],
    "dashboard:get-stats": ["dashboard:get-stats", auth],
    "goal:get-active-goals": ["goal:get-active-goals", auth],
  };

  for (const [name, [channel, args]] of Object.entries(ipcScenarios)) {
    const measured = await cdp.evaluate(`(async () => {
      const samples = [];
      let bytes = 0;
      for (let i = 0; i < ${RUNS + 3}; i++) {
        const t0 = performance.now();
        let r;
        try {
          r = await window.electron.ipcRenderer.invoke(${JSON.stringify(channel)}, ...${JSON.stringify(args)});
        } catch (err) { return { error: String(err && err.message || err) }; }
        if (i >= 3) samples.push(performance.now() - t0);
        if (i === 0) {
          const text = typeof r === "string" ? r : JSON.stringify(r ?? null);
          bytes = new Blob([text]).size;
        }
      }
      return { samples, bytes };
    })()`);

    if (measured?.error) {
      results[`ipc.${name}`] = { error: measured.error };
      console.log(`    ${name.padEnd(30)} error: ${measured.error}`);
      continue;
    }
    results[`ipc.${name}`] = { ...summarise(measured.samples), payloadBytes: measured.bytes };
    console.log(
      `    ${name.padEnd(30)} p50 ${fmt(results[`ipc.${name}`].p50).padStart(9)}  ` +
        `p95 ${fmt(results[`ipc.${name}`].p95).padStart(9)}  ${fmtBytes(measured.bytes)}`
    );
  }

  // ------------------------------------------- media payload cost (MEDIA-1) ---

  /**
   * The unresolved half of PERFORMANCE.md 2.1. bench-media.mjs showed the
   * base64 *encode* is cheap; what was never measured is the cost of moving
   * the resulting data URL across the IPC boundary into renderer memory.
   *
   * The seeded profile references image paths that do not exist on disk, so a
   * real file is written first - otherwise this measures the error path.
   */
  const fixtureImage = path.join(profile, "MindSage", "bench-image.jpg");
  const source = path.join(repoRoot, "scripts", "demo-data", "generated", "memories", "memory-01.jpg");
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, fixtureImage);
    for (const [name, channel] of [
      ["media.getImage", "media:getImage"],
      ["media.getThumbnail", "media:getThumbnail"],
    ]) {
      const measured = await cdp.evaluate(`(async () => {
        const samples = [];
        let bytes = 0;
        for (let i = 0; i < 8; i++) {
          const t0 = performance.now();
          let r;
          try {
            r = await window.electron.ipcRenderer.invoke(${JSON.stringify(channel)}, ${JSON.stringify(fixtureImage)});
          } catch (err) { return { error: String(err && err.message || err) }; }
          if (i >= 2) samples.push(performance.now() - t0);
          if (i === 0) bytes = typeof r === "string" ? r.length : 0;
        }
        return { samples, bytes };
      })()`);
      if (measured?.error) {
        results[name] = { error: measured.error };
        continue;
      }
      results[name] = { ...summarise(measured.samples), payloadBytes: measured.bytes };
      console.log(
        `    ${name.padEnd(30)} p50 ${fmt(results[name].p50).padStart(9)}  ${fmtBytes(measured.bytes)}`
      );
    }
  }

  // -------------------------------------- time to interactive (4.5) ---------

  console.log("  Time to interactive");

  /**
   * Dashboard load as the user experiences it: navigate, then wait until the
   * page has actually painted content. Measured end to end rather than as a
   * sum of its IPC calls, because the dashboard fires roughly eight aggregates
   * and ten image requests concurrently and the compound cost is the point.
   */
  const ttiSamples = [];
  for (let i = 0; i < 5; i++) {
    await cdp.goto("#/");
    await cdp.sleep(300);
    const ms = await cdp.evaluate(`(async () => {
      const t0 = performance.now();
      location.hash = "#/dashboard";
      const deadline = performance.now() + 30000;
      // "Settled" rather than "first painted": the previous route's text is
      // still on screen for a moment after the hash changes, so a simple
      // length threshold reports the *old* page and yields absurdly fast
      // numbers. Wait until the rendered text stops changing instead.
      let previous = -1;
      let stableFor = 0;
      while (performance.now() < deadline) {
        const length = (document.body.innerText || "").length;
        stableFor = length === previous ? stableFor + 1 : 0;
        previous = length;
        if (stableFor >= 4 && length > 400) return performance.now() - t0;
        await new Promise((r) => setTimeout(r, 50));
      }
      return null;
    })()`);
    if (typeof ms === "number") ttiSamples.push(ms);
  }
  if (ttiSamples.length) {
    results["render.dashboardSettle"] = {
      ...summarise(ttiSamples),
      note: "Time until rendered text stops changing, minus a 200ms stability window.",
    };
    console.log(
      `    ${"dashboard settle".padEnd(30)} p50 ${fmt(results["render.dashboardSettle"].p50).padStart(9)}`
    );
  }

  // ------------------------------------------ journal list frame rate (4.4) ---

  console.log("  Journal list scrolling");

  /**
   * Frame pacing while scrolling the journal list.
   *
   * A requestAnimationFrame sampler is used rather than CDP tracing: it needs
   * no trace parsing, and dropped frames are exactly what
   * PERFORMANCE.md 4.1 predicts from framer-motion `layout` on an
   * un-virtualized list that never unmounts a card.
   */
  await cdp.goto("#/journals");
  await cdp.sleep(1500);

  const scrollProfile = await cdp.evaluate(`(async () => {
    const scroller = [...document.querySelectorAll('*')].find(el =>
      el.scrollHeight > el.clientHeight + 40 &&
      /(auto|scroll)/.test(getComputedStyle(el).overflowY)
    );
    if (!scroller) return { error: "no scroll container found" };

    const frames = [];
    let last = performance.now();
    let running = true;
    const tick = () => {
      const now = performance.now();
      frames.push(now - last);
      last = now;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // Drive the list far enough that infinite scroll appends several pages.
    for (let i = 0; i < 60; i++) {
      scroller.scrollTop += 600;
      await new Promise(r => setTimeout(r, 100));
    }
    running = false;
    await new Promise(r => setTimeout(r, 100));

    const cards = document.querySelectorAll('[class*="card"], article, li').length;
    return { frames: frames.slice(1), domNodes: document.querySelectorAll('*').length, cards };
  })()`);

  if (scrollProfile?.error) {
    results["render.journalListScroll"] = { error: scrollProfile.error };
    console.log(`    ${"journal list scroll".padEnd(30)} ${scrollProfile.error}`);
  } else {
    const frames = scrollProfile.frames ?? [];
    const stats = summarise(frames);
    // 16.7ms is one frame at 60Hz; anything longer dropped at least one.
    const dropped = frames.filter((f) => f > 16.7).length;
    results["render.journalListScroll"] = {
      ...stats,
      framesSampled: frames.length,
      droppedFrames: dropped,
      droppedPercent: frames.length ? Math.round((dropped / frames.length) * 1000) / 10 : null,
      domNodes: scrollProfile.domNodes,
      cardsRendered: scrollProfile.cards,
    };
    console.log(
      `    ${"frame time".padEnd(30)} p50 ${fmt(stats.p50).padStart(9)}  p95 ${fmt(stats.p95).padStart(9)}  ` +
        `${dropped}/${frames.length} dropped  ${scrollProfile.domNodes} DOM nodes`
    );
  }

  // ---------------------------------------------- memory over a session (4.3) ---

  console.log("  Memory over a session");

  /**
   * Walks the app through its main routes repeatedly, sampling process-tree
   * RSS and renderer heap. `journalList.tsx` never unmounts cards, so growth is
   * expected - the point is to record how much, rather than to assume.
   */
  const memorySamples = [];
  const routes = ["#/dashboard", "#/journals", "#/goals", "#/memories", "#/chat"];
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const route of routes) {
      await cdp.goto(route);
      await cdp.sleep(900);
      const heap = await cdp.evaluate(
        "(performance.memory && performance.memory.usedJSHeapSize) || null"
      );
      memorySamples.push({ cycle, route, rssBytes: treeRss(), heapBytes: heap });
    }
  }

  const first = memorySamples[0];
  const last = memorySamples[memorySamples.length - 1];
  results["memory.overSession"] = {
    samples: memorySamples,
    startRssBytes: first?.rssBytes ?? null,
    endRssBytes: last?.rssBytes ?? null,
    growthBytes:
      first?.rssBytes && last?.rssBytes ? last.rssBytes - first.rssBytes : null,
    startHeapBytes: first?.heapBytes ?? null,
    endHeapBytes: last?.heapBytes ?? null,
    note: "Three passes over five routes. Growth here is not proof of a leak - caches warm too.",
  };
  console.log(
    `    ${"process tree RSS".padEnd(30)} ${fmtBytes(first?.rssBytes ?? 0)} -> ${fmtBytes(last?.rssBytes ?? 0)}`
  );
} catch (err) {
  console.error(`  bench-app failed: ${err.message}`);
  results.error = String(err.message ?? err);
} finally {
  try {
    cdp?.close();
  } catch {
    /* socket already gone */
  }
  if (proc) killTree(proc.pid);
  await new Promise((r) => setTimeout(r, 1500));
  fs.rmSync(scratch, { recursive: true, force: true });
}

const report = { entries: ENTRIES, runs: RUNS, results };

if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
}

if (results.error) process.exit(1);
