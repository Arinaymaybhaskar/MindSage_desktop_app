/**
 * Starts the dev app with a Chrome DevTools Protocol endpoint open, so
 * Playwright can attach to the real Electron renderer for screenshot and
 * demo-video capture.
 *
 *   npm run dev:capture              # CDP on 127.0.0.1:9222
 *   npm run dev:capture -- 9333      # or pick a port
 *
 * Why this exists rather than just pointing Playwright at the Vite URL:
 * loading http://localhost:5173 in an ordinary browser renders the UI with no
 * `window.electron` bridge, so every IPC call rejects and the app shows no
 * data at all. Attaching over CDP drives the actual Electron window, preload
 * and all.
 *
 * Then start the Playwright MCP against that endpoint, e.g.
 *   npx @playwright/mcp@latest --cdp-endpoint http://127.0.0.1:9222
 *
 * The port is loopback-only and off unless this script (or MS_REMOTE_DEBUG)
 * asks for it - anything that can reach it has full control of the renderer.
 */

import { spawn } from "node:child_process";
import process from "node:process";

const port = process.argv[2] ?? "9222";

if (!/^\d+$/.test(port)) {
  console.error(`Invalid port: ${port}`);
  process.exit(1);
}

console.log(`Starting dev app with CDP on http://127.0.0.1:${port}`);
console.log("Once the window is up, verify with:");
console.log(`  curl http://127.0.0.1:${port}/json/version\n`);

// Strip ELECTRON_RUN_AS_NODE before spawning. The seeder in this same repo
// sets it (better-sqlite3 needs Electron's ABI without a window), and if it is
// still set in the calling shell, vite-plugin-electron launches electron.exe as
// bare Node instead of as Electron. That fails deep in the ESM/CJS loader with
// "Cannot read properties of undefined (reading 'exports')", which gives no
// hint at the real cause.
const env = { ...process.env, MS_REMOTE_DEBUG: port };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn("npx", ["vite"], {
  stdio: "inherit",
  shell: true,
  env,
});

child.on("exit", (code) => process.exit(code ?? 1));
