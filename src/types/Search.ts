/** Shapes returned by the `search:*` channels in `electron/methods/search.js`. */

export interface SearchHit {
  id: number;
  /** 1 minus the cosine distance, 0..1. */
  score: number;
  payload: Record<string, unknown>;
}

/** The answer when search cannot run, in place of a list of hits. */
export interface SearchUnavailable {
  success: false;
  code?: string;
  error: string;
}

export interface SearchSyncResult {
  success: boolean;
  message?: string;
  error?: string;
  code?: string;
}

/** Where the signed-in user's items stand in the index. */
export type SearchStatus =
  | { success: false; error: string }
  | {
      success: true;
      available: boolean;
      total: number;
      ok: number;
      pending: number;
      failed: number;
      gaveUp: number;
      missing: number;
    };

/** A journal entry's place in the index, as listed with the entry. */
export type IndexState = "ok" | "pending" | "failed" | null;
