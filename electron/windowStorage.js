import { BrowserWindow, session } from "electron";
import { log } from "./log.js";

// Wipes the windows' localStorage from the disk (KAN-376).
//
// The renderer keeps a display cache of the signed-in profile in
// localStorage (`userInfo`: username, email, full name). Chromium stores
// localStorage in `<userData>/Local Storage/leveldb`, where removeItem only
// appends a tombstone: the old value stays in the log file, across restarts,
// until leveldb happens to compact. Clearing the whole store is different:
// with no origin and no time range, Chromium deletes every key and then
// rewrites the database, so the old values are gone from the files. Checked
// in the real app: a deleted profile's name was in 000003.log after
// removeItem, and in no file after this.
//
// It clears every key, so the renderer that asked for the delete puts back
// what should stay (`utils/clearLocalTraces.ts`).

/** The sessions whose localStorage the app's windows use. */
export function windowSessions() {
  const all = [session.defaultSession];
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) all.push(win.webContents.session);
  }
  return [...new Set(all.filter(Boolean))];
}

/** Returns false when a session's storage could not be cleared. */
export async function eraseLocalStorage() {
  let ok = true;
  for (const s of windowSessions()) {
    try {
      await s.clearStorageData({ storages: ["localstorage"] });
      s.flushStorageData();
    } catch (err) {
      ok = false;
      log.error("Could not clear the window storage:", err?.message ?? err);
    }
  }
  return ok;
}
