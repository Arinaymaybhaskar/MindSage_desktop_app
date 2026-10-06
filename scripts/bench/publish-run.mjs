/**
 * Publishes an already-stored run without re-measuring anything.
 *
 * Needed for backfilling: the runs recorded before the API existed are still
 * the baseline the whole ledger quotes, and re-running them would produce
 * different numbers and invalidate every "before" in the log.
 *
 *   node scripts/bench/publish-run.mjs baseline
 *   node scripts/bench/publish-run.mjs --all
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publishRun, publishIssues, reportPublish } from "./lib/publish.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const benchDir = path.join(repoRoot, "docs", "benchmarks");
const resultsDir = path.join(benchDir, "results");

const argv = process.argv.slice(2);
const all = argv.includes("--all");
const labels = argv.filter((a) => !a.startsWith("--"));

if (!all && labels.length === 0) {
  console.error(
    "Usage: node scripts/bench/publish-run.mjs <label> [...]  |  --all",
  );
  const available = fs.existsSync(resultsDir)
    ? fs
        .readdirSync(resultsDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(/\.json$/, ""))
    : [];
  console.error(`Stored runs: ${available.join(", ") || "none"}`);
  process.exit(1);
}

const targets = all
  ? fs
      .readdirSync(resultsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
  : labels;

// Oldest first, so the baseline exists before anything that is compared to it.
const records = targets
  .map((label) => {
    const file = path.join(resultsDir, `${label}.json`);
    if (!fs.existsSync(file)) {
      console.error(`No stored run at ${path.relative(repoRoot, file)}`);
      process.exit(1);
    }
    return { label, record: JSON.parse(fs.readFileSync(file, "utf8")) };
  })
  .sort((a, b) => new Date(a.record.timestamp) - new Date(b.record.timestamp));

let failures = 0;
for (const { label, record } of records) {
  const result = await publishRun(record);
  reportPublish(result, `run "${label}"`);
  if (!result.ok && !result.skipped) failures += 1;
}

reportPublish(
  await publishIssues(path.join(benchDir, "issues.json")),
  "issue list",
);

// A non-zero exit is appropriate here, unlike inside the suite: this command's
// only job is to publish, so a failure to publish is a failure.
process.exit(failures > 0 ? 1 : 0);
