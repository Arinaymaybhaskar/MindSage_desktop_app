import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import localDB from "../db/index.js";
import { journalMediaDir } from "../mediaPaths.js";
import { processVectorDeletions } from "./qdrant.js";
import { removeFiles } from "./trash.js";

// Deleting a whole profile (KAN-56): the database rows, their media files and
// thumbnails, their search-index points, and, when it was the last profile on
// this computer, the database backups too (they hold nothing but that
// profile). With other profiles present the backups stay: they are whole-
// database snapshots and also protect those people.

const userData = () => app.getPath("userData");

const folderBytes = (dir) => {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      total += entry.isDirectory() ? folderBytes(full) : fs.statSync(full).size;
    }
  } catch {
    // A missing folder is zero bytes.
  }
  return total;
};

/** What the delete screen lists: counts, and how much media is on disk. */
export function describeProfile(userId) {
  const summary = localDB.profileSummary(userId);
  const ids = localDB.db
    .prepare("SELECT id FROM journal_entries WHERE user_id = ?")
    .all(userId)
    .map((r) => r.id);
  const base = path.join(userData(), "media");
  const mediaBytes = ids.reduce(
    (sum, id) => sum + folderBytes(journalMediaDir(base, id)),
    0,
  );
  return { ...summary, mediaBytes };
}

/** Removes everything of this profile. The caller has checked the password. */
export async function deleteProfileEverything(userId) {
  const removed = localDB.deleteProfile(userId);
  const filesRemoved = removeFiles({
    keys: removed.files,
    entryIds: removed.entryIds,
  });
  let backupsRemoved = false;
  if (removed.lastProfile) {
    try {
      fs.rmSync(path.join(userData(), "backups"), {
        recursive: true,
        force: true,
      });
      backupsRemoved = true;
    } catch (err) {
      console.error(
        "Could not delete the database backups:",
        err?.message ?? err,
      );
    }
  }
  const index = await processVectorDeletions();
  return {
    entries: removed.entryIds.length,
    filesRemoved,
    lastProfile: removed.lastProfile,
    backupsRemoved,
    searchCleanupPending: index.pending,
  };
}
