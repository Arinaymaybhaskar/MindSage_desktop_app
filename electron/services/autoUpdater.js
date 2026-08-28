// autoUpdater.js
//
// Thin wrapper around electron-updater. Dynamically imported and fully guarded
// so the app still boots if the dependency isn't installed yet (e.g. before a
// fresh `npm install`) or when running unpackaged in dev.

import { app } from "electron";

export async function initAutoUpdater(win) {
  // Updates only make sense for a packaged, installed build.
  if (!app.isPackaged) return;

  let autoUpdater;
  try {
    ({ autoUpdater } = await import("electron-updater"));
  } catch {
    console.warn(
      "[updater] electron-updater not installed, skipping auto-update",
    );
    return;
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

  try {
    await autoUpdater.checkForUpdatesAndNotify();
  } catch (err) {
    console.error("[updater] check failed:", err?.message || err);
  }
}
