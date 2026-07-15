# AGENTS.md

Quick orientation for any agent (or human) working in this repo. Read this before making changes.

## What this repo is

Electron + React + TypeScript desktop journaling app ("MindSage"). Offline-first: stores data in a local `better-sqlite3` DB, runs Ollama + Qdrant + Whisper.cpp locally for AI/embeddings/STT. An Express/Postgres backend lives under `src/server/` for the optional online-sync mode (currently commented out at `electron/main.js:8` — not wired into the packaged app). An in-progress iOS port sits under `ios/` (Swift/SwiftUI/GRDB); treat it as a separate codebase.

## Commands

Only 4 npm scripts exist (`package.json`):

- `npm run dev` — start Vite dev server (also boots Electron via `vite-plugin-electron`; sets `VITE_DEV_SERVER_URL`).
- `npm run build` — `vite build && electron-builder` → output to `release/`.
- `npm run rebuild` — `electron-rebuild -f -w better-sqlite3` (recompiles the native node addon).
- `npm run postinstall` — runs `rebuild` automatically after every `npm install`. **Do not skip this** — without it, `better-sqlite3` will fail to load at runtime.

There are **no `test`, `lint`, `typecheck`, or `format` scripts**. To typecheck manually (strict mode is on):

- `npx tsc -p tsconfig.app.json --noEmit` (renderer/`src`)
- `npx tsc -p tsconfig.node.json --noEmit` (`vite.config.ts` only)

To lint: `npx eslint .` — but note the ESLint config only matches `**/*.{ts,tsx}`. **All `.js` under `electron/` and `src/server/` is neither linted nor type-checked.** There is no Prettier config.

There are **no automated tests** in this repo (no Vitest/Jest). The only "tests" are `test-color-db.js` (root, run manually with `node`), `src/server/requests/*.rest` (VS Code REST Client), and Swift `SchemaMigrationTests.swift` inside `ios/MindSageCore/`.

## Critical gotchas

- **Never commit secrets to source.** `src/server/routes/auth.js:12` and `src/server/middleware/authenticate.js:8` currently contain hardcoded JWT signing secrets (offlineAccessTokenSecret, offlineRefreshTokenSecret) duplicated across both files. `.env.example` already lists the env-var equivalents (`ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`) — wire those up instead. `CRON_SECRET` and Google client credentials are correctly read from env vars elsewhere.
- **Imports use explicit `.ts`/`.tsx` extensions** (e.g. `import App from "./App.tsx"` in `src/main.tsx:4`). This is enabled via `allowImportingTsExtensions: true` in both `tsconfig.app.json` and `tsconfig.node.json`. Match the convention when adding imports.
- **`electron/` JS uses Node ESM** (`"type": "module"` in `package.json`). Files reconstruct `__dirname` with `fileURLToPath(import.meta.url)` rather than using it as a global — copy that pattern in any new `electron/*.js`.
- **`window.electron` is the IPC bridge** exposed via `electron/preload.js`. Services under `src/api/*.tsx` all begin with `if (!window.electron?.ipcRenderer) { ... }` and delegate to `window.electron.ipcRenderer.invoke("<channel>", ...args)`. The renderer never imports Node APIs directly — always go through an `src/api/*Service.tsx` wrapper. The `window.electron` type lives in `src/electron.d.ts` and is intentionally loose (`any`).
- **Service startup ordering matters.** On `app.whenReady()` (`electron/main.js:112`), the main process: (1) shows splash, (2) creates hidden main window, (3) `localDB.initDatabase()` (creates all ~24 tables — see `electron/db/connection.js`), (4) `OllamaEmbeddingModelSetup()` (pulls `nomic-embed-text` if absent), (5) `startQdrant()` (spawns the Qdrant binary from `resources/<platform>/`, picks a free HTTP port and sets `process.env.QDRANT_HTTP_PORT` — default 6333), (6) `registerIPCHandlers(runtime)`, (7) `setupEventBusListeners()`, (8) spawns a `Worker` running `electron/qdrantWorker.js` (background embeddings/summaries/sync) assigned to `global.qdrantWorker`. Only after `services-ready` does the main window show. If you change Qdrant/embedding init, verify the worker still receives `QDRANT_HTTP_PORT`.
- **Native/Electron binaries live in `resources/`** (Qdrant, whisper.cpp `ggml-tiny.en.bin` + DLLs/exes, FFmpeg via `ffmpeg-static`). These are packaged via `electron-builder`'s `extraResources` (`package.json:build.extraResources`, copies all of `resources/` next to the executable). `electron/methods/whisper.js` resolves paths differently in dev (`../resources/whisper-bin-x64`) vs packaged (`process.resourcesPath`) — match this pattern when adding native-binary integrations.
- `electron/db/connection.js` writes the SQLite DB to `%APPDATA%\MindSage\mind-sage.db` (Windows), `~/Library/Preferences/MindSage/mind-sage.db` (macOS), `~/.local/share/MindSage/mind-sage.db` (Linux). Schema changes go in `initDatabase()` as `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` blocks — there is **no migration framework**.
- `MS_DISABLE_GPU=1` env var (Windows only) disables GPU in Electron — relevant for bug reports about blank windows on machines with broken GPU drivers (`electron/main.js:107`).
- Routes in the renderer use **HashRouter**, not BrowserRouter (`src/App.tsx:6`). Deep links use `#/path` (e.g. `#/quick-capture` for the QuickCapture window in `electron/main.js:48-50`).

