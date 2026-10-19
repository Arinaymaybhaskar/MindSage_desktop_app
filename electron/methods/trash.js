import fs from "node:fs";
import path from "node:path";
import { app, ipcMain } from "electron";
import localDB from "../db/index.js";
import { currentUserId } from "../session.js";
import {
  isInside,
  journalMediaDir,
  planFileRemoval,
  pruneEmptyDirs,
  removeThumbnails,
} from "../mediaPaths.js";
import {
  addPending,
  pendingCount,
  removePath,
  retryPending,
} from "../pendingDeletions.js";
import { thumbnailDir } from "./media.js";
import { getIndexer } from "./search.js";
import { log } from "../log.js";

// IPC for the trash, and the job that empties it once items are 30 days old.
// Everything the renderer can ask for is scoped to the signed-in user by the
// session, never by an id it sends.

const CHUNK = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
const yieldToLoop = () => new Promise((resolve) => setImmediate(resolve));

const mediaDir = () => path.join(app.getPath("userData"), "media");
const pendingFile = () =>
  path.join(app.getPath("userData"), "pending-file-deletions.json");

/** Files that could not be deleted yet and are waiting for a retry. */
export const pendingFileCount = () => pendingCount(pendingFile());

/** Tries the files that were locked last time. Cheap when there are none. */
export function retryPendingFiles() {
  const r = retryPending(pendingFile(), mediaDir(), (target) => {
    removeThumbnails(thumbnailDir(), target);
    removePath(target);
    pruneEmptyDirs(mediaDir(), target);
  });
  if (r.removed) log.info(`Removed ${r.removed} file(s) left from before`);
  return r;
}

/**
 * Deletes what the purged entries left on disk: their whole media folder
 * (photos, the original recording and its WAV, anything replaced earlier), any
 * file their rows point at, and every cached thumbnail of those photos. All of
 * it confined to the app's media folder.
 */
export function removeFiles({ keys, entryIds }) {
  const base = mediaDir();
  const { remove, refused } = planFileRemoval(base, keys);
  let removed = 0;
  const failed = [];
  for (const file of remove) {
    removeThumbnails(thumbnailDir(), file);
    try {
      fs.rmSync(file, { force: true });
      removed += 1;
      pruneEmptyDirs(base, file);
    } catch (err) {
      log.error("Could not delete media file:", file, err?.message ?? err);
      failed.push(file);
    }
  }
  for (const id of entryIds) {
    const dir = journalMediaDir(base, id);
    if (!isInside(base, dir)) continue;
    try {
      // Thumbnails of anything in the folder that no row pointed at.
      for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
        removeThumbnails(thumbnailDir(), path.join(dir, name));
      }
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      log.error("Could not delete media folder:", dir, err?.message ?? err);
      failed.push(dir);
    }
  }
  if (failed.length) addPending(pendingFile(), base, failed);
  if (refused.length) {
    log.warn(
      `Skipped ${refused.length} media path(s) outside the media folder`,
    );
  }
  return removed;
}

/**
 * Removes items for good in chunks, so a big trash does not freeze the app,
 * reporting progress after each. Rows go first (in one transaction per chunk),
 * then their files, then their search-index points.
 */
export async function purge(
  userId,
  { entryIds = [], goalIds = [] },
  onProgress,
) {
  const total = entryIds.length + goalIds.length;
  const result = { entries: 0, goals: 0, files: 0 };
  let done = 0;
  const step = async (entries, goals) => {
    const r = localDB.deleteForever(userId, {
      entryIds: entries,
      goalIds: goals,
    });
    result.entries += r.entries;
    result.goals += r.goals;
    result.files += removeFiles({ keys: r.files, entryIds: r.entryIds });
    done += entries.length + goals.length;
    onProgress?.({ done, total });
    await yieldToLoop();
  };
  for (let i = 0; i < entryIds.length; i += CHUNK) {
    await step(entryIds.slice(i, i + CHUNK), []);
  }
  for (let i = 0; i < goalIds.length; i += CHUNK) {
    await step([], goalIds.slice(i, i + CHUNK));
  }
  // Fold the write-ahead log back in so removed text is not left in it.
  try {
    localDB.db.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    // A busy checkpoint only delays the cleanup.
  }
  return {
    ...result,
    filesPending: pendingFileCount(),
  };
}

/** Purges everything past its 30 days, for every user. */
export async function purgeExpired() {
  retryPendingFiles();
  let total = { entries: 0, goals: 0 };
  for (const [userId, ids] of localDB.expiredItems()) {
    const r = await purge(userId, ids);
    total = {
      entries: total.entries + r.entries,
      goals: total.goals + r.goals,
    };
  }
  if (total.entries || total.goals) {
    log.info(`Trash: purged ${total.entries} entries and ${total.goals} goals`);
  }
  return total;
}

let timer = null;

/** Runs the purge shortly after launch, then once a day. */
export function startTrashJob({ firstRunDelayMs = 15_000 } = {}) {
  const run = () =>
    purgeExpired().catch((err) => log.error("Trash purge failed:", err));
  setTimeout(run, firstRunDelayMs).unref?.();
  timer ??= setInterval(run, DAY_MS);
  timer.unref?.();
}

const idList = (v) =>
  (Array.isArray(v) ? v : []).map(Number).filter(Number.isInteger);

export function registerTrashIPC(getWin) {
  const user = () => {
    const id = currentUserId();
    if (!id) throw new Error("Not signed in");
    return id;
  };

  ipcMain.handle("trash:list", () => localDB.listTrash(user()));

  ipcMain.handle("trash:restore", (_e, selection) => {
    const result = localDB.restoreItems(user(), {
      entryIds: idList(selection?.entryIds),
      goalIds: idList(selection?.goalIds),
    });
    // An item trashed while its embedding was in flight lost its index row
    // (storeVector's "gone" path), so nothing would wake the indexer for it
    // (KAN-372). One sweep covers every restored entry, goal and progress log,
    // however many, and embeds nothing that already has a vector.
    if (result.entries || result.goals) getIndexer()?.sweep();
    return result;
  });

  const send = (progress) => {
    const win = getWin?.();
    if (win && !win.isDestroyed())
      win.webContents.send("trash:progress", progress);
  };

  ipcMain.handle("trash:delete-forever", (_e, selection) =>
    purge(
      user(),
      {
        entryIds: idList(selection?.entryIds),
        goalIds: idList(selection?.goalIds),
      },
      send,
    ),
  );

  ipcMain.handle("trash:empty", () => {
    const userId = user();
    return purge(userId, localDB.trashedIds(userId), send);
  });
}
