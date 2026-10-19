/**
 * A throwaway sqlite-vec store for the benchmarks, built the way the app builds
 * its own (electron/db/vectorExtension.js): vec0, 768 dimensions, cosine
 * distance, user_id as the partition key. Runs under Electron-as-Node, where
 * better-sqlite3 is built.
 */
import Database from "better-sqlite3";
import {
  EMBEDDING_DIM,
  ensureVectorTable,
  loadVectorExtension,
} from "../../../electron/db/vectorExtension.js";

const buf = (vector) => {
  const f = Float32Array.from(vector);
  return Buffer.from(f.buffer, f.byteOffset, f.byteLength);
};

export function openVecStore(file = ":memory:") {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  const loaded = loadVectorExtension(db);
  if (!loaded.ok) throw new Error(`sqlite-vec did not load: ${loaded.error}`);
  ensureVectorTable(db, EMBEDDING_DIM);
  const insert = db.prepare(
    "INSERT INTO vec_entries(rowid, embedding, user_id) VALUES (?, ?, ?)",
  );
  const knn = db.prepare(
    `SELECT rowid, distance FROM vec_entries
      WHERE embedding MATCH ? AND k = ? AND user_id = ? ORDER BY distance`,
  );
  return {
    db,
    version: loaded.version,
    /** Inserts many vectors in one transaction. items: [{ id, vector }] */
    insertMany(items, userId = 1) {
      db.transaction(() => {
        for (const { id, vector } of items) {
          insert.run(BigInt(id), buf(vector), BigInt(userId));
        }
      })();
    },
    /** Nearest k; score is 1 - cosine distance, as the app reports it. */
    search(vector, k = 5, userId = 1) {
      return knn.all(buf(vector), k, BigInt(userId)).map((r) => ({
        id: Number(r.rowid),
        distance: r.distance,
        score: 1 - r.distance,
      }));
    },
    close() {
      db.close();
    },
  };
}
