/**
 * Resolves an issue's headline metric out of a stored benchmark run.
 *
 * The optimisation log used to carry these numbers as hand-typed text, which
 * drifted the moment a run was repeated: five of seventeen rows disagreed with
 * the committed JSON, one of them by a factor of five. A row now names *where*
 * its number lives and the value is read at render time, so a stale figure is
 * not something the format can express.
 */

import { fmt, fmtBytes } from "./stats.mjs";

/**
 * Walks a path of literal keys.
 *
 * The path is an array rather than a dotted string because scenario names are
 * themselves dotted - `list.page1`, `rag.total` - so splitting on "." would cut
 * them in half.
 */
function at(obj, path) {
  let cur = obj;
  for (const key of path) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

/** The stage object a selector reads from, or undefined if the run lacks it. */
function stageOf(run, selector) {
  if (selector.stage === "db") {
    const dbRun = (run.dbRuns ?? []).find((r) => r.entries === selector.volume);
    return dbRun;
  }
  const stage = run[selector.stage];
  return stage?.skipped ? undefined : stage;
}

/**
 * Reads one selector against one run.
 *
 * Returns `null` rather than throwing when the run did not include that stage:
 * a partial run is normal - the whole point of `--stages` is to re-measure only
 * what a change could have moved - and a missing measurement has to render as
 * "not measured" rather than as a zero.
 */
export function resolve(run, selector) {
  const stage = stageOf(run, selector);
  if (!stage) return null;

  if (selector.derive === "shareOfJs") {
    const bytes = stage.byOwner?.[selector.owner];
    const total = stage.totals?.javascriptBytes;
    if (!(bytes > 0) || !(total > 0)) return null;
    return { value: (bytes / total) * 100, extra: fmtBytes(bytes) };
  }

  if (selector.derive === "largestInstaller") {
    const entries = Object.entries(stage.installers ?? {});
    if (!entries.length) return null;
    const [name, bytes] = entries.sort((a, b) => b[1] - a[1])[0];
    return { value: bytes, extra: name };
  }

  const value = at(stage, selector.path);
  if (value == null) return null;
  // Some measurements are recorded as prose - a projected backlog reads
  // "8.5 min" - and are carried through unformatted rather than dropped.
  if (typeof value === "string") return { value, text: true };
  if (typeof value !== "number") return null;
  return { value };
}

/** Formats a resolved value according to the selector's declared unit. */
export function format(resolved, selector) {
  if (resolved == null) return "—";
  if (resolved.text) return String(resolved.value);
  switch (selector.unit) {
    case "bytes":
      return fmtBytes(resolved.value);
    case "pct":
      return `${resolved.value.toFixed(1)}%`;
    case "score":
      return resolved.value.toFixed(3);
    case "count":
      return String(resolved.value);
    default:
      return fmt(resolved.value);
  }
}

/**
 * Whether a measured value clears the issue's target.
 *
 * `target` is expressed in the metric's own unit, and the comparison flips for
 * the handful of metrics where larger is better - retrieval quality being the
 * one that matters, since every speed metric in the suite can improve while it
 * silently collapses.
 */
export function meetsTarget(resolved, selector) {
  if (resolved == null || resolved.text) return null;
  if (typeof selector.target !== "number") return null;
  return selector.higherIsBetter
    ? resolved.value >= selector.target
    : resolved.value <= selector.target;
}

/** Signed change between two resolved values, oriented so positive is better. */
export function improvement(before, after, selector) {
  if (!before || !after || before.text || after.text) return null;
  if (!(before.value > 0) || !(after.value > 0)) return null;
  const ratio = selector.higherIsBetter
    ? after.value / before.value
    : before.value / after.value;
  return { ratio, better: ratio > 1 };
}

/** Human-readable delta, e.g. "3.2× faster" or "+57%". */
export function describeChange(before, after, selector) {
  const imp = improvement(before, after, selector);
  if (!imp) return "—";
  if (Math.abs(imp.ratio - 1) < 0.02) return "unchanged";
  if (selector.unit === "score" || selector.unit === "pct") {
    const pct = ((after.value - before.value) / before.value) * 100;
    const good = selector.higherIsBetter ? pct > 0 : pct < 0;
    return `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(0)}%${good ? "" : " worse"}`;
  }
  return imp.better
    ? `${imp.ratio.toFixed(1)}× faster`
    : `${(1 / imp.ratio).toFixed(1)}× slower`;
}
