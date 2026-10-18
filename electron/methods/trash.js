import fs from "node:fs";
import path from "node:path";
import { app, ipcMain } from "electron";
import localDB from "../db/index.js";
import { currentUserId } from "../session.js";
import {
  isInside,
  journalMediaDir,
  planFileRemoval,
  removeThumbnails,
} from "../mediaPaths.js";
import { thumbnailDir } from "./media.js";
import { processVectorDeletions } from "./qdrant.js";

// IPC for the trash, and the job that empties it once items are 30 days old.
// Everything the renderer can ask for is scoped to the signed-in user by the
// session, never by an id it sends.

const CHUNK = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
const yieldToLoop = () => new Promise((resolve) => setImmediate(resolve));

const mediaDir = () => path.join(app.getPath("userData"), "media");

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
  for (const file of remove) {
    removeThumbnails(thumbnailDir(), file);
    try {
      fs.rmSync(file, { force: true });
      removed += 1;
    } catch (err) {
      console.error("Could not delete media file:", file, err?.message ?? err);
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
      console.error("Could not delete media folder:", dir, err?.message ?? err);
    }
  }
  if (refused.length) {
    console.warn(
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
  const index = await processVectorDeletions();
  return { ...result, searchCleanupPending: index.pending };
}

/** Purges everything past its 30 days, for every user. */
export async function purgeExpired() {
  let total = { entries: 0, goals: 0 };
  for (const [userId, ids] of localDB.expiredItems()) {
    const r = await purge(userId, ids);
    total = {
      entries: total.entries + r.entries,
      goals: total.goals + r.goals,
    };
  }
  // Also finishes any index cleanup an earlier purge could not.
  await processVectorDeletions();
  if (total.entries || total.goals) {
    console.log(
      `Trash: purged ${total.entries} entries and ${total.goals} goals`,
    );
  }
  return total;
}

let timer = null;

/** Runs the purge shortly after launch, then once a day. */
export function startTrashJob({ firstRunDelayMs = 15_000 } = {}) {
  const run = () =>
    purgeExpired().catch((err) => console.error("Trash purge failed:", err));
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

  ipcMain.handle("trash:restore", (_e, selection) =>
    localDB.restoreItems(user(), {
      entryIds: idList(selection?.entryIds),
      goalIds: idList(selection?.goalIds),
    }),
  );

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
