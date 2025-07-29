import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'

// [https://vitejs.dev/config/](https://vitejs.dev/config/)
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        // The entry file for the main process.
        entry: 'electron/main.ts',
      },
      preload: {
        // The entry file for the preload script.
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      // Optional: Use this if you want to use Vite's renderer process support
      renderer: {},
    }),
  ],
})