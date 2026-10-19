import { createRequire } from "node:module";
import fs from "node:fs";

// Loads the sqlite-vec extension into a better-sqlite3 handle (KAN-192). The
// search index lives in the same database file as the journal, so there is no
// second process, port or store to keep in step with it.
//
// No Electron import: the database tests load this under Electron-as-Node.

const require = createRequire(import.meta.url);

/** nomic-embed-text:v1.5, the embedding model the app sets up. */
export const EMBEDDING_DIM = 768;

/**
 * The extension's file. A packaged app keeps node_modules inside app.asar,
 * and a native library cannot be opened from inside an archive, so the
 * asarUnpack entry in package.json puts it next to the archive and this
 * points there.
 */
export function extensionPath() {
  const raw = require("sqlite-vec").getLoadablePath();
  const unpacked = raw.replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
  return unpacked !== raw && fs.existsSync(unpacked) ? unpacked : raw;
}

/**
 * @returns {{ ok: true, version: string } | { ok: false, error: string }}
 *   Never throws: a machine that cannot load the extension still opens its
 *   journal, and only search is unavailable.
 */
export function loadVectorExtension(db) {
  try {
    db.loadExtension(extensionPath());
    const { v } = db.prepare("SELECT vec_version() AS v").get();
    return { ok: true, version: v };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

/**
 * Creates the vector table if it is missing. It is made here rather than in a
 * numbered migration so a failure to load the extension can never stop the
 * journal's own migrations. user_id is a partition key, so a search reads only
 * the signed-in user's vectors; cosine distance matches what Qdrant scored.
 */
export function ensureVectorTable(db, dim = EMBEDDING_DIM) {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_entries USING vec0(
      embedding float[${Number(dim)}] distance_metric=cosine,
      user_id integer partition key
    )
  `);
}

/**
 * Removes every vector that no longer belongs to an indexed item (KAN-368).
 *
 * A vector is kept only while its rowid has a search_index row that was filled
 * by storeVector (indexed_at set). Two things leave one behind, both only when
 * the extension could not be loaded, because vec_entries cannot be touched at
 * all then: a purge or profile delete removes the search_index row but not the
 * vector (no row), and SQLite may then hand the freed id to a new item, whose
 * row has never been indexed (indexed_at NULL). The second case is why the
 * rule is not just "no row": the old vector must not become the new item's.
 * A model reset made without the extension also leaves indexed_at NULL, and
 * those vectors are stale anyway.
 *
 * Run it once the extension is loaded and before anything searches or
 * indexes. The scan reads rowids only (about 35 ms at 50,000 vectors).
 * @returns {number} how many vectors were removed
 */
export function removeOrphanVectors(db) {
  const orphans = db
    .prepare(
      `SELECT v.rowid AS id FROM vec_entries v
        WHERE NOT EXISTS (
          SELECT 1 FROM search_index s
           WHERE s.id = v.rowid AND s.indexed_at IS NOT NULL)`,
    )
    .all();
  if (!orphans.length) return 0;
  const del = db.prepare("DELETE FROM vec_entries WHERE rowid = ?");
  db.transaction(() => {
    for (const { id } of orphans) del.run(BigInt(id));
  })();
  return orphans.length;
}

/** Drops and recreates the vector table, for a different embedding model. */
export function rebuildVectorTable(db, dim = EMBEDDING_DIM) {
  db.exec("DROP TABLE IF EXISTS vec_entries");
  ensureVectorTable(db, dim);
}
