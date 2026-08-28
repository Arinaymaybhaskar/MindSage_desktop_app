# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read this first

[AGENTS.md](AGENTS.md) has the long-form orientation (per-directory layout, packaging caveats, toolchain quirks). **Its "Commands" section and its `ios/` and redundant-dependency notes are stale** — this file and [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) §0 are the current source of truth for tooling.

## Commands

```bash
npm run dev            # Vite dev server + Electron (vite-plugin-electron sets VITE_DEV_SERVER_URL). Normal way to run the app.
npm run build          # vite build && electron-builder → installers in release/
npm run release        # same, with --publish always (used by .github/workflows/release.yml on v* tags)
npm run rebuild        # electron-rebuild -f -w better-sqlite3
npm run postinstall    # runs rebuild automatically; without it better-sqlite3 fails to load at runtime
npm test               # vitest run
npm run test:watch     # vitest
npm run typecheck      # tsc -p tsconfig.app.json --noEmit  (renderer only)
npm run lint           # eslint .
npm run format         # prettier --write .    (format:check for CI-style verification)
npm run bench          # SQLite/media/size benchmark suite → docs/benchmarks/results/
npm run bench:ipc      # IPC-boundary benchmark; needs the running app
```

Benchmarks: `npm run bench -- --label after-<change>` then `npm run bench -- --compare baseline --label after-<change>`. [docs/benchmarks/BASELINE.md](docs/benchmarks/BASELINE.md) is **generated — never hand-edit it**; [FINDINGS.md](docs/benchmarks/FINDINGS.md) is the hand-written reading, and it **corrects PERFORMANCE.md in two places**. Trust the measurements over the audit prose.

**Running a subset of tests:**

```bash
npx vitest run src/utils/DateFormatter.test.ts   # one file
npx vitest run -t "formats a relative date"       # one test by name
```

**Typecheck, lint and format are all clean; keep them that way.** As of 2026-08-28 `npm run typecheck`, `npm run lint` and `npm run format:check` all report **zero** problems, and tests are green (5 files, 35 tests). This replaces a long-standing baseline of 131 typecheck errors and 106 lint problems, cleared wholesale in a single pass. **A non-zero typecheck or lint exit now means you broke something**, so treat it as a real failure rather than comparing counts against a tolerated baseline.

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) **blocks on all four**: typecheck, lint, `format:check` and `npm test`. The `continue-on-error: true` that made the first two report-only is gone, so a red `Typecheck & Lint` check now means what its name says. The pre-commit hook catches the same problems earlier (see **Other tooling** below), but it can be bypassed with `--no-verify`; CI cannot.

Three things that clean-up established, so treat them as conventions rather than incidental style:

- **The IPC bridge is typed, not `any`.** [src/electron.d.ts](src/electron.d.ts) now describes the whole `preload.js` surface, and `window.electron.ipcRenderer.invoke` is generic with an `unknown` default. Callers state the shape they expect, usually through the declared return type of the `src/api/*Service` wrapper that owns the channel. When you add a channel, type its wrapper against what the handler in `electron/methods/*` actually returns; when you add a member to the bridge, add it here too.
- **Context hooks live in `src/hooks/`, not beside the provider.** `useAuth`, `useToast` and `useColorThemeContext` each sit in their own file so the context modules export only components, which is what React Fast Refresh needs and what `react-refresh/only-export-components` enforces. Adding a hook back into a `src/context/*.tsx` file will fail lint.
- **Row shapes live in `src/types/`.** `User.ts`, `Goals.ts`, `Dashboard.ts`, `Ollama.ts`, `Qdrant.ts` and `sqlite.ts` mirror the DDL in [electron/db/connection.js](electron/db/connection.js). SQLite has no boolean, so 0/1 columns are typed `SqliteBoolean`; prefer extending these over redeclaring a near-copy in a component.

**Test conventions:** tests sit next to the module they cover (`electron/methods/jsonStream.test.js`, `src/api/journalService.test.ts`). [vitest.config.ts](vitest.config.ts) is deliberately separate from [vite.config.ts](vite.config.ts) so `vite-plugin-electron` doesn't boot during tests; it uses jsdom, `globals: true`, `src/test/setup.ts`, and `pool: "threads"` (the default `forks` pool hangs on newer Node). `electron/**` is in the include list, but only **pure modules** are testable there — anything importing `better-sqlite3` or `electron` won't load. `electron/methods/*.test.js` is explicitly excluded from the `viteStaticCopy` targets so tests don't ship in the package.

