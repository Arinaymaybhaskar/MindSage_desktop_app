/**
 * A second connection writing to the journal database, for the contention
 * benchmark.
 *
 * The app's indexer runs in the main process now, but the scenario still
 * matters: any second thread or process that opens the same file (a future
 * worker, an import, a backup) writes while the UI reads. This reproduces the
 * write pattern of the old index worker - a state update per entry - without
 * needing Ollama running. The lock behaviour under test comes from two
 * connections sharing one file, not from what the writes contain.
 */

import { parentPort, workerData } from "node:worker_threads";

const { db } = await import("../../../electron/db/connection.js");

const { userId } = workerData;

// Cycle through the same states the index writes, so the CHECK constraint on
// search_index.state is exercised rather than sidestepped.
const STATUSES = ["pending", "failed", "ok"];

const ids = db
  .prepare(
    "SELECT id FROM journal_entries WHERE user_id = ? ORDER BY id LIMIT 2000",
  )
  .all(userId)
  .map((r) => r.id);

const update = db.prepare(
  `INSERT INTO search_index (user_id, source_type, source_id, state, indexed_at)
   VALUES (@userId, 'journal', @id, @state, @at)
   ON CONFLICT(source_type, source_id)
   DO UPDATE SET state = excluded.state, indexed_at = excluded.indexed_at`,
);

let completed = 0;
let stopped = false;

parentPort.on("message", (msg) => {
  if (msg === "stop") {
    stopped = true;
    parentPort.postMessage({ completed });
  }
});

parentPort.postMessage("ready");

async function writeLoop() {
  let i = 0;
  while (!stopped) {
    try {
      update.run({
        userId,
        id: ids[i % ids.length],
        state: STATUSES[i % STATUSES.length],
        at: new Date().toISOString(),
      });
      completed++;
    } catch {
      // A SQLITE_BUSY on the writing side is expected in `delete` journal mode
      // and is the reader's problem to report, not the writer's.
    }
    i++;
    // Without a yield this thread never returns to its event loop, so the
    // "stop" message is never delivered and the benchmark hangs.
    if (i % 50 === 0) await new Promise((r) => setImmediate(r));
  }
}

await writeLoop();
