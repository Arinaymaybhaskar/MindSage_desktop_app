import { ipcMain } from "electron";
import { filterByTimeRange, hasTimeRange } from "../timeFilter.js";
import { QdrantClient } from "@qdrant/js-client-rest";
import { generateEmbedding } from "./ollama.js";
import { currentUserId } from "../session.js";
import localDB from "../db/index.js";
import {
  IndexUnavailableError,
  indexSettled,
  indexUnavailableResult,
} from "../services/searchIndex.js";

// Set once the vector index is running. Handlers register before that, and
// may have to keep working without it for the whole session, so every use
// goes through a null check rather than assuming startup succeeded.
let client = null;

export function setQdrantRuntime(runtime) {
  client = new QdrantClient({ url: runtime.baseUrl });
}

export const isIndexReady = () => client !== null;

// The client, once there is one. A call that arrives while the first start is
// still in flight waits for its outcome; null means the index is unavailable.
async function readyClient() {
  if (!client) await indexSettled();
  return client;
}

export async function SemanticSearch(
  vector,
  userId,
  limit,
  collection,
  threshold = 0.5,
  range = null,
) {
  const qdrant = await readyClient();
  if (!qdrant) throw new IndexUnavailableError();
  const wanted = limit;
  const userFilter = {
    must: [
      {
        key: "user_id",
        match: { value: userId },
      },
    ],
  };

  const results = await qdrant.search(collection, {
    vector: { name: "text_embedding", vector },
    // Asks for more than needed: trashed items are dropped below and should
    // not leave the caller short.
    // A time range drops most candidates, so look further down the list.
    limit: hasTimeRange(range) ? limit * 10 : limit * 2,
    filter: userFilter,
  });

  const filtered = filterByTimeRange(
    results.filter((r) => r.score >= threshold),
    range,
  );

  // The vector store does not know about the trash. Only live items, the
  // signed-in user's, may come back from search, Ask and related entries.
  return localDB.filterLiveResults(userId, filtered).slice(0, wanted);
}

const COLLECTION = "mind_entries";
const DELETE_CHUNK = 100;
let deletingVectors = null;

/**
 * Removes the search-index points of items that were deleted for good. The
 * queue lives in the database (vector_deletions), so a purge that happens
 * while the index is down is finished here the next time it is up, rather than
 * leaving the text behind. Safe to call at any time and from several places:
 * overlapping calls share one run.
 *
 * A group that fails (the store went away) stays queued without blocking the
 * others; a missing collection means there is nothing to remove, so those rows
 * are cleared instead of being retried forever.
 *
 * @returns {Promise<{ removed: number, pending: number }>}
 */
