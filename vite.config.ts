import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'
import pkg from './package.json' // Import your package.json

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        // The entry file for the main process.
        entry: 'electron/main.js',

        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              // Dynamically mark all production dependencies as external
              external: Object.keys(pkg.dependencies || {}),
              output: {
                // Tell Rollup to output an ES Module
                format: 'esm',
              },
            },
          },
        },
      },
      preload: {
        // The entry file for the preload script.
        input: path.join(__dirname, 'electron/preload.js'),
      },
    }),
  ],
})
