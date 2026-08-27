/**
 * Measures IPC round-trip latency from inside the real renderer.
 *
 * The DB benchmark times `electron/db/*.js` directly. This times the same work
 * as the UI experiences it: renderer -> preload bridge -> ipcHandlers ->
 * methods -> db -> structured-clone back. The gap between the two numbers is
 * the IPC and serialisation tax, which is the entire subject of
 * PERFORMANCE.md §2.1 - a query that takes 2ms can still cost the UI 200ms if
 * the result is a 40 MB base64 string.
 *
 * Unlike the rest of the suite this cannot run headless: it needs a launched,
 * logged-in app, because every handler takes an auth token and the media
 * handlers resolve real files on disk.
 *
 *   1. npm run dev:capture      (starts the app with CDP on port 9222)
 *   2. log in, so accessToken is in localStorage
 *   3. node scripts/bench/bench-ipc.mjs --out results.json
 *
 * Numbers from this script are not comparable across machines with different
 * datasets - it measures whatever is in the real database, not a generated one.
 * Record the entry count printed at the top alongside any figure quoted.
 */

import fs from "node:fs";
import path from "node:path";

import { attach } from "../lib/cdp.mjs";
import { summarise, fmt } from "./lib/stats.mjs";

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const OUT = flag("--out", null);
const RUNS = Number(flag("--runs", "25"));
const PORT = flag("--port", "9222");

const cdp = await attach(PORT);

const token = await cdp.evaluate(`localStorage.getItem("accessToken")`);
if (!token) {
  console.error(
    "No accessToken in localStorage - log in to the running app first.\n" +
      "Every IPC handler decodes a token, so an unauthenticated run measures only error paths."
  );
  process.exit(1);
}

/**
 * Times an invoke inside the page.
 *
 * The loop runs in the renderer rather than issuing one CDP command per
 * iteration on purpose: a Runtime.evaluate round-trip is itself worth a
 * millisecond or two over the WebSocket, which would swamp the very costs being
 * measured on the fast handlers.
 */
async function benchInvoke(channel, args, runs = RUNS) {
  const expression = `(async () => {
    const args = ${JSON.stringify(args)};
    const samples = [];
    for (let i = 0; i < ${runs + 3}; i++) {
      const t0 = performance.now();
      try {
        await window.electron.ipcRenderer.invoke(${JSON.stringify(channel)}, ...args);
      } catch (err) {
        return { error: String(err && err.message || err) };
      }
      if (i >= 3) samples.push(performance.now() - t0);   // discard warmup
    }
    return { samples };
  })()`;

  const result = await cdp.evaluate(expression);
  if (result?.error) return { error: result.error };
  return summarise(result.samples);
}

/**
 * Measures the size of what crosses the bridge, separately from the time.
 *
 * A payload figure is what makes the base64 finding legible: "the dashboard
 * pulls 30 MB of data URLs to show ten thumbnails" lands where "image loading
 * is slow" does not.
 */
async function payloadBytes(channel, args) {
  return cdp.evaluate(`(async () => {
    try {
      const r = await window.electron.ipcRenderer.invoke(${JSON.stringify(channel)}, ...${JSON.stringify(args)});
      const asText = typeof r === "string" ? r : JSON.stringify(r ?? null);
      return new Blob([asText]).size;
    } catch { return null; }
  })()`);
}

const auth = ["offline", token];

const scenarios = {
  "journal:get-all (page 1, 10)": { channel: "journal:get-all", args: [...auth, 1, 10] },
  "journal:get-all (page 1, 50)": { channel: "journal:get-all", args: [...auth, 1, 50] },
  "journal:get-recent": { channel: "journal:get-recent", args: auth },
  "journal:get-images (top)": { channel: "journal:get-images", args: [...auth, "top"] },
  "dashboard:get-data": { channel: "dashboard:get-data", args: auth },
  "dashboard:get-stats": { channel: "dashboard:get-stats", args: auth },
  "dashboard:get-monthly-scores": { channel: "dashboard:get-monthly-scores", args: auth },
  "goal:get-active-goals": { channel: "goal:get-active-goals", args: auth },
  "category:get-all": { channel: "category:get-all", args: auth },
};

const results = {};
for (const [name, { channel, args }] of Object.entries(scenarios)) {
  results[name] = await benchInvoke(channel, args);
  const bytes = await payloadBytes(channel, args);
  if (bytes != null) results[name].payloadBytes = bytes;
  console.log(
    `  ${name.padEnd(32)} ` +
      (results[name].error
        ? `error: ${results[name].error}`
        : `p50 ${fmt(results[name].p50).padStart(8)}  p95 ${fmt(results[name].p95).padStart(8)}` +
          (bytes ? `  ${(bytes / 1024).toFixed(0)} KB` : ""))
  );
}

// ------------------------------------------------------------ media path ---

/**
 * The media handlers need a real image key from the real database, so the
 * fixture is discovered rather than hardcoded. Skipped cleanly when the journal
 * has no photos - an empty dataset is a reason to report nothing, not to fail.
 */
const imageKey = await cdp.evaluate(`(async () => {
  const images = await window.electron.ipcRenderer.invoke(
    "journal:get-images", "offline", ${JSON.stringify(token)}, "top");
  return Array.isArray(images) && images.length ? images[0].image_key : null;
})()`);

if (imageKey) {
  for (const [name, channel] of [
    ["media:getImage (full)", "media:getImage"],
    ["media:getThumbnail", "media:getThumbnail"],
  ]) {
    results[name] = await benchInvoke(channel, [imageKey], 10);
    const bytes = await payloadBytes(channel, [imageKey]);
    if (bytes != null) results[name].payloadBytes = bytes;
    console.log(
      `  ${name.padEnd(32)} ` +
        (results[name].error
          ? `error: ${results[name].error}`
          : `p50 ${fmt(results[name].p50).padStart(8)}  p95 ${fmt(results[name].p95).padStart(8)}` +
            (bytes ? `  ${(bytes / 1024).toFixed(0)} KB` : ""))
    );
  }
} else {
  console.log("  media:*                          skipped - no images in this journal");
}

const entryCount = await cdp.evaluate(`(async () => {
  const all = await window.electron.ipcRenderer.invoke(
    "journal:get-all", "offline", ${JSON.stringify(token)}, 1, 10000);
  return Array.isArray(all) ? all.length : null;
})()`);

const report = { entryCount, results };

if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${OUT}`);
}

console.log(`\nDataset: ${entryCount ?? "unknown"} entries in the live database.`);
cdp.close();
