"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electron", {
  minimize: () => electron.ipcRenderer.send("minimize-window"),
  maximize: () => electron.ipcRenderer.send("maximize-window"),
  close: () => electron.ipcRenderer.send("close-window"),
  // Function to subscribe to window state changes
  onWindowStateChange: (callback) => {
    const listener = (_event, value) => callback(value);
    electron.ipcRenderer.on("window-maximized", listener);
    return () => {
      electron.ipcRenderer.removeListener("window-maximized", listener);
    };
  },
  ipcRenderer: {
    // Expose a safe subset of ipcRenderer methods
    invoke: (channel, ...args) => {
      const validChannels = [
        "login:google",
        "db:upsertJournalEntry",
        "db:getAllEntries",
        "dialog:saveFile",
        "auth:login",
        // <-- Added for standard login
        "auth:register",
        // <-- Added for standard registration
        "user:get-me",
        "user:update-profile",
        "user:get-settings",
        "user:update-settings",
        "user:change-password",
        "user:delete-account",
        "journal:create",
        "journal:get-recent",
        "journal:get-all",
        // <-- FIX: This channel was missing
        "journal:get-by-id",
        "journal:update",
        "journal:delete",
        "journal:get-mood-scores",
        "journal:get-images",
        "journal:get-chart-data",
        "media:getImage",
        "media:save",
        "media:getAudio",
        "category:get-all",
        "category:delete",
        "category:add",
        "category:update",
        "goal:get-active-goals",
        "goal:get-completed-goals",
        "goal:add",
        "goal:update",
        "goal:delete",
        "goal:toggle-pin",
        "goal:complete",
        "goal:update-progress",
        "goal:getPinned",
        "logs:getAll",
        "logs:add",
        "ollama:models",
        "ollama:get-response",
        "qdrant:start",
        "qdrant:createCollection",
        "qdrant:insertVector",
        "qdrant:searchVector",
        "qdrant:stop"
      ];
      if (validChannels.includes(channel)) {
        return electron.ipcRenderer.invoke(channel, ...args);
      }
      console.error(`Invalid IPC channel attempted: ${channel}`);
      return Promise.reject(new Error(`Invalid IPC channel: ${channel}`));
    },
    on: (channel, func) => {
      const validChannels = ["main-process-message", "sync-complete", "sync-error"];
      if (validChannels.includes(channel)) {
        electron.ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    removeAllListeners: (channel) => {
      electron.ipcRenderer.removeAllListeners(channel);
    }
  }
});
