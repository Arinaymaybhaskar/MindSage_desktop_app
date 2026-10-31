import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import Store from "electron-store";

// Read before the Store below writes its defaults to disk: no file means no
// earlier launch of this install has run (KAN-501).
export const firstLaunch = !fs.existsSync(
  path.join(app.getPath("userData"), "model-settings.json"),
);

export const modelStore = new Store({
  name: "model-settings", // this will create model-settings.json in app data
  defaults: {
    selectedModels: {},
  },
});
