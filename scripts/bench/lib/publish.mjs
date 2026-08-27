/**
 * Publishes a stored run to the MindSage benchmark API.
 *
 * The local file stays the system of record. This upload is a mirror, so every
 * failure here is a warning and never an error: losing a forty-minute benchmark
 * run because a website was unreachable would be an absurd trade, and a harness
 * that can fail at the last step is a harness people stop running.
 *
 * Configure with two environment variables:
 *   BENCH_API_URL       https://<the deployment>
 *   BENCH_INGEST_TOKEN  one of the tokens the server accepts
 */

import fs from "node:fs";

const TIMEOUT_MS = 20_000;

function config() {
  const url = process.env.BENCH_API_URL?.replace(/\/+$/, "");
  const token = process.env.BENCH_INGEST_TOKEN;
  return { url, token, configured: Boolean(url && token) };
}

async function request(url, options, timeout = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Uploads one run record.
 *
 * Returns a result object rather than throwing, so callers cannot accidentally
 * make a publish failure fatal by forgetting a try/catch.
 */
export async function publishRun(record) {
  const { url, token, configured } = config();
  if (!configured) {
    return {
      ok: false,
      skipped: true,
      reason: "BENCH_API_URL and BENCH_INGEST_TOKEN are not both set.",
    };
  }

  try {
    // Checked first so an unreachable service reports itself as such rather than
    // as a mysterious POST failure.
    const health = await request(`${url}/api/health`, { method: "GET" }, 8_000);
    if (!health.ok) {
      return { ok: false, reason: `Service unhealthy (HTTP ${health.status}).` };
    }

    const res = await request(`${url}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(record),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, reason: `HTTP ${res.status}. ${detail.slice(0, 300)}` };
    }
    return { ok: true, body: await res.json().catch(() => ({})) };
  } catch (err) {
    const reason =
      err?.name === "AbortError" ? `No response within ${TIMEOUT_MS / 1000}s.` : String(err?.message ?? err);
    return { ok: false, reason };
  }
}

/** Pushes the tracked-issue list so the site's board matches the repository's. */
export async function publishIssues(issuesPath) {
  const { url, token, configured } = config();
  if (!configured) return { ok: false, skipped: true, reason: "Not configured." };

  try {
    const manifest = JSON.parse(fs.readFileSync(issuesPath, "utf8"));
    const res = await request(`${url}/api/issues`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      // baselineLabels travels with the issue list: the site cannot know which
      // runs measure the unmodified tree, and without it a re-measurement is
      // presented as though it were a fix.
      body: JSON.stringify({
        issues: manifest.issues,
        baselineLabels: manifest.baselineLabels ?? ["baseline"],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, reason: `HTTP ${res.status}. ${detail.slice(0, 300)}` };
    }
    return { ok: true, body: await res.json().catch(() => ({})) };
  } catch (err) {
    return { ok: false, reason: String(err?.message ?? err) };
  }
}

/** Prints the outcome in the shape the rest of the suite uses. */
export function reportPublish(result, what = "run") {
  if (result.ok) {
    const n = result.body?.measurements;
    console.log(`  published ${what}${n ? ` (${n} measurements)` : ""}`);
    return;
  }
  if (result.skipped) {
    console.log(`  not published: ${result.reason}`);
    return;
  }
  console.warn(`  WARNING: could not publish ${what} — ${result.reason}`);
  console.warn("  The local result file is unaffected; re-publish later with --publish.");
}
