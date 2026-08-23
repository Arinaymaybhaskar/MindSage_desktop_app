import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Separate from vite.config.ts on purpose: that config loads
// vite-plugin-electron, which we don't want spinning up during tests.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // `electron/` is included so dependency-free main-process helpers can be
    // tested. Anything there that reaches for better-sqlite3 or `electron`
    // itself will not load under vitest, so keep such tests to pure modules.
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "electron/**/*.{test,spec}.{js,ts}",
    ],
    // The default "forks" pool times out starting workers on Node 26; threads
    // is reliable here. Revisit once the toolchain targets an LTS Node.
    pool: "threads",
  },
});
