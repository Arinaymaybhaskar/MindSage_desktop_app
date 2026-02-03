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
                {
                  src: "electron/qdrantWorker.js",
                  dest: ".", // copy into dist-electron root
                },
                { src: "electron/db/*", dest: "db" },
                { src: "electron/methods/*", dest: "methods" },
                { src: "electron/store.js", dest: "." },
                { src: "electron/services/*", dest: "services" },
                { src: "electron/eventBus.js", dest: "." },
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
