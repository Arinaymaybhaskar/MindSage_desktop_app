import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import pkg from "./package.json";
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
