// Side-effect module, imported second in main.js (right after
// userDataOverride.js, so the folder is the real or overridden userData):
// points the shared logger at userData/logs and routes console output into it.
import { app } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initLogging, installConsole } from "./log.js";

const userData = app.getPath("userData");

initLogging({
  dir: path.join(userData, "logs"),
  // Longest first, so the app folder is named before the home folder.
  replacements: [
    [userData, "<userData>"],
    [os.homedir(), "<home>"],
  ],
});

// Development and MS_DEBUG=1 also print to the terminal.
installConsole({
  mirror: !app.isPackaged || process.env.MS_DEBUG === "1",
});

// The old unbounded, unredacted startup log.
try {
  fs.rmSync(path.join(userData, "main.log"), { force: true });
} catch {
  // Left behind; harmless.
}