export function processVectorDeletions() {
  deletingVectors ??= (async () => {
    let removed = 0;
    try {
      if (!client)
        return { removed, pending: localDB.pendingVectorDeletions(1).length };
      for (;;) {
        const rows = localDB.pendingVectorDeletions(500);
        if (!rows.length) break;
        let progressed = false;
        // One delete per user and kind, in chunks. Progress-log points are
        // matched by id alone: they were written without a reliable user_id.
        const groups = new Map();
        for (const row of rows) {
          const key =
            row.source_type === "progress_log"
              ? "progress_log"
              : `${row.user_id}|${row.source_type}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(row);
        }
        for (const group of groups.values()) {
          for (let i = 0; i < group.length; i += DELETE_CHUNK) {
            const chunk = group.slice(i, i + DELETE_CHUNK);
            const must = [
              { key: "source_type", match: { value: chunk[0].source_type } },
              {
                key: "source_id",
                match: { any: chunk.map((r) => r.source_id) },
              },
            ];
            if (chunk[0].source_type !== "progress_log") {
              must.unshift({
                key: "user_id",
                match: { value: chunk[0].user_id },
              });
            }
            try {
              await client.delete(COLLECTION, { wait: true, filter: { must } });
            } catch (error) {
              if (error?.status !== 404) {
                console.error(
                  "Could not remove deleted items from the search index:",
                  error?.message ?? error,
                );
                continue; // stays queued; the other groups still run
              }
              // No collection, so nothing of theirs is in it.
            }
            localDB.clearVectorDeletions(chunk.map((r) => r.id));
            removed += chunk.length;
            progressed = true;
          }
        }
        if (!progressed) break; // everything left failed; try again later
      }
    } catch (error) {
      console.error("Search index cleanup failed:", error?.message ?? error);
    }
    return { removed, pending: localDB.pendingVectorDeletions(1).length };
  })().finally(() => {
    deletingVectors = null;
  });
  return deletingVectors;
}

export function registerQdrantIPC() {
  ipcMain.handle("qdrant:get-collections", async () => {
    const qdrant = await readyClient();
    if (!qdrant) return indexUnavailableResult();
    return qdrant.getCollections();
  });

  ipcMain.handle(
    "qdrant:create-collection",
    async (_e, name, size, distance = "Cosine") => {
      const qdrant = await readyClient();
      if (!qdrant) return indexUnavailableResult();
      return qdrant.createCollection(name, {
        vectors: { size, distance },
      });
    },
  );

  ipcMain.handle("qdrant:upsert", async (_e, collection, points) => {
    const qdrant = await readyClient();
    if (!qdrant) return indexUnavailableResult();
    return qdrant.upsert(collection, { points });
  });
  ipcMain.handle(
    "qdrant:search",
    async (_e, collection, queryInput, limit = 5, filter) => {
      const qdrant = await readyClient();
      if (!qdrant) return indexUnavailableResult();
      try {
        const query = await generateEmbedding(queryInput); // flat number[]
        const userId = currentUserId();
        return SemanticSearch(query, userId, limit, collection);
      } catch (error) {
        console.error("Error in qdrant:search:", error);
        return { success: false, error: error.message };
      }
    },
  );

  ipcMain.handle("qdrant:delete-collection", async (_e, name) => {
    const qdrant = await readyClient();
    if (!qdrant) return indexUnavailableResult();
    return qdrant.deleteCollection(name);
  });

  ipcMain.handle(
    "qdrant:update-point",
    async (_e, collection, pointId, vector, payload = {}) => {
      const qdrant = await readyClient();
      if (!qdrant) return indexUnavailableResult();
      try {
        const result = await qdrant.upsert(collection, {
          points: [
            {
              id: pointId,
              vector,
              payload,
            },
          ],
        });
        return { success: true, result };
      } catch (error) {
        console.error("Error updating point:", error);
        return { success: false, error: error.message };
      }
    },
  );

  // Update payload only (no vector overwrite)
  ipcMain.handle(
    "qdrant:update-payload",
    async (_e, collection, pointId, payload) => {
      const qdrant = await readyClient();
      if (!qdrant) return indexUnavailableResult();
      try {
        const result = await qdrant.setPayload(collection, {
          payload,
          points: [pointId],
        });
        return { success: true, result };
      } catch (error) {
        console.error("Error updating payload:", error);
        return { success: false, error: error.message };
      }
    },
  );

  // Update vector only (keep existing payload)
  ipcMain.handle(
    "qdrant:update-vector",
    async (_e, collection, pointId, vector) => {
      const qdrant = await readyClient();
      if (!qdrant) return indexUnavailableResult();
      try {
        const result = await qdrant.updateVectors(collection, {
          points: [
            {
              id: pointId,
              vector,
            },
          ],
        });
        return { success: true, result };
      } catch (error) {
        console.error("Error updating vector:", error);
        return { success: false, error: error.message };
      }
    },
  );

  // Updated bulk sync handler to support journals, goals, and progress logs
  ipcMain.handle("qdrant:bulk-sync", async () => {
    try {
      // The worker only exists once the first index start has succeeded.
      await indexSettled();
      if (global.qdrantWorker) {
        // Trigger bulk sync for all types
        global.qdrantWorker.postMessage({
          type: "journal:bulk-sync-requested",
        });
        global.qdrantWorker.postMessage({ type: "goal:bulk-sync-requested" });
        global.qdrantWorker.postMessage({
          type: "progress_log:bulk-sync-requested",
        });
        console.log(
          "IPC Handler: Bulk sync messages sent to worker for journals, goals, and progress logs",
        );
      } else {
        console.error("Qdrant worker not available");
        return { success: false, error: "Worker not available" };
      }
      return { success: true, message: "Bulk sync started for all types" };
    } catch (error) {
      console.error("Error starting bulk sync:", error);
      return { success: false, error: error.message };
    }
  });

  // Add single journal sync handler
  ipcMain.handle("qdrant:sync-journal", async (_e, journalId) => {
    try {
      // The worker only exists once the first index start has succeeded.
      await indexSettled();
      console.log(
        `IPC Handler: Received request to sync journal ID ${journalId}`,
      );
      if (global.qdrantWorker) {
        global.qdrantWorker.postMessage({
          type: "journal:sync-requested",
          data: { journalId },
        });
        console.log(
          `IPC Handler: Message sent to worker for journal ID ${journalId}`,
        );
      } else {
        console.error("Qdrant worker not available");
        return { success: false, error: "Worker not available" };
      }
      return { success: true, message: "Journal sync started" };
    } catch (error) {
      console.error("Error starting journal sync:", error);
      return { success: false, error: error.message };
    }
  });

  // **NEW**: Add single goal sync handler
  ipcMain.handle("qdrant:sync-goal", async (_e, goalId) => {
    try {
      // The worker only exists once the first index start has succeeded.
      await indexSettled();
      console.log(`IPC Handler: Received request to sync goal ID ${goalId}`);
      if (global.qdrantWorker) {
        global.qdrantWorker.postMessage({
          type: "goal:sync-requested",
          data: { goalId },
        });
        console.log(
          `IPC Handler: Message sent to worker for goal ID ${goalId}`,
        );
      } else {
        console.error("Qdrant worker not available");
        return { success: false, error: "Worker not available" };
      }
      return { success: true, message: "Goal sync started" };
    } catch (error) {
      console.error("Error starting goal sync:", error);
      return { success: false, error: error.message };
    }
  });

  // **NEW**: Add single progress log sync handler
  ipcMain.handle("qdrant:sync-progress-log", async (_e, progressLogId) => {
    try {
      // The worker only exists once the first index start has succeeded.
      await indexSettled();
      console.log(
        `IPC Handler: Received request to sync progress log ID ${progressLogId}`,
      );
      if (global.qdrantWorker) {
        global.qdrantWorker.postMessage({
          type: "progress_log:sync-requested",
          data: { progressLogId },
        });
        console.log(
          `IPC Handler: Message sent to worker for progress log ID ${progressLogId}`,
        );
      } else {
        console.error("Qdrant worker not available");
        return { success: false, error: "Worker not available" };
      }
      return { success: true, message: "Progress log sync started" };
    } catch (error) {
      console.error("Error starting progress log sync:", error);
      return { success: false, error: error.message };
    }
  });
}
