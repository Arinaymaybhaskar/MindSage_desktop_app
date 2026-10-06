// userDataOverride.js
//
// Opt in with MS_USER_DATA_DIR=<dir> to run the app against a throwaway
// profile. The benchmark and capture harnesses set it, alongside APPDATA.
//
// APPDATA alone is not enough on Windows. connection.js reads APPDATA, so the
// database moves, but Electron resolves userData through the OS known-folder
// API and ignores the variable. Without this, a "scratch" launch still wrote
// main.log, logs/, media/ and qdrant-data/ into the user's real profile, so a
// benchmark run could reach the real vector index.
//
// It also tells connection.js where the database goes (MS_DB_DIR): userData,
// beside the logs and media, which the Qdrant worker thread inherits through
// the environment because it has no Electron app object to ask.
//
// This module must be the first import in main.js. electron-store builds its
// file path when appSettings.js, store.js and tokenSecret.js are evaluated,
// so setting the path any later leaves those stores in the real profile.

import { app } from "electron";

if (process.env.MS_USER_DATA_DIR) {
  app.setPath("userData", process.env.MS_USER_DATA_DIR);
}

process.env.MS_DB_DIR = app.getPath("userData");
