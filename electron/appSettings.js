// appSettings.js
//
// Persistent app-level preferences (distinct from model-settings.json).
// `launchAtStartup` defaults to OFF: the app previously forced itself into
// Windows startup on every launch, which reads as untrustworthy. It is now
// opt-in and driven entirely by this stored value.

import Store from "electron-store";
import { app, ipcMain } from "electron";

export const appSettings = new Store({
  name: "app-settings",
  defaults: {
    launchAtStartup: false,
    // Off by default for the same reason: an update check is a network
    // request, and this app promises not to make one the user did not ask for.
    checkForUpdates: false,
  },
});

/** Apply the stored launch-at-startup preference to the OS login items. */
export function applyLaunchAtStartup() {
  const enabled = appSettings.get("launchAtStartup");
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: [],
  });
  return enabled;
}

export function registerAppSettingsIPC() {
  ipcMain.handle("settings:get-app", () => ({
    launchAtStartup: appSettings.get("launchAtStartup"),
    checkForUpdates: appSettings.get("checkForUpdates"),
  }));

  ipcMain.handle("settings:set-launch-at-startup", (_e, enabled) => {
    appSettings.set("launchAtStartup", !!enabled);
    applyLaunchAtStartup();
    return { launchAtStartup: !!enabled };
  });

  ipcMain.handle("settings:set-check-for-updates", (_e, enabled) => {
    appSettings.set("checkForUpdates", !!enabled);
    return { checkForUpdates: !!enabled };
  });
}