**Other tooling:** husky's [pre-commit hook](.husky/pre-commit) does two things. First `gitleaks protect --staged` (warns and passes through if gitleaks isn't installed — install it for real protection; allowlist false positives in `.gitleaks.toml`). Then `lint-staged`, which runs `prettier --write` on staged files and `eslint --fix --max-warnings=0` on staged `.ts`/`.tsx`, re-staging whatever it fixes. A commit that would introduce a lint error or a warning is refused. ESLint's flat config ([eslint.config.js](eslint.config.js)) matches only `**/*.{ts,tsx}`, which is why the `lint-staged` globs in `package.json` send `.js`/`.mjs` to Prettier alone; adding them to the ESLint glob makes it fail with "no matching configuration". **That means the whole main process is formatted but never linted** — `electron/**` and `scripts/**` are plain `.js`/`.mjs`, so `npm run lint` says nothing about them. Widening the config is a real (unclaimed) improvement, not a one-line glob change: those files would report fresh errors on their first run. Prettier (`.prettierrc`: LF, double quotes, semicolons, trailing commas, 80 columns) was applied across the repo in one sweep after years of drift, so `format:check` passes; `.prettierignore` excludes all `*.md`, which is why this file is exempt, and also skips `public/rive/` (a vendored webpack bundle) and `docs/benchmarks/results/` (regenerated by every `npm run bench`). [.gitattributes](.gitattributes) pins the working tree to LF on every platform, without which `format:check` would pass on the Linux runner and fail on a fresh Windows clone. `.npmrc` sets `engine-strict=true` against the Node 20–24 range in `package.json`; `.nvmrc` pins 20.

## Branching and workflow

`main` is protected on GitHub: no direct pushes (enforced for admins too), no force-pushes, no deletions, and merging requires the `Typecheck & Lint` check to pass, which now genuinely means typecheck, lint **and** `npm test` all passing (see above). All work happens on a branch off `main` and lands via PR.

**Branch naming**, matching the conventional-commit prefixes already used in commit messages:

- `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>` — normal work. Delete both the local and remote branch immediately after merge; don't let merged branches accumulate.
- `backup/<slug>` — a snapshot taken before a history rewrite or other destructive git operation (e.g. `backup/pre-coauthor-removal`, taken before stripping `Co-Authored-By` trailers from history). Kept indefinitely as cheap insurance.
- `archive/<slug>` — work deliberately abandoned but kept for reference (e.g. `archive/redesign-preview`, a scrapped redesign). Not meant to merge.

## Architecture

Electron + React + TypeScript desktop journaling app, **offline-first**: data lives in a local `better-sqlite3` DB, and Ollama (generation/embeddings), Qdrant (vector search), and Whisper.cpp (speech-to-text) all run locally.

**Three layers:**

