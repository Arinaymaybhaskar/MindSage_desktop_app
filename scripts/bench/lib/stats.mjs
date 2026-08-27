/**
 * Timing and summary-statistics helpers for the benchmark suite.
 *
 * Everything here reports percentiles rather than averages. A mean hides the
 * stalls that actually get noticed - one 400ms freeze inside fifty 8ms calls
 * averages out to 16ms and looks fine, while p95 shows it. Optimisation work is
 * judged on p95 in this repo for that reason.
 */

import { performance } from "node:perf_hooks";

/** Nearest-rank percentile over an unsorted sample. */
export function percentile(samples, p) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)];
}

export function summarise(samples) {
  const n = samples.length;
  if (n === 0) return { n: 0 };
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  return {
    n,
    min: round(Math.min(...samples)),
    p50: round(percentile(samples, 50)),
    p95: round(percentile(samples, 95)),
    max: round(Math.max(...samples)),
    mean: round(mean),
  };
}

const round = (x) => Math.round(x * 1000) / 1000;

/**
 * Times a synchronous function.
 *
 * Warmup runs are discarded: the first call to a better-sqlite3 statement pays
 * for query planning and page-cache misses, which is real but is a one-off, not
 * the steady-state cost a user feels while scrolling.
 *
 * `budgetMs` caps the total time spent, so a query that turns out to take 3
 * seconds at 50k entries doesn't stall the whole suite for five minutes.
 */
export function bench(fn, { runs = 50, warmup = 3, budgetMs = 20000 } = {}) {
  for (let i = 0; i < warmup; i++) fn();

  const samples = [];
  const deadline = performance.now() + budgetMs;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
    if (performance.now() > deadline) break;
  }
  return summarise(samples);
}

/** Async variant, for anything that awaits I/O. */
export async function benchAsync(
  fn,
  { runs = 30, warmup = 2, budgetMs = 20000 } = {}
) {
  for (let i = 0; i < warmup; i++) await fn();

  const samples = [];
  const deadline = performance.now() + budgetMs;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await fn();
    samples.push(performance.now() - t0);
    if (performance.now() > deadline) break;
  }
  return summarise(samples);
}

/** `1.2ms`, `340ms`, `2.10s` - whichever reads best at that magnitude. */
export function fmt(ms) {
  if (ms === undefined || ms === null) return "-";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms >= 10) return `${ms.toFixed(0)}ms`;
  return `${ms.toFixed(2)}ms`;
}

export function fmtBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