## Package layout

- `src/` — React/Tailwind frontend (Vite app). Entry: `src/main.tsx` → `App.tsx`. Pages in `src/pages/`, components in `src/components/` (chat/, goals/, settings/, ui/, Skeletons/), API wrappers in `src/api/*Service.tsx`, React contexts (`AuthContext`, `ColorThemeContext`, `ToastContext`) in `src/context/`, hooks in `src/hooks/`, AI prompt templates in `src/utils/prompts/`.
- `electron/` — main process. `main.js` (bootstrap), `preload.js` (IPC bridge), `ipcHandlers.js` (channel→handler routing), `methods/*.js` (business logic for journal/goal/chat/ollama/whisper/qdrant/media/...), `db/*.js` (SQLite access layer, `connection.js` holds all DDL), `services/qdrantManager.js` (spawns Qdrant) and `services/OllamaSetup.js` (pulls models), `qdrantWorker.js` (background AI worker running on a `Worker` thread).
- `src/server/` — Express 5 + PostgreSQL (RDS) + S3 + JWT. Used only for online sync mode; routes under `src/server/routes/` (auth, journal, user, challenge, journal-analysis, notifications, `ai/`). Currently **not started by Electron** (import commented out in `electron/main.js:8`). The `controller/` subdir is empty (abandoned MVC scaffold). `src/server/utils/db.pdf` is a 684 KB binary spec tracked in git — do not duplicate this pattern.
- `ios/` — separate Swift/SwiftUI port. XcodeGen (`project.yml`), SwiftPM package `MindSageCore` with GRDB. Schema port map and spike docs in `ios/docs/`. Only `MindSageCore` has XCTest coverage (`SchemaMigrationTests.swift`).
- `assets/` — app icons + workflow diagrams referenced by `README.md`. `public/` — static frontend assets (splash.html, emojis, screenshots) copied by Vite. `resources/` — native binaries (see gotchas).
- Empty/placeholder dirs that you should not assume have content: `scripts/`, `website/`, `src/server/controller/`, `electron/services/chat.js` (0 bytes).

## Toolchain quirks

- **Tailwind v4** configured via the `@tailwindcss/vite` plugin in `vite.config.ts`, not via `postcss.config.js`. Despite that, a `tailwind.config.ts` still exists and is used. Dark mode uses `class` strategy. Custom font: `fraunces` (loaded in `index.html`).
- Both `@vitejs/plugin-react` and any Tailwind/Vite plugin run before `vite-plugin-electron`, which copies the following into `dist-electron/` via `vite-plugin-static-copy` (see `vite.config.ts:25-37`): `electron/qdrantWorker.js`, `electron/db/*`, `electron/methods/*`, `electron/store.js`, `electron/services/*`, `electron/eventBus.js`. **If you add a new file in any of these dirs that the main/preload imports, verify it lands in `dist-electron/`** — absent paths silently break the packaged build while dev mode keeps working.
- `electron` outputs **ESM** (`format: "esm"` in `vite.config.ts:21`). All `pkg.dependencies` are externalized (not bundled). The preload script is emitted as `preload.mjs` (referenced in `electron/main.js:42` and `windowManager.js:21`).
- `electron-builder` `build.files` glob in `package.json` references `servers/**/*` and `electron/workers/**/*` — **neither directory exists** in the current layout (actual paths are `src/server/` and `electron/db|methods|services/`). Be aware when changing packaging.
- Percentage of redundant deps in `package.json`: `qdrant-client@^0.0.1` and `@qdrant/js-client-rest` (both used — the first is a stale placeholder, the codebase uses the latter), `sqlite3` and `better-sqlite3` (only `better-sqlite3` is imported), `react-hot-toast` plus a custom `ToastContext`, `framer-motion` plus `motion` (same vendor, duplicate), `chart.js` plus `recharts`, `date-fns` plus `dayjs`. Redux Toolkit and react-redux are declared but `App.tsx` only uses Context. Verify with `npx depcheck` before removing anything.

## Reference docs in this repo

- `README.md` — feature/platform overview + workflow diagrams under `assets/diagrams/`.
- `COLOR_SYSTEM_README.md` — theming system, presets, CSS variables, `ColorThemeContext` API.
- `designPatterns.json` — catalog of UI patterns the codebase follows.
- `TECHNICAL_DEBT.md` — catalog of known debts/remediation priorities. **Consult this before introducing new patterns** (e.g. hardcoded secrets, missing CI) — don't repeat existing mistakes.
- `ios/docs/SCHEMA_PORT.md` — maps the desktop SQLite schema (`electron/db/connection.js`) onto the iOS GRDB schema. If you change the desktop schema, update both this doc and the iOS migration (`ios/MindSageCore/Sources/MindSageCore/Database/Migrations/SQL/`).
- `ios/docs/ML_STACK_SPIKE.md`, `SQLITE_VEC_SPIKE.md`, `TESTFLIGHT_CADENCE.md` — iOS-specific planning; ignore for desktop work.
