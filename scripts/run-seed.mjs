/**
 * Cross-platform launcher for the demo seeder.
 *
 * The seeder has to run under Electron's Node (better-sqlite3 is compiled
 * against Electron's ABI), which means ELECTRON_RUN_AS_NODE=1 must be set
 * before the process starts. Inline `VAR=value cmd` is bash-only and fails in
 * PowerShell and cmd, so the variable is set here and Electron is spawned
 * directly. Any flags passed to `npm run seed:demo -- --reset` land in argv and
 * are forwarded through.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

const here = path.dirname(fileURLToPath(import.meta.url));
const seeder = path.join(here, "seed-demo.mjs");

const child = spawn(electronPath, [seeder, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
});

child.on("exit", (code) => process.exit(code ?? 1));
