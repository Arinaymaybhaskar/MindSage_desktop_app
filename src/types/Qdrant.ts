/** Shapes returned by the `qdrant:*` channels in `electron/methods/qdrant.js`. */

export interface QdrantCollection {
  name: string;
  [key: string]: unknown;
}

export interface QdrantCollectionsResponse {
  collections: QdrantCollection[];
}

export interface QdrantPoint {
  id: string | number;
  score?: number;
  payload?: Record<string, unknown>;
  vector?: Record<string, number[]> | number[];
}

/** Envelope the worker-backed sync handlers answer with. */
export interface QdrantSyncResult {
  success: boolean;
  message?: string;
  error?: string;
}
