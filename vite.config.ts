import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import pkg from "./package.json";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
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
              ],
            }),
          ],
        },
      },

      preload: {
        input: path.join(__dirname, "electron/preload.js"),
      },
    }),
  ],
});
