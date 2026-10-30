import { eventBus } from "../eventBus.js";
import { log } from "../log.js";
import * as index from "../db/searchIndex.js";
import { embedFitting, isUnavailable } from "../ai/embedFitting.js";

// Keeps the search index in step with the journal (KAN-192, KAN-88). It runs in
// the main process: embedding is an HTTP call to Ollama and the writes are
// short transactions, so there is no worker thread to start or lose.
//
// One loop does everything: a new entry, an edit, the first fill of an empty
// index, items saved while Ollama was down and a model swap all arrive as
// rows in search_index and are worked off in small batches.

export const BATCH_SIZE = 25;
const PAUSE_BETWEEN_BATCHES_MS = 400;
/** Writes are given this long to finish before the next embedding starts. */
const YIELD_AFTER_WRITE_MS = 1500;
const UNAVAILABLE_RETRY_MS = [30_000, 120_000, 300_000];

const TYPE_LABEL = {
  journal: "journals",
  goal: "goals",
  progress_log: "progress logs",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} deps
 * @param {(text: string) => Promise<number[]>} deps.embed
 * @param {(event: string, data: object) => void} [deps.report]  progress to the window
 * @param {(ms: number) => Promise<void>} [deps.wait]
 * @param {() => number} [deps.now]
 */
export function createIndexer({
  embed,
  report = () => {},
  wait = sleep,
  now = Date.now,
  batchSize = BATCH_SIZE,
  pauseMs = PAUSE_BETWEEN_BATCHES_MS,
}) {
  let running = null;
  let rerun = false;
  let timer = null;
  let lastWrite = 0;
  let unavailableCount = 0;
  let stopped = false;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  function schedule(ms) {
    if (stopped) return;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void drain();
    }, ms);
    timer.unref?.();
  }

  /** Queues one item (if its text changed) and wakes the loop. */
  function noteChanged(type, id) {
    lastWrite = now();
    try {
      if (index.vectorsAvailable() && index.noteChanged(type, id)) wake();
    } catch (error) {
      log.warn("Could not queue item for search", { type, id, error });
    }
  }

  /** Starts a pass soon; passes never overlap. */
  function wake(ms = 50) {
    schedule(ms);
  }

  async function processOne(item) {
    const source = index.loadSource(item.type, item.id);
    if (!source || !source.live) {
      index.removeSources(item.type, [item.id]);
      return "gone";
    }
    // A blank item has nothing to embed (the model returns no vector): it is
    // done without one instead of failing until it gives up (KAN-391).
    const vector = await embedFitting(embed, source.text);
    return index.storeVector(item.type, item.id, vector, source.hash);
  }

  async function drain() {
    if (stopped || !index.vectorsAvailable()) return;
    if (running) {
      rerun = true;
      return running;
    }
    running = (async () => {
      let done = 0;
      let failed = 0;
      let total = 0;
      let bulk = false;
      let backlogSeen = false;
      try {
        for (;;) {
          if (stopped) break;
          const work = index.pendingWork(batchSize, now());
          if (!work.length) break;
          if (!backlogSeen) {
            backlogSeen = true;
            total = index.pendingCount(now());
            bulk = total > 1;
            if (bulk) report("index:bulkStarted", { kind: "items", total });
          }
          for (const item of work) {
            // Yield to the person typing: their save comes first.
            while (now() - lastWrite < YIELD_AFTER_WRITE_MS && !stopped) {
              await wait(YIELD_AFTER_WRITE_MS - (now() - lastWrite));
            }
            if (!bulk) {
              if (item.type === "journal") {
                report("journal:indexStarted", { entryId: item.id });
              }
            }
            try {
              const outcome = await processOne(item);
              unavailableCount = 0;
              if (!bulk && item.type === "journal" && outcome === "ok") {
                report("journal:indexCompleted", { entryId: item.id });
              }
              // "stale" stays pending and is picked up by the next batch.
            } catch (error) {
              if (isUnavailable(error)) {
                // Ollama is not there: keep every row as it is and look
                // again later, without spending anyone's attempts.
                const delay =
                  UNAVAILABLE_RETRY_MS[
                    Math.min(unavailableCount, UNAVAILABLE_RETRY_MS.length - 1)
                  ];
                unavailableCount += 1;
                log.info("Embedding model unavailable; search index waits", {
                  retryInMs: delay,
                });
                if (bulk) {
                  report("index:bulkCompleted", {
                    kind: "items",
                    total,
                    failed: failed,
                    paused: true,
                  });
                }
                schedule(delay);
                return;
              }
              failed += 1;
              const result = index.markFailure(
                item.type,
                item.id,
                item.userId,
                error,
                now(),
              );
              log.warn("Could not index item", {
                type: item.type,
                id: item.id,
                attempts: result.attempts,
                error,
              });
              if (!bulk && item.type === "journal") {
                report("journal:indexFailed", {
                  entryId: item.id,
                  error: String(error?.message ?? error),
                });
              }
            }
            done += 1;
            if (bulk) {
              report("index:bulkProgress", {
                kind: "items",
                done,
                total: Math.max(total, done),
              });
            }
          }
          await wait(pauseMs);
        }
        if (bulk) {
          report("index:bulkCompleted", {
            kind: "items",
            total: Math.max(total, done),
            failed,
          });
        }
        // Wake again when the soonest failed row is due.
        const next = index.nextRetryAt();
        if (next !== null) schedule(Math.max(1000, next - now()));
      } catch (error) {
        log.error("Search indexing pass failed", error);
        schedule(60_000);
      }
    })().finally(() => {
      running = null;
      if (rerun) {
        rerun = false;
        wake(0);
      }
    });
    return running;
  }

  function onEntry(type) {
    return ({ entry } = {}) => {
      if (entry?.id != null) noteChanged(type, entry.id);
    };
  }

  const listeners = [
    ["journal:created", onEntry("journal")],
    ["journal:updated", onEntry("journal")],
    ["goal:created", onEntry("goal")],
    ["goal:updated", onEntry("goal")],
    ["progress_log:created", onEntry("progress_log")],
  ];

  return {
    /** Subscribes to changes and does a first pass (the fill of a new index). */
    start() {
      // Items that gave up get a fresh round once per launch (KAN-472).
      const retried = index.retryGaveUp();
      if (retried) log.info(`Search: retrying ${retried} item(s) that gave up`);
      stopped = false;
      for (const [name, fn] of listeners) eventBus.on(name, fn);
      wake(0);
    },
    stop() {
      stopped = true;
      clearTimer();
      for (const [name, fn] of listeners) eventBus.off(name, fn);
    },
    noteChanged,
    /** Re-checks everything: items with no state row, due retries. */
    sweep() {
      wake(0);
    },
    /** Waits for the pass in flight (tests). */
    idle: async () => {
      while (running) await running;
    },
    drain,
    labelFor: (type) => TYPE_LABEL[type],
  };
}
