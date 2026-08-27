/**
 * Measures the cost of serving media as base64 over IPC.
 *
 * electron/methods/media.js reads every image, audio file and PDF with a
 * *synchronous* fs.readFileSync on the main process and returns a
 * `data:...;base64,...` string. The dashboard then asks for ten of them at once
 * (dashBoard.tsx:317). Two separate costs compound, and this separates them:
 *
 *   - blocking time  - the main process services all IPC on one thread, so
 *                      every millisecond spent in readFileSync is a millisecond
 *                      the whole UI is frozen, not merely a slow image.
 *   - payload size   - base64 inflates bytes by 4/3 and then crosses the IPC
 *                      boundary as one large string copy.
 *
 * The functions in media.js import `electron` and the db singleton, neither of
 * which loads under ELECTRON_RUN_AS_NODE without an app instance, so the exact
 * read-and-encode path is reproduced here instead. It is three lines
 * (media.js:11-14); if that changes, this must change with it.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { bench, fmtBytes } from "./lib/stats.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const argv = process.argv.slice(2);
const outIdx = argv.indexOf("--out");
const OUT = outIdx !== -1 ? argv[outIdx + 1] : null;

/** Exactly what media.js:11-14 does. */
const readAsDataUrl = (filePath, mime) =>
  `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;

const results = {};

// ------------------------------------------- the real demo image corpus ----

const memoriesDir = path.join(repoRoot, "scripts", "demo-data", "generated", "memories");
const demoImages = fs.existsSync(memoriesDir)
  ? fs.readdirSync(memoriesDir).map((f) => path.join(memoriesDir, f))
  : [];

if (demoImages.length > 0) {
  const sizes = demoImages.map((f) => fs.statSync(f).size);
  const totalBytes = sizes.reduce((a, b) => a + b, 0);
  const avgBytes = Math.round(totalBytes / sizes.length);

  results["image.single.demo"] = {
    ...bench(() => readAsDataUrl(demoImages[0], "image/jpeg"), { runs: 60 }),
    fileBytes: sizes[0],
    encodedBytes: readAsDataUrl(demoImages[0], "image/jpeg").length,
  };

  // The dashboard's actual pattern: ten images requested together. They are
  // awaited concurrently in the renderer but served serially by the one main
  // thread, so the wall-clock cost is the sum.
  const ten = Array.from({ length: 10 }, (_, i) => demoImages[i % demoImages.length]);
  results["image.dashboardTen.demo"] = {
    ...bench(() => ten.map((f) => readAsDataUrl(f, "image/jpeg")), { runs: 25 }),
    fileBytes: ten.reduce((sum, f) => sum + fs.statSync(f).size, 0),
    avgFileBytes: avgBytes,
  };
}

// --------------------------------------------- a realistic phone photo ----

/**
 * The demo corpus averages ~107 KB, which is small for a journalling app where
 * entries carry photos straight off a phone. A 3 MB case is included so the
 * baseline covers what a real user's Memories grid actually costs.
 */
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mindsage-bench-media-"));
try {
  const photoPath = path.join(tmpDir, "photo.jpg");
  // Incompressible bytes: base64 cost is independent of content, and random
  // data avoids any filesystem-level compression flattering the read.
  fs.writeFileSync(photoPath, Buffer.alloc(3 * 1024 * 1024).map(() => Math.random() * 256));

  const encoded = readAsDataUrl(photoPath, "image/jpeg");
  results["image.single.3mb"] = {
    ...bench(() => readAsDataUrl(photoPath, "image/jpeg"), { runs: 30 }),
    fileBytes: 3 * 1024 * 1024,
    encodedBytes: encoded.length,
    inflation: Math.round((encoded.length / (3 * 1024 * 1024)) * 100) / 100,
  };

  const tenPhotos = Array.from({ length: 10 }, () => photoPath);
  results["image.dashboardTen.3mb"] = {
    ...bench(() => tenPhotos.map((f) => readAsDataUrl(f, "image/jpeg")), { runs: 10 }),
    fileBytes: 10 * 3 * 1024 * 1024,
  };

  // Voice notes are stored as WAV at 16 kHz mono (media.js:91-97), so a
  // five-minute note is about 9.6 MB - the largest single payload the app
  // routinely pushes through IPC.
  const audioPath = path.join(tmpDir, "note.wav");
  fs.writeFileSync(audioPath, Buffer.alloc(16000 * 2 * 300));
  results["audio.fiveMinuteNote"] = {
    ...bench(() => readAsDataUrl(audioPath, "audio/webm"), { runs: 15 }),
    fileBytes: 16000 * 2 * 300,
  };
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ------------------------------------------------------------------ output --

const report = { results };

if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
}

for (const [name, r] of Object.entries(results)) {
  console.log(
    `  ${name.padEnd(30)} p50 ${String(r.p50).padStart(8)}ms  p95 ${String(r.p95).padStart(8)}ms` +
      (r.fileBytes ? `  (${fmtBytes(r.fileBytes)})` : "")
  );
}
