# AGENTS.md

Quick orientation for any agent (or human) working in this repo. Read this before making changes.

[CLAUDE.md](CLAUDE.md) is the authority on commands, conventions and current state. This file is the per-directory map. Where the two disagree, CLAUDE.md wins.

## What this repo is

Electron + React + TypeScript desktop journaling app ("MindSage"). Offline-first: data lives in a local `better-sqlite3` database, and Ollama (generation and embeddings), Qdrant (vector search) and Whisper.cpp (speech to text) all run locally on the user's machine. Nothing is sent anywhere.

There is no server component and no mobile port. An Express/Postgres online-sync backend used to live under `src/server/` and was deleted once the last four renderer call sites reaching it were routed through IPC; see `docs/ONLINE_MODE_REMOVAL.md` for the reasoning. An iOS port under `ios/` is likewise gone. Older docs that mention either are describing a repo state that no longer exists.

## Commands

See the Commands section of [CLAUDE.md](CLAUDE.md) for the full list and the benchmark workflow. The short version:

- `npm run dev` starts Vite plus Electron and is the normal way to run the app.
- `npm run build` produces installers in `release/`.
- `npm test`, `npm run typecheck`, `npm run lint` and `npm run format:check` all exist and all pass. CI blocks on every one of them.
- `npm run postinstall` runs `electron-rebuild` for `better-sqlite3`. Do not skip it, or the native addon fails to load at runtime.

## Critical gotchas

- **Renderer imports omit the file extension.** `allowImportingTsExtensions` is on so both forms resolve, but the overwhelming majority of imports under `src/` carry no extension. Match that.
- **`electron/` JS is Node ESM** (`"type": "module"`). Reconstruct `__dirname` with `fileURLToPath(import.meta.url)` rather than expecting the global, and give every relative import an explicit `.js`. A directory import such as `"../db"` needs to be written `"../db/index.js"`; Node will not resolve it otherwise, and these files are copied verbatim into the package as well as bundled.
- **`window.electron` is the IPC bridge**, exposed by `electron/preload.js` and typed in full in `src/electron.d.ts`. It is no longer loose or `any`. The renderer never imports Node APIs directly: every backend call goes through an `src/api/*Service` wrapper that invokes a channel. Channels are named `domain:action` with a kebab-case action.
- **Service startup ordering matters.** Inside `app.whenReady()` the main process shows a splash, creates the hidden main window, runs `initDatabase()`, sets up the Ollama embedding model, calls `startQdrant()` (which spawns the Qdrant binary, picks a free port and sets `process.env.QDRANT_HTTP_PORT`), registers IPC handlers, wires the event bus, and spawns the `qdrantWorker.js` Worker. The window is shown only on `services-ready`. If you touch Qdrant or embedding init, verify the worker still receives `QDRANT_HTTP_PORT`.
- **Background AI is event-driven and never synchronous.** Journal handlers emit on the event bus and the Qdrant worker does the title, tag, mood, summary and embedding work. AI metadata is not ready when a create or update call returns.
- **The database is the user's only copy of their journal.** It is written to `%APPDATA%/MindSage/mind-sage.db` on Windows and the OS equivalents elsewhere. Schema changes go in `initDatabase()` in `electron/db/connection.js` as `CREATE TABLE IF NOT EXISTS` or `ALTER TABLE` blocks. There is no migration framework, no `PRAGMA user_version` and no pre-migration backup, so treat schema edits as high risk.
- **Native binaries live in `resources/`** and ship through `electron-builder` `extraResources`, which is declared per platform so a Windows installer does not carry the macOS Qdrant build. Path resolution differs between dev and packaged; copy the pattern in `electron/methods/whisper.js`.
- `MS_DISABLE_GPU=1` (Windows) disables GPU for machines with broken drivers. `MS_REMOTE_DEBUG=<port>` opens a loopback debugging endpoint that grants full control of the renderer, so leave it off.
- **Tokens are signed but never verified.** Every module under `electron/methods/` calls `jwt.decode`, so neither the signature nor `exp` is checked. Do not extend the pattern, and do not swap in `jwt.verify` on its own: that logs every user out permanently, because the refresh path pointed at a server that no longer exists. See `docs/AUTH_REVIEW.md` section 2.1.
- Routes use **HashRouter**, not BrowserRouter, so deep links are `#/path` (for example `#/quick-capture` for the Quick Capture window).

