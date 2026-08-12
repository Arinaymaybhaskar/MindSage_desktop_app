# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read this first

A detailed orientation already exists in [AGENTS.md](AGENTS.md) — read it before making changes. It covers critical gotchas (secrets, ESM conventions, service startup ordering, packaging), toolchain quirks, and per-directory layout in more depth than this file. This document is the fast summary.

## Commands

Only four npm scripts exist:

- `npm run dev` — Vite dev server; also boots Electron via `vite-plugin-electron` and sets `VITE_DEV_SERVER_URL`. This is the normal way to run the app.
- `npm run build` — `vite build && electron-builder` → installers in `release/`.
- `npm run rebuild` — `electron-rebuild -f -w better-sqlite3`; recompiles the native addon.
- `npm run postinstall` — runs `rebuild` automatically after `npm install`. Without it, `better-sqlite3` fails to load at runtime.

There are **no `test`, `lint`, `typecheck`, or `format` scripts, and no automated test framework.** To check work manually:

- Typecheck renderer (strict mode): `npx tsc -p tsconfig.app.json --noEmit`
- Lint: `npx eslint .` — but the config only matches `**/*.{ts,tsx}`, so **all `.js` under `electron/` and `src/server/` is neither linted nor type-checked.**

## Architecture

Electron + React + TypeScript desktop journaling app, **offline-first**: data lives in a local `better-sqlite3` DB, and Ollama (generation/embeddings), Qdrant (vector search), and Whisper.cpp (speech-to-text) all run locally.

**Three processes / layers:**

- **Renderer** (`src/`) — React 19 + Tailwind v4 + Vite. Uses **HashRouter** (`#/path`), Context for state (`AuthContext`, `ColorThemeContext`, `ToastContext`), not the declared-but-unused Redux. The renderer **never imports Node APIs directly** — every backend call goes through an `src/api/*Service.tsx` wrapper, which delegates to `window.electron.ipcRenderer.invoke("<channel>", ...args)`.
- **Main process** (`electron/`) — Node ESM (`"type": "module"`; reconstruct `__dirname` via `fileURLToPath(import.meta.url)`). `preload.js` exposes the `window.electron` IPC bridge. `ipcHandlers.js` routes each channel to a handler in `methods/*.js` (business logic), which read/write through `db/*.js` (SQLite access; `connection.js` holds all DDL). A background `Worker` thread (`qdrantWorker.js`) handles embeddings/summaries/sync.
- **Optional online-sync backend** (`src/server/`) — Express 5 + PostgreSQL + S3 + JWT. **Currently not started by Electron** (import commented out at [electron/main.js:8](electron/main.js#L8)).

**Request flow:** UI component → `src/api/xService.tsx` → IPC channel → `electron/ipcHandlers.js` → `electron/methods/x.js` → `electron/db/x.js` → SQLite.

**Background AI is event-driven.** Journal handlers emit events on the `eventBus` (`electron/eventBus.js`); `electron/events.js` forwards `journal:aiStarted` / `journal:aiCompleted` to the renderer via `webContents.send`, while the Qdrant worker performs the enrichment (title/tags/mood/summary generation, embeddings) asynchronously. Don't expect AI metadata to be ready synchronously after a journal create/update.

**Startup ordering matters** (see [electron/main.js:112](electron/main.js#L112)): splash → hidden main window → `initDatabase()` → Ollama embedding-model setup → `startQdrant()` (spawns the Qdrant binary, picks a free port into `process.env.QDRANT_HTTP_PORT`) → register IPC handlers → event bus → spawn worker → show window on `services-ready`. If you touch Qdrant/embedding init, verify the worker still receives `QDRANT_HTTP_PORT`.

## Conventions and gotchas

- **Imports use explicit `.ts`/`.tsx` extensions** (e.g. `import App from "./App.tsx"`), enabled via `allowImportingTsExtensions`. Match this.
- **Schema changes** go in `initDatabase()` in [electron/db/connection.js](electron/db/connection.js) as `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` blocks — there is **no migration framework**. The DB lives at `%APPDATA%/MindSage/mind-sage.db` (and OS equivalents).
- **New files under `electron/db|methods|services/`, plus `qdrantWorker.js`/`store.js`/`eventBus.js`, must be copied into `dist-electron/`** by the `viteStaticCopy` targets in [vite.config.ts](vite.config.ts). If a main/preload import isn't listed there, the packaged build silently breaks while dev mode keeps working.
- **Native binaries live in `resources/`** (Qdrant, Whisper.cpp + DLLs, FFmpeg) and ship via `electron-builder` `extraResources`. Path resolution differs between dev (`../resources/...`) and packaged (`process.resourcesPath`) — see [electron/methods/whisper.js](electron/methods/whisper.js).
- **Never commit secrets.** [AGENTS.md](AGENTS.md) and [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) flag existing hardcoded JWT secrets in `src/server/` that should be moved to the env vars in `.env.example`.

## Reference docs

- [AGENTS.md](AGENTS.md) — full gotcha list, toolchain quirks, packaging caveats, redundant-dependency notes.
- [COLOR_SYSTEM_README.md](COLOR_SYSTEM_README.md) — theming system, presets, CSS variables, `ColorThemeContext` API.
- [designPatterns.json](designPatterns.json) — catalog of UI patterns the codebase follows.
- [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) — known debts; consult before introducing new patterns so you don't repeat existing mistakes.
- [README.md](README.md) — feature/platform overview and workflow diagrams (`assets/diagrams/`).
