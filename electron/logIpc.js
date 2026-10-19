import { ipcMain } from "electron";
import { currentLogger, logFromRenderer } from "./log.js";

/**
 * The one channel a window logs through: warnings and errors only, checked
 * and redacted in logFromRenderer before they reach the file.
 */
export function registerLogIPC() {
  ipcMain.on("log:renderer", (_event, payload) => {
    logFromRenderer(currentLogger(), payload);
  });
}
