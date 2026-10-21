import { ipcMain } from "electron";
import { embed } from "../ai/client.js";
import { currentUserId } from "../session.js";
import * as index from "../db/searchIndex.js";
import {
  IndexUnavailableError,
  indexUnavailableResult,
} from "../services/searchIndex.js";
import { log } from "../log.js";

// Semantic search over the index that lives in the journal database (KAN-192).
// Nothing here can fail because of a second process: the only way search is
// unavailable is a machine that could not load the sqlite-vec extension.

let indexer = null;

/** The running indexer, so handlers can ask it to look at an item. */
export function setIndexer(value) {
  indexer = value;
}

export const getIndexer = () => indexer;

export const isIndexReady = () => index.vectorsAvailable();

/**
 * @param {number[]} vector - the embedded query
 * @param {number} userId
 * @param {number} limit
 * @param {{ threshold?: number, range?: {from: string|null, to: string|null} | null }} [options]
 * @returns {Array<{ id: number, score: number, payload: object }>}
 */
export function semanticSearch(vector, userId, limit, options = {}) {
  if (!index.vectorsAvailable()) throw new IndexUnavailableError();
  return index.searchSimilar(userId, vector, limit, options);
}

const TYPES = new Set(index.SOURCE_TYPES);

export function registerSearchIPC() {
  ipcMain.handle("search:query", async (_e, queryInput, limit = 5) => {
    if (!index.vectorsAvailable()) return indexUnavailableResult();
    const userId = currentUserId();
    if (!userId) return { success: false, error: "Not signed in" };
    try {
      const vector = await embed(queryInput);
      return semanticSearch(vector, userId, limit);
    } catch (error) {
      log.error("search:query failed", error);
      return { success: false, error: error.message };
    }
  });

  // Ask the indexer to look at one item again. Writes announce themselves, so
  // this only matters for an item the renderer knows changed some other way.
  ipcMain.handle("search:sync", async (_e, type, id) => {
    if (!currentUserId()) return { success: false, error: "Not signed in" };
    if (!index.vectorsAvailable()) return indexUnavailableResult();
    if (!TYPES.has(type) || !Number.isInteger(Number(id))) {
      return { success: false, error: "Unknown item" };
    }
    indexer?.noteChanged(type, Number(id));
    return { success: true, message: "Queued for search" };
  });

  ipcMain.handle("search:status", async () => {
    const userId = currentUserId();
    if (!userId) return { success: false, error: "Not signed in" };
    return {
      success: true,
      available: index.vectorsAvailable(),
      ...index.indexCounts(userId),
    };
  });
}
