/**
 * Launcher for the Ask test set: better-sqlite3 is built for Electron's ABI,
 * so the run goes through Electron as plain Node (like run-seed.mjs).
 *   npm run ask:eval -- --model llama3.2:latest [--only S01,S02|dates] [--limit 5]
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

const runner = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "ask-eval",
  "run.mjs",
);
const child = spawn(electronPath, [runner, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
});
child.on("exit", (code) => process.exit(code ?? 1));
