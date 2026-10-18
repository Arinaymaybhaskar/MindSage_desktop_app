// Runs the database test project under Electron as Node, because
// better-sqlite3 is built for Electron's ABI, not the system Node's.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const electron = require("electron"); // the path to the electron binary
const vitest = path.join(
  path.dirname(require.resolve("vitest/package.json")),
  "vitest.mjs",
);

const result = spawnSync(
  electron,
  [vitest, "run", "-c", "vitest.db.config.ts", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  },
);
process.exit(result.status ?? 1);
