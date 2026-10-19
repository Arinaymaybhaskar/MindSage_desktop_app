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

/** Drops and recreates the vector table, for a different embedding model. */
export function rebuildVectorTable(db, dim = EMBEDDING_DIM) {
  db.exec("DROP TABLE IF EXISTS vec_entries");
  ensureVectorTable(db, dim);
}
