# The search index (sqlite-vec) and the indexer

Read this before you touch search, Ask, embeddings, `electron/db/searchIndex.js`, `electron/services/indexer.js`, `vec_entries` or `search_index`, or add a handler that creates or edits entries, goals or progress logs.

**The search index is sqlite-vec in the journal database (KAN-192, KAN-88).** `vec_entries` is a `vec0` virtual table (768-dimension float32, cosine distance, `user_id` partition key) created by `initDatabase()` through [electron/db/vectorExtension.js](../../electron/db/vectorExtension.js), not by a numbered migration, so a machine that cannot load the extension still opens its journal (`vectorSupport`, search then reports `index-unavailable`; nothing else may depend on search, see [architecture.md](architecture.md)).

- `search_index` (migration 7) holds one state row per entry, goal and progress log: `state` pending / ok / failed, `attempts`, `next_attempt_at`, `content_hash`; its `id` is the vector's rowid.
- [electron/db/searchIndex.js](../../electron/db/searchIndex.js) is the data layer (everything that touches vectors goes through it: bind ids as `BigInt`, JS numbers bind as floats and fail the partition-key check).
- [electron/services/indexer.js](../../electron/services/indexer.js) runs in the main process (embedding is an HTTP call; there is no worker thread): the `journal:created/updated`, `goal:created/updated` and `progress_log:created` events (and `search:sync`, portability import via the indexer's `sweep()`, startup) mark items stale, and one loop embeds them in batches of 25 with a pause, yielding for 1.5 s after any write, backing off 1 min, 5 min, 30 min, 2 h, 12 h on a failure and giving up after 5 attempts until the text changes.
- Ollama being down is not a failure and spends no attempts.
- An edit that does not change the embedded text (mood, tags, a goal's progress) costs no embedding (`content_hash`).
- A model swap is `resetAll(dim)` plus the same loop.
- **New handlers that create or edit entries, goals or progress logs must emit the matching event with the row's `id`**; the renderer no longer asks for a sync.
- Progress reaches the renderer as `ai-status-event` `index:bulkStarted/Progress/Completed` and the per-entry `journal:indexStarted/Completed/Failed`.
- IPC is `search:query`, `search:sync`, `search:status`.
- Journal lists carry `index_state` (ok / pending / failed / null) computed from `search_index`.
- Install upgrades drop the old Qdrant bookkeeping in migration 8 and delete `<userData>/qdrant-data` ([electron/legacyQdrant.js](../../electron/legacyQdrant.js)); nothing from Qdrant is needed because every vector is made again from the journal text.
- Trashed items: results are joined back to the base tables, which filter `is_deleted = 0`, and the purge removes vectors and `search_index` rows; see [trash-and-deletion.md](trash-and-deletion.md).
- A vector is owned only by a `search_index` row that `storeVector` filled (`indexed_at` set). Without the extension a purge or profile delete can remove the state row but not the vector, and SQLite may hand the freed id to a new item; `initDatabase()` therefore runs `removeOrphanVectors` (in `vectorExtension.js`) whenever the extension loads, before anything searches or indexes, and deletes every vector whose rowid has no row or a never-indexed row, logging the count. `searchSimilar` ignores hits on never-indexed rows for the same reason (KAN-368). No queue table is involved.
- Measured on a 4-core sandbox (brute-force scan, file mapped by `MMAP_BYTES` in `vectorExtension.js`, KAN-381): 2 ms at 150 vectors, 9-11 ms at 5,000, 78-81 ms p50 and 96-117 ms p95 at 50,000. The floor is vec0's distance loop (about 80 ms); int8 does not lower it. See [FINDINGS.md](../benchmarks/FINDINGS.md) §9.
- Tests: `searchIndex.db.test.js` and `services/indexer.db.test.js` (see [tooling-and-tests.md](tooling-and-tests.md)). Packaging of the `vec0` library: see [features.md](features.md).
