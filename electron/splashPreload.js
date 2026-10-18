// The splash window's whole bridge: it can hear the startup status line and
// nothing else. Sandboxed preloads load as CommonJS (see vite.config.ts).
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("splash", {
  onStatus: (callback) => {
    ipcRenderer.on("splash-status", (_event, text) => callback(text));
  },
});
