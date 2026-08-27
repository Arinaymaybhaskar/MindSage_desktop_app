/**
 * Stand-in for electron/qdrantWorker.js during the contention benchmark.
 *
 * The real worker is a `Worker` thread that opens the same SQLite file as the
 * main process and writes sync status back as it embeds each entry
 * (qdrantWorker.js:320-333). This reproduces that write pattern without needing
 * Qdrant or Ollama running - the lock behaviour under test comes from two
 * connections sharing one file, not from what the writes contain.
 */

import { parentPort, workerData } from "node:worker_threads";

const { db } = await import("../../../electron/db/connection.js");

const { userId } = workerData;

// Cycle through the same status values the real worker writes, so the CHECK
// constraint on synced_to_qdrant is exercised rather than sidestepped.
const STATUSES = ["pending", "in_progress", "success"];

const ids = db
  .prepare(
    "SELECT id FROM journal_entries WHERE user_id = ? ORDER BY id LIMIT 2000"
  )
  .all(userId)
  .map((r) => r.id);

const update = db.prepare(
  "UPDATE journal_entries SET synced_to_qdrant = ?, updated_at = ? WHERE id = ?"
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
      update.run(
        STATUSES[i % STATUSES.length],
        new Date().toISOString(),
        ids[i % ids.length]
      );
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