## Package layout

- `src/` — React and Tailwind frontend. Entry `src/main.tsx` into `App.tsx`. Pages in `src/pages/`, components in `src/components/` (with `chat/`, `goals/`, `settings/`, `ui/`, `Skeletons/` subfolders), IPC wrappers in `src/api/`, React contexts in `src/context/` with their hooks in `src/hooks/`, shared row and domain types in `src/types/`, prompt templates in `src/utils/prompts/`.
- `electron/` — main process. `main.js` bootstraps, `preload.js` exposes the bridge (emitted as `preload.mjs`), `ipcHandlers.js` routes each channel to a handler in `methods/*.js`, which reads and writes through `db/*.js`. `connection.js` holds all the DDL. `services/` holds the process managers: `qdrantManager.js`, `OllamaSetup.js`, `appSetup.js`, `autoUpdater.js`, `tokenSecret.js`. `qdrantWorker.js` is the background AI worker and runs on a `Worker` thread.
- `scripts/` — benchmark suite under `bench/`, demo-data seeding, and the Playwright-driven screenshot capture. Not a placeholder; several npm scripts point here.
- `assets/` — app icons and the workflow diagrams that `README.md` links. `public/` — static assets copied by Vite. `resources/` — native binaries, see the gotchas above.
- `docs/` — every audit, plan and debt list, indexed by `docs/README.md`.

## Toolchain quirks

- **Tailwind v4** is configured through the `@tailwindcss/vite` plugin rather than `postcss.config.js`, but `tailwind.config.ts` still exists and is used. Dark mode uses the `class` strategy.
- **`viteStaticCopy` copies only what `qdrantWorker.js` needs**: the worker itself, `eventBus.js`, and `db/connection.js`. Everything else under `electron/` is bundled into `main.js`, so adding a file there needs no config change. Only a new import in the worker does.
- The main process build outputs **ESM**, and everything in `pkg.dependencies` is externalized rather than bundled.
- **ESLint only matches `**/*.{ts,tsx}`**, so `electron/` and `scripts/`, which are plain `.js` and `.mjs`, are formatted by Prettier but never linted. Widening the config is a real unclaimed improvement rather than a one-line glob change, because those files would report fresh errors on their first run.
- A few genuinely redundant dependencies remain: `react-hot-toast` alongside the custom `ToastContext`, `chart.js` alongside `recharts`, and `date-fns` alongside `dayjs`. Verify with `npx depcheck` before removing anything.

## Reference docs in this repo

- `README.md` — feature and platform overview plus the workflow diagrams under `assets/diagrams/`.
- `designPatterns.json` — catalog of UI patterns the codebase follows.
- `docs/` — all audits, plans and debt tracking, indexed in `docs/README.md`.
  - `docs/MASTER_TODO.md` — the single ordered work queue. Start here.
  - `docs/PRODUCTION_READINESS.md` — the reasoning behind the shipping blockers. Its section 0 is a verified-state table and supersedes older claims elsewhere.
  - `docs/TECHNICAL_DEBT.md`, `docs/TODO.md` — known debts. Consult before introducing a new pattern. Both are partly stale.
  - `docs/AUTH_REVIEW.md`, `docs/CODEBASE_STRUCTURE_AUDIT.md`, `docs/NETWORK_AUDIT.md`, `docs/ONLINE_MODE_REMOVAL.md`, `docs/PERFORMANCE.md` — audits.
  - `docs/OFFLINE_AUTH_DESIGN.md`, `docs/MAC_RELEASE_PLAN.md`, `docs/BUNDLE_SIZE_PLAN.md` — forward-looking plans.
  - `docs/COLOR_SYSTEM_README.md` — theming, presets, CSS variables, and the `ColorThemeContext` API.
  - `docs/benchmarks/` — `BASELINE.md` is generated and must never be hand-edited; `FINDINGS.md` is the hand-written reading and corrects `PERFORMANCE.md` in two places.
