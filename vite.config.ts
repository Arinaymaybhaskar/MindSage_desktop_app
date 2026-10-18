import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import pkg from "./package.json";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { cspPlugin } from "./electron/csp.js";

export default defineConfig({
  plugins: [
    cspPlugin(),
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: "electron/main.js",
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: Object.keys(pkg.dependencies || {}),
              output: { format: "esm" },
            },
          },
          plugins: [
            viteStaticCopy({
              targets: [
                // Only what qdrantWorker.js needs at runtime. Everything
                // else under electron/ is bundled into main.js, so copying
                // it here would ship a second, dead copy. The worker is
                // spawned from a file path rather than imported, which is
                // why it and its imports have to exist as real files.
                { src: "electron/qdrantWorker.js", dest: "." },
                { src: "electron/eventBus.js", dest: "." },
                { src: "electron/db/connection.js", dest: "db" },
                { src: "electron/db/migrations.js", dest: "db" },
              ],
            }),
          ],
        },
      },

      // Sandboxed preloads cannot be ES modules, so both are emitted as
      // CommonJS. The package is "type": "module", hence the .cjs extension.
      // A sandboxed preload can require only "electron", so the two entries
      // must not share an import: Rollup would emit a shared chunk that
      // neither can load (windowGuard.test.js checks the built output).
      preload: {
        input: {
          preload: path.join(__dirname, "electron/preload.js"),
          splashPreload: path.join(__dirname, "electron/splashPreload.js"),
        },
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: "cjs",
                entryFileNames: "[name].cjs",
                inlineDynamicImports: false,
              },
            },
          },
        },
      },
    }),
  ],
});
