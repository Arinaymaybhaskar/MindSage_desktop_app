/**
 * Measures what the app weighs on disk.
 *
 * Unlike the timing benchmarks this needs no warmup and no statistics - the
 * number is exact and reproducible. It exists in the suite so that the size
 * work in docs/BUNDLE_SIZE_PLAN.md gets a recorded before-state in the same
 * place and the same format as everything else.
 *
 * `dist/` and `dist-electron/` only exist after `npm run build`, and `release/`
 * only after electron-builder has packaged. Missing directories are reported as
 * such rather than as zero, so a partial run can never be mistaken for a win.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fmtBytes } from "./lib/stats.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const argv = process.argv.slice(2);
const outIdx = argv.indexOf("--out");
const OUT = outIdx !== -1 ? argv[outIdx + 1] : null;

/** Recursive directory size. Symlinks are not followed - node_modules is full
 *  of them and following would double-count. */
function dirSize(dir) {
  let total = 0;
  let files = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) {
        try {
          total += fs.statSync(full).size;
          files++;
        } catch {
          /* vanished mid-walk */
        }
      }
    }
  }
  return { bytes: total, files };
}

const TARGETS = {
  "renderer bundle (dist/)": "dist",
  "main process (dist-electron/)": "dist-electron",
  "bundled binaries (resources/)": "resources",
  "packaged output (release/)": "release",
  "dependencies (node_modules/)": "node_modules",
};

const results = {};
for (const [label, rel] of Object.entries(TARGETS)) {
  const full = path.join(repoRoot, rel);
  results[label] = fs.existsSync(full)
    ? dirSize(full)
    : { missing: true, hint: `${rel} not built yet` };
}

/**
 * Per-binary breakdown of resources/, which BUNDLE_SIZE_PLAN.md identifies as
 * the bulk of the installer. Knowing that ffmpeg alone is 81 MB is what makes
 * the plan actionable; a single total for resources/ would not.
 */
const resourcesDir = path.join(repoRoot, "resources");
const resourceBreakdown = {};
if (fs.existsSync(resourcesDir)) {
  for (const entry of fs.readdirSync(resourcesDir, { withFileTypes: true })) {
    const full = path.join(resourcesDir, entry.name);
    resourceBreakdown[entry.name] = entry.isDirectory()
      ? dirSize(full)
      : { bytes: fs.statSync(full).size, files: 1 };
  }
}

/** Installer artefacts, named individually - this is the number a user sees. */
const releaseDir = path.join(repoRoot, "release");
const installers = {};
if (fs.existsSync(releaseDir)) {
  for (const entry of fs.readdirSync(releaseDir)) {
    if (/\.(exe|dmg|AppImage|deb|zip)$/i.test(entry)) {
      installers[entry] = fs.statSync(path.join(releaseDir, entry)).size;
    }
  }
}

/**
 * What a user's own data occupies, as opposed to what the app ships.
 *
 * The DB benchmark already records database bytes per volume (588 KB at 150
 * entries, 137 MB at 50,000). Media is the other half and is not synthetic -
 * it is whatever photos and voice notes the real profile holds - so it is
 * reported separately and never mixed into the shipped-size figures.
 */
const userDataDir = path.join(
  process.env.APPDATA ||
    (process.platform === "darwin"
      ? path.join(process.env.HOME ?? "", "Library", "Preferences")
      : path.join(process.env.HOME ?? "", ".local", "share")),
  "MindSage"
);

const userData = {};
for (const [label, rel] of Object.entries({
  database: "mind-sage.db",
  "media/journals": path.join("media", "journals"),
  "media/thumbs": path.join("media", "thumbs"),
  "media/profile": path.join("media", "profile"),
  "qdrant storage": "qdrant",
})) {
  const full = path.join(userDataDir, rel);
  if (!fs.existsSync(full)) {
    userData[label] = { missing: true };
    continue;
  }
  userData[label] = fs.statSync(full).isDirectory()
    ? dirSize(full)
    : { bytes: fs.statSync(full).size, files: 1 };
}

const report = { results, resourceBreakdown, installers, userData };

if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
}

for (const [label, r] of Object.entries(results)) {
  console.log(
    `  ${label.padEnd(32)} ${r.missing ? "not built" : `${fmtBytes(r.bytes).padStart(10)}  (${r.files} files)`}`
  );
}

console.log("  --- user data (real profile) ---");
for (const [label, r] of Object.entries(userData)) {
  console.log(
    `  ${label.padEnd(32)} ${r.missing ? "absent" : `${fmtBytes(r.bytes).padStart(10)}  (${r.files} files)`}`
  );
}
