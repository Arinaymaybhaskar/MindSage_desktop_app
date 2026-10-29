import { defineConfig } from "vitest/config";

// The database tests need better-sqlite3, which is built for Electron's ABI
// (the postinstall step runs electron-rebuild), so plain Node cannot load it.
// They run under Electron as Node, the way `npm run seed:demo` does:
//   npm run test:db  ->  ELECTRON_RUN_AS_NODE=1 electron vitest -c this file
// Kept apart from vitest.config.ts so `npm test` stays runnable on any Node
// with no native build.
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "electron/**/*.db.test.{js,ts}",
      "scripts/ask-eval/**/*.db.test.js",
    ],
    // Same reason as the main config; native addons load fine in threads.
    pool: "threads",
    // A 5,000-entry migration is asserted separately, with its own limit.
    testTimeout: 90_000,
  },
});
