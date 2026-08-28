/**
 * Records the SQL a code path actually runs, so query plans are checked against
 * the real statements rather than against copies pasted into the benchmark.
 *
 * Mirroring the queries by hand was the obvious alternative and is a trap: the
 * mirror drifts from electron/db/*.js the moment anyone edits a WHERE clause,
 * and a benchmark that proves an index works on a query nobody runs is worse
 * than no benchmark. Wrapping `db.prepare` keeps the analysis honest by
 * construction.
 */

/**
 * Runs `fn`, returning everything it prepared and executed as
 * `{ sql, params }`. The patch is reverted in a `finally`, so a throwing
 * benchmark can't leave the shared `db` singleton instrumented.
 */
export function captureQueries(db, fn) {
  const captured = [];
  const originalPrepare = db.prepare.bind(db);

  db.prepare = (sql) => {
    const stmt = originalPrepare(sql);
    for (const method of ["all", "get", "run"]) {
      try {
        const original = stmt[method].bind(stmt);
        stmt[method] = (...params) => {
          captured.push({ sql, params });
          return original(...params);
        };
      } catch {
        // Non-writable method on this better-sqlite3 build: skip instrumenting
        // it rather than aborting. Losing one statement from the plan report
        // still leaves the timings valid.
      }
    }
    return stmt;
  };

  try {
    fn();
  } finally {
    db.prepare = originalPrepare;
  }
  return captured;
}

/**
 * `EXPLAIN QUERY PLAN` for each captured statement, flattened to one row per
 * plan step.
 *
 * `SCAN <table>` is the finding worth acting on - it means SQLite is reading
 * every row of that table. `SEARCH <table> USING INDEX ...` is the shape the
 * same query should have once an index covers it, and the diff between those
 * two words across a before/after run is the evidence behind any speedup claim.
 */
export function explainAll(db, captured) {
  const plans = [];
  for (const { sql, params } of captured) {
    // Parameterless DDL and pragmas have no meaningful plan.
    if (/^\s*(PRAGMA|CREATE|DROP|BEGIN|COMMIT)/i.test(sql)) continue;
    try {
      const steps = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params);
      plans.push({
        sql: normalise(sql),
        scans: steps
          .filter((s) => /^SCAN\b/.test(s.detail))
          .map((s) => s.detail),
        steps: steps.map((s) => s.detail),
      });
    } catch (err) {
      plans.push({ sql: normalise(sql), error: String(err.message ?? err) });
    }
  }
  return plans;
}

/** Collapses whitespace so multi-line template SQL fits a report table. */
const normalise = (sql) => sql.replace(/\s+/g, " ").trim();

/** Total number of full-table scans across a plan set - a single headline number. */
export function countScans(plans) {
  return plans.reduce((total, p) => total + (p.scans?.length ?? 0), 0);
}
