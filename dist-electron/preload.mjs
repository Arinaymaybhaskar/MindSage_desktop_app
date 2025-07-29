"use strict";
const electron = require("electron");
const electronAPI = {
  saveFile: () => electron.ipcRenderer.invoke("dialog:saveFile")
};
electron.contextBridge.exposeInMainWorld("electronAPI", electronAPI);
