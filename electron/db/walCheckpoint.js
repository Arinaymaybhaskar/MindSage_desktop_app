import { log } from "../log.js";

// Folding the write-ahead log back into the database file (KAN-371).
//
// With secure_delete on, removing a row writes zeroed copies of its pages, but
// in WAL mode those copies go to mind-sage.db-wal first. Until a checkpoint
// copies them back, the main file keeps the old page images (the deleted text)
// and the WAL can still hold older frames with it too. A TRUNCATE checkpoint
// copies every frame back, overwriting the old pages, and empties the WAL.
//
// Anything that deletes for good (the trash purge, deleting a profile) calls
// this afterwards. Import-free apart from the logger so it can be unit-tested
// with a fake database.

/**
 * One TRUNCATE checkpoint. A reader holding the WAL (another program with the
 * file open) makes it give up after `timeoutMs`, having copied what it could:
 * the busy wait is shortened for the call so it never freezes the main
 * process for better-sqlite3's default 5 s.
 * @returns {{ ok: boolean, busy: number, log: number, checkpointed: number }}
 */
export function checkpointOnce(d, { timeoutMs = 100 } = {}) {
  let previous = null;
  try {
    previous = d.pragma("busy_timeout", { simple: true });
    d.pragma(`busy_timeout = ${Math.max(0, Math.floor(timeoutMs))}`);
  } catch {
    previous = null;
  }
  try {
    const row = d.pragma("wal_checkpoint(TRUNCATE)")?.[0] ?? {};
    const busy = Number(row.busy ?? 1);
    return {
      // busy 0: every frame is back in the main file and the WAL is empty.
      // A database not in WAL mode reports 0 too (log -1): nothing to fold.
      ok: busy === 0,
      busy,
      log: Number(row.log ?? -1),
      checkpointed: Number(row.checkpointed ?? -1),
    };
  } catch (err) {
    // SQLITE_LOCKED: this connection is inside a transaction or a statement.
    log.debug("WAL checkpoint refused:", err?.message ?? err);
    return { ok: false, busy: 1, log: -1, checkpointed: -1 };
  } finally {
    if (previous !== null) {
      try {
        d.pragma(`busy_timeout = ${previous}`);
      } catch {
        // Leaving the shorter wait is harmless.
      }
    }
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Checkpoints until the WAL is empty, a few times with a short pause between
 * tries. When readers still hold it, logs a warning and reports it: the
 * startup checkpoint in initDatabase() (or closing the app) finishes it.
 * @returns {Promise<{ ok: boolean, attempts: number }>}
 */
export async function foldWal(
  d,
  { attempts = 5, waitMs = 200, timeoutMs = 100, sleep = wait } = {},
) {
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = checkpointOnce(d, { timeoutMs });
    if (last.ok) return { ok: true, attempts: attempt };
    if (attempt < attempts) await sleep(waitMs);
  }
  log.warn(
    `Could not fold the write-ahead log back after ${attempts} attempts ` +
      `(${last.checkpointed} of ${last.log} frames copied); the next start ` +
      "will finish it",
  );
  return { ok: false, attempts };
}