- **Renderer** (`src/`) — React 19 + Tailwind v4 + Vite. **HashRouter** (`#/path`), React Context for state (`AuthContext`, `ColorThemeContext`, `ToastContext`). The renderer **never imports Node APIs directly** — every backend call goes through an `src/api/*Service.tsx` wrapper that delegates to `window.electron.ipcRenderer.invoke("<channel>", ...args)`. The bridge is fully typed in `src/electron.d.ts`; it used to be deliberately loose and incomplete, which is what most of the old renderer typecheck errors came from.
- **Main process** (`electron/`) — Node ESM (`"type": "module"`; reconstruct `__dirname` via `fileURLToPath(import.meta.url)`). `preload.js` exposes the bridge (emitted as `preload.mjs`); `ipcHandlers.js` routes each channel to a handler in `methods/*.js` (business logic), which reads/writes through `db/*.js` (SQLite; `connection.js` holds all DDL). `services/` holds the process managers — `qdrantManager.js`, `OllamaSetup.js`, `appSetup.js`, `autoUpdater.js`.
- **Optional online-sync backend** (`src/server/`) — Express 5 + PostgreSQL + S3 + JWT. **Unreachable**: the import is commented out at [electron/main.js:8](electron/main.js#L8). [docs/ONLINE_MODE_REMOVAL.md](docs/ONLINE_MODE_REMOVAL.md) judges it safe to delete. Don't build on it.

**Request flow:** UI component → `src/api/xService.tsx` → IPC channel → [electron/ipcHandlers.js](electron/ipcHandlers.js) → `electron/methods/x.js` → `electron/db/x.js` → SQLite.

**Background AI is event-driven.** Journal handlers emit on the `eventBus` ([electron/eventBus.js](electron/eventBus.js)); [electron/events.js](electron/events.js) forwards `journal:aiStarted` / `journal:aiCompleted` to the renderer via `webContents.send`, while the Qdrant worker (`qdrantWorker.js`, a `Worker` thread) does the enrichment — title/tags/mood/summary generation and embeddings. **AI metadata is never ready synchronously after a journal create/update.**

**Startup ordering matters** ([electron/main.js:147](electron/main.js#L147), inside `app.whenReady()`): splash → hidden main window → `initDatabase()` → Ollama embedding-model setup → `startQdrant()` (spawns the Qdrant binary, picks a free port into `process.env.QDRANT_HTTP_PORT`) → `registerIPCHandlers()` → event bus → spawn worker → show the window on `services-ready`. If you touch Qdrant or embedding init, verify the worker still receives `QDRANT_HTTP_PORT`.

## Conventions and gotchas

- **Imports use explicit `.ts`/`.tsx` extensions** (`import App from "./App.tsx"`), enabled via `allowImportingTsExtensions`. Match this.
- **Schema changes** go in `initDatabase()` in [electron/db/connection.js](electron/db/connection.js) as `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` blocks — there is **no migration framework, no `PRAGMA user_version`, and no pre-migration backup**. The DB is the user's only copy of their journal (`%APPDATA%/MindSage/mind-sage.db` and OS equivalents), so treat schema edits as high-risk.
- **New files under `electron/db|methods|services/`, plus `qdrantWorker.js`/`store.js`/`eventBus.js`, must be listed in the `viteStaticCopy` targets** in [vite.config.ts](vite.config.ts) — these are loaded at runtime by the worker rather than bundled. Miss one and the packaged build silently breaks while dev mode keeps working.
- **Native binaries live in `resources/`** (Qdrant, Whisper.cpp + DLLs, FFmpeg) and ship via `electron-builder` `extraResources`. Path resolution differs between dev (`../resources/...`) and packaged (`process.resourcesPath`) — copy the pattern in [electron/methods/whisper.js](electron/methods/whisper.js).
- **Env flags:** `MS_DISABLE_GPU=1` (Windows) disables GPU for machines with broken drivers ([main.js:124](electron/main.js#L124)); `MS_REMOTE_DEBUG=<port>` opens a loopback CDP endpoint ([main.js:137](electron/main.js#L137)) — anything that reaches it has full control of the renderer, so leave it off by default.
- **Tokens are signed but never verified.** The signing secret is generated per install by [electron/services/tokenSecret.js](electron/services/tokenSecret.js) and no longer ships in the bundle, but all eight modules under `electron/methods/` still call `jwt.decode`, so neither the signature nor `exp` is checked and any `{"id": N}` payload is accepted. Don't extend that pattern, and don't "fix" it by swapping in `jwt.verify`: on its own that logs every user out permanently, because the refresh path points at a server that never starts. See [docs/AUTH_REVIEW.md §2.1](docs/AUTH_REVIEW.md) and MASTER_TODO items 16b and 17. The old constant is still in git history.

## Demo data and screenshots

```bash
npm run seed:demo -- --reset   # populate a demo user (spawns Electron with ELECTRON_RUN_AS_NODE=1 — better-sqlite3 is built against Electron's ABI)
npm run dev:capture            # terminal 1: dev app with CDP on 127.0.0.1:9222
npm run capture                # terminal 2: marketing screenshots → public/screenshots/v2/ at 2x
npm run gen:images             # regenerate demo imagery
```

Capture drives the real Electron window over CDP — pointing a browser at the Vite URL gives you no `window.electron`, so every IPC call rejects and the app renders empty.

## Reference docs

- **[docs/](docs/README.md) — all audits, plans, and debt tracking**, indexed in [docs/README.md](docs/README.md).
  - [docs/MASTER_TODO.md](docs/MASTER_TODO.md) — **the single ordered work queue**, merged from every other doc. Its §0 lists items that older docs still show as open but are actually done. Start here.
  - [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) — the reasoning behind the shipping blockers. **§0 is a verified-state table; trust it over any older doc.**
  - [docs/TECHNICAL_DEBT.md](docs/TECHNICAL_DEBT.md), [docs/TODO.md](docs/TODO.md) — known debts; consult before introducing a new pattern. Both partly stale.
  - Audits: [AUTH_REVIEW.md](docs/AUTH_REVIEW.md), [CODEBASE_STRUCTURE_AUDIT.md](docs/CODEBASE_STRUCTURE_AUDIT.md), [NETWORK_AUDIT.md](docs/NETWORK_AUDIT.md), [ONLINE_MODE_REMOVAL.md](docs/ONLINE_MODE_REMOVAL.md), [PERFORMANCE.md](docs/PERFORMANCE.md).
  - Plans: [OFFLINE_AUTH_DESIGN.md](docs/OFFLINE_AUTH_DESIGN.md), [MAC_RELEASE_PLAN.md](docs/MAC_RELEASE_PLAN.md), [BUNDLE_SIZE_PLAN.md](docs/BUNDLE_SIZE_PLAN.md).
  - [docs/COLOR_SYSTEM_README.md](docs/COLOR_SYSTEM_README.md) — theming, presets, CSS variables, `ColorThemeContext` API.
- [designPatterns.json](designPatterns.json) — catalog of UI patterns the codebase follows.
- [README.md](README.md) — feature/platform overview and workflow diagrams (`assets/diagrams/`).
