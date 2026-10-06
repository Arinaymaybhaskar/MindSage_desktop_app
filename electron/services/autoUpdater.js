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

let updaterPromise = null;

/**
 * electron-updater is CommonJS. Imported from ESM, its exports arrive on
 * `default`, so destructuring `autoUpdater` off the namespace gave undefined
 * and the first property write crashed every packaged launch.
 */
function loadUpdater(win) {
  updaterPromise ??= (async () => {
    let mod;
    try {
      mod = await import("electron-updater");
    } catch {
      console.warn("[updater] electron-updater not installed, skipping");
      return null;
    }
    const autoUpdater = mod.autoUpdater ?? mod.default?.autoUpdater;
    if (!autoUpdater) {
      console.warn("[updater] electron-updater exposes no autoUpdater");
      return null;
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    const notify = (channel, payload) => {
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    };
    autoUpdater.on("update-available", (info) =>
      notify("update:available", { version: info?.version }),
    );
    autoUpdater.on("download-progress", (p) =>
      notify("update:progress", { percent: Math.round(p?.percent ?? 0) }),
    );
    autoUpdater.on("update-downloaded", (info) =>
      notify("update:downloaded", { version: info?.version }),
    );
    autoUpdater.on("error", (err) =>
      console.error("[updater] error:", err?.message || err),
    );
    return autoUpdater;
  })();
  return updaterPromise;
}

/**
 * One check. Resolves to what happened rather than throwing, so the Settings
 * page can say it.
 * @returns {Promise<{status: "unavailable-in-dev" | "unavailable" | "up-to-date" | "downloading" | "error", version?: string, message?: string}>}
 */
export async function checkForUpdates(win) {
  if (!app.isPackaged) return { status: "unavailable-in-dev" };
  const autoUpdater = await loadUpdater(win);
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
    console.error("[updater] check failed:", full);
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
export async function initAutoUpdater(win) {
  if (!appSettings.get("checkForUpdates")) return;
  await checkForUpdates(win);
}

export function registerUpdaterIPC(getWin) {
  ipcMain.handle("update:check", () => checkForUpdates(getWin()));
}
