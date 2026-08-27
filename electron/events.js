import { BrowserWindow } from "electron";
import { eventBus } from "./eventBus.js";

export function setupEventBusListeners() {
  eventBus.on("journal:aiStarted", ({ entryId }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send("journal:aiStarted", { entryId });
  });

  eventBus.on("journal:aiCompleted", ({ entryId, aiOutput }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send("journal:aiCompleted", { entryId, aiOutput });
  });
}
