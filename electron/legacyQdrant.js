import fs from "node:fs/promises";
import path from "node:path";

// Installs from before KAN-192 have a Qdrant data folder next to the database.
// Nothing reads it any more: every vector is made again from the journal text
// by the search indexer. It is only ever the index, never the journal, so it is
// removed once the new index is usable.

/**
 * @param {string} userDataDir
 * @returns {Promise<{ removed: boolean }>} never throws: a folder that cannot
 *   be removed (in use, no permission) is left for the next launch.
 */
export async function removeLegacyQdrantData(userDataDir, log = () => {}) {
  const dir = path.join(userDataDir, "qdrant-data");
  try {
    await fs.access(dir);
  } catch {
    return { removed: false };
  }
  try {
    await fs.rm(dir, { recursive: true, force: true });
    log(`Removed the old Qdrant data folder ${dir}`);
    return { removed: true };
  } catch (error) {
    log(`Could not remove the old Qdrant data folder: ${error?.message}`);
    return { removed: false };
  }
}
