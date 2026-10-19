// autoUpdater.js
//
// Thin wrapper around electron-updater. Dynamically imported and fully guarded
// so the app still boots if the dependency isn't installed yet (e.g. before a
// fresh `npm install`) or when running unpackaged in dev.
//
// Nothing here touches the network unless the user asked: the launch-time
// check runs only when `checkForUpdates` is on in app settings (default off),
// and the Settings page's "Check now" button is the other way in. An offline
// journaling app must not phone home on every launch by default.

import { app, ipcMain } from "electron";
import { appSettings } from "../appSettings.js";
import { createUpdateRelay } from "./updateRelay.js";
import { log } from "../log.js";

let updaterPromise = null;

// What the window has been told so far, and whether an update is ready.
let relay = null;

// The Microsoft Store (MSIX) updates the app itself; the in-app updater must
// stay out of its way. There is no such build today.
const isStoreBuild = () => Boolean(process.windowsStore);

/**
 * electron-updater is CommonJS. Imported from ESM, its exports arrive on
 * `default`, so destructuring `autoUpdater` off the namespace gave undefined
 * and the first property write crashed every packaged launch.
 */
function loadUpdater(getWin) {
  updaterPromise ??= (async () => {
    let mod;
    try {
      mod = await import("electron-updater");
    } catch {
      log.warn("[updater] electron-updater not installed, skipping");
      return null;
    }
    const autoUpdater = mod.autoUpdater ?? mod.default?.autoUpdater;
    if (!autoUpdater) {
      log.warn("[updater] electron-updater exposes no autoUpdater");
      return null;
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    relay = createUpdateRelay((channel, payload) => {
      const win = getWin();
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    });
    autoUpdater.on("update-available", (info) => relay.available(info));
    autoUpdater.on("download-progress", (p) => relay.progress(p));
    autoUpdater.on("update-downloaded", (info) => relay.downloaded(info));
    autoUpdater.on("error", (err) => {
      log.error("[updater] error:", err?.message || err);
      relay.failed();
    });
    return autoUpdater;
  })();
  return updaterPromise;
}

/**
 * One check. Resolves to what happened rather than throwing, so the Settings
 * page can say it.
 * @returns {Promise<{status: "unavailable-in-dev" | "unavailable" | "up-to-date" | "downloading" | "error", version?: string, message?: string}>}
 */
export async function checkForUpdates(getWin) {
  if (!app.isPackaged) return { status: "unavailable-in-dev" };
  if (isStoreBuild()) return { status: "unavailable" };
  const autoUpdater = await loadUpdater(getWin);
  if (!autoUpdater) return { status: "unavailable" };
  try {
    const result = await autoUpdater.checkForUpdates();
    const latest = result?.updateInfo?.version;
    if (latest && latest !== app.getVersion()) {
      return { status: "downloading", version: latest };
    }
    return { status: "up-to-date", version: app.getVersion() };
  } catch (err) {
    const full = String(err?.message || err);
    log.error("[updater] check failed:", full);
    // electron-updater's messages embed the whole HTTP response, headers and
    // feed included. The Settings page gets one readable line.
    const message = /Unable to find latest version|No published versions/i.test(
      full,
    )
      ? "no published release was found on GitHub"
      : full.split("\n")[0].slice(0, 160);
    return { status: "error", message };
  }
}

/** The launch-time check: a no-op unless the user turned it on. */
export async function initAutoUpdater(getWin) {
  if (!appSettings.get("checkForUpdates")) return;
  await checkForUpdates(getWin);
}

export function registerUpdaterIPC(getWin) {
  ipcMain.handle("update:check", () => checkForUpdates(getWin));

  // A window that loads after the events fired asks for where things stand.
  ipcMain.handle(
    "update:get-state",
    () => relay?.getState() ?? { phase: "idle" },
  );

  // Restart into the downloaded update. The window decides when (it saves
  // drafts and refuses while an entry is mid-edit); this only refuses if
  // nothing has been downloaded. The reply goes out before the app quits.
  ipcMain.handle("update:install", async () => {
    if (!relay?.canInstall()) {
      return { success: false, error: "No update has been downloaded yet" };
    }
    const autoUpdater = await loadUpdater(getWin);
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return { success: true };
  });
}
