# MindSage Desktop App — Technical Debt Document

**Last reviewed:** 2026-07-15
**Scope:** Entire monorepo (Electron + React app, Express backend, iOS port)
**Purpose:** Catalog known technical debt to prioritize cleanup and remediation work.

Each item below is tagged with a **severity** (`🔴 Critical`, `🟠 High`, `🟡 Medium`, `🟢 Low`) and a rough **effort** estimate (`S` < 1d, `M` 1–3d, `L` > 3d).

---

## 1. Testing & Quality Gates

### 1.1 🔴 Critical · Effort: L — No automated tests for the desktop app
- `package.json` declares no test runner (no `vitest`, `jest`, `@testing-library/*`, `playwright`, `cypress`).
- No `test` / `lint` / `typecheck` / `format` npm scripts — only `dev`, `build`, `rebuild`, `postinstall`.
- No `*.test.{ts,tsx,js}` files anywhere in `src/`, `electron/`, or `src/server/`.
- Only tests present: an informal `test-color-db.js` console script in the root, `.rest` files in `src/server/requests/`, and `SchemaMigrationTests.swift` in the iOS SwiftPM package.
- **Estimated coverage: ~0%** for JS/TS desktop code.

**Remediation**
- Add `vitest` + `@testing-library/react` + `playwright` (or `electron-playwright`).
- Add npm scripts: `test`, `test:watch`, `test:e2e`, `lint`, `typecheck`.
- Bootstrap with smoke tests for critical flows: journal CRUD, auth, sync, AI enrichment worker.

### 1.2 🔴 Critical · Effort: M — No CI/CD pipeline
- No `.github/`, `.gitlab-ci.yml`, `azure-pipelines.yml`, or equivalent.
- `tsc` strict mode is configured in both `tsconfig.app.json` and `tsconfig.node.json`, but if no one runs it locally, type errors only surface at runtime.
- Same applies to ESLint — configured but not enforced in automation.

**Remediation**
- Add GitHub Actions workflow that runs `tsc --noEmit`, `eslint .`, and (once added) `vitest` on every PR and push.

### 1.3 🟠 High · Effort: S — Lint and TypeScript coverage gaps
- `eslint.config.js` only matches `**/*.{ts,tsx}` — **all JS in `electron/`, `src/server/`, and `src/utils/electronUtils.js` is not linted**.
- There is no `tsconfig` that includes `electron/**/*.js` or `src/server/**/*.js`. These directories bypass type-checking entirely.
- No Prettier or `.editorconfig` — formatting consistency is not enforced.

**Remediation**
- Extend ESLint globs to include `electron/**/*.{js,ts}` and `src/server/**/*.js`.
- Add `jsconfig.json` (or migrate JS→TS) for `electron/` and `src/server/` so editors and CI type-check them.
- Add `.prettierrc` + a `format` script.

---

## 2. Security

### 2.1 🔴 Critical · Effort: S — Hardcoded JWT secrets in source
`src/server/routes/auth.js` and `src/server/middleware/authenticate.js` both contain literal JWT signing secrets:

```js
// src/server/routes/auth.js:12
const offlineAccessTokenSecret = "be1e968105e3d8c510625e7ae117d3b376913c6359b5063bc5ff07f1cc43cfa3229405930cdeb7bcc9e9ebf3199c0b85b1a0c2396018eee4985f2d1a0abf6002";
const offlineRefreshTokenSecret = "835261b0476f6ab27b89e3f5584dab137ae30e8d73bc98b72b304373076e7c34c68cc2d92733b32bef0459582a389bc72f5f32f432f06cc87e90101bcbe47b9e";
```

These secrets are committed in git history. Anyone with repo access can forge auth tokens. Same value duplicated across two files.

**Remediation**
- Move all secrets to environment variables (`process.env.ACCESS_TOKEN_SECRET`, etc.) — `.env.example` already lists them.
- Rotate the exposed secrets.
- Run `git filter-repo` or BFG to scrub them from history, then force-update remote.
- Add a pre-commit hook (e.g. `gitleaks`) to prevent recurrence.

### 2.2 🟠 High · Effort: S — Inconsistent env-var usage
- `src/server/middleware/checkCronAuth.js` correctly reads `process.env.CRON_SECRET`, but the JWT signing/secrets path does not use env vars (see 2.1).
- No `src/**/*.{ts,tsx}` file references `process.env.*` — frontend must rely entirely on the Electron main / Vite `define`. Verify no build-time secrets leak into the renderer bundle.

---

## 3. Build & Repository Hygiene

### 3.1 🔴 Critical · Effort: M — Large build artifacts committed to the repo
- `release/` directory exists locally at **~1.1 GB** (170 files). Although `release/` is in `.gitignore` and shows 0 tracked files, it routinely appears in clones (see `.gitignore` ambiguity below) or must be cleaned manually.
- `dist/` (~5.5 MB) — contains committed screenshots and `splash.html`. `dist/` is in `.gitignore` but the policy is inconsistent: README references screenshots under `dist/` paths.
- `logs/qdrant-2026-05-05.log`, `logs/ollama-2026-05-05.log` exist on disk.
- `src/server/utils/db.pdf` — **683.8 KB binary PDF tracked in git source**. Should live in a docs host or a Wiki, not in `src/`.
- `node_modules/` (~1 GB, 683 top-level packages) is present locally; verify it is not committed.

**Remediation**
- Remove `db.pdf` from source control (`git rm --cached src/server/utils/db.pdf`) and link externally.
- Confirm `dist/` is fully untracked; move screenshot assets into `public/screenshots/` or `assets/`.
- Audit `.gitignore` for duplicate/conflicting entries (it currently lists `dist` and `dist-electron` twice — lines 11/13 and 29/31).

### 3.2 🟡 Medium · Effort: S — Duplicate / empty directories and placeholders
- `scripts/` — empty directory.
- `website/` — empty directory.
- `src/server/controller/` — empty directory (MVC scaffold abandoned, code uses `routes/` directly).
- `electron/services/chat.js` — **0 bytes** (empty placeholder).
- `src/server/README.md` — effectively empty (≤50 bytes).
- `electron/main.js` has a commented-out import: `// import { startServer } from "../src/server/app.js";` — Express backend not wired in production.

**Remediation**
- Remove empty dirs and the 0-byte file.
- Decide whether Express backend is in or out of the desktop build; either wire it up or delete the dead imports.

### 3.3 🟡 Medium · Effort: S — `package.json` `build.files` glob mismatches repo layout
The `electron-builder` `files` array references directories that do not exist or are misnamed:
- `"servers/**/*"` — directory is actually `src/server/`, not `servers/`.
- `"electron/workers/**/*"` — actual path is `electron/db/`, `electron/methods/`, `electron/services/` (no `workers/` dir).

This may silently omit files from packaged builds or include empty globs.

**Remediation**
- Reconcile `build.files` with the actual directory layout; smoke-test the produced installer.

---

## 4. Architecture & Code Structure

### 4.1 🟠 High · Effort: L — Over-sized page components
Several React pages/components have grown into multi-responsibility monoliths:

| KB | File |
|--:|---|
| 28.8 | `src/pages/journalForm.tsx` |
| 27.0 | `src/components/settings/ModelSettings.tsx` |
| 23.2 | `src/pages/journalList.tsx` |
| 20.6 | `src/pages/dashBoard.tsx` |
| 19.4 | `src/pages/journalDetails.tsx` |
| 18.5 | `src/pages/OllamaTutorial.tsx` |
| 17.3 | `src/pages/dailyChallenge.tsx` |
| 17.2 | `src/pages/auth/register.tsx` |
| 16.7 | `src/pages/qdrantViewer.tsx` |
| 16.5 | `src/components/GlobalSearch.tsx` |
| 15.0 | `src/pages/chat.tsx` |

Similarly on the Electron side: `electron/qdrantWorker.js` (27.7 KB), `electron/db/connection.js` (17.4 KB), `electron/methods/ollama.js` (15.1 KB).

**Remediation**
- Split each page into subcomponents (form sections, list rows, toolbar, sidebar) and extract business logic into hooks/services. Target ≤ ~10 KB per component.

### 4.2 🟠 High · Effort: M — Excessive use of `any`
61 occurrences of `any` across `src/**/*.{ts,tsx}` (subset: `ColorThemeContext`, `qdrantService`, `chatService`, `goalService`, `eventBusService`, `dashBoard`, `chat`, `journalDetails`, `register`, `login`, `ModelSettings`, `ProfileSettings`, `AIGenerationModal`, etc.). The `electron.d.ts` and `global.d.ts`-based IPC bridge itself is typed as `any`.

**Remediation**
- Define proper TypeScript interfaces for IPC channels (replacing the generic `channel: string, ...args: any[]` pattern) and for API DTOs.

### 4.3 🟡 Medium · Effort: M — Pervasive `console.log` left in production code
- **108** `console.log` calls across `electron/**/*.js`.
- **12** in `src/**/*.{ts,tsx}`.
- **2** in `src/server/`.
- No log levels, no logger library, no redaction of sensitive payloads.

**Remediation**
- Introduce a small logger (`winston`, `electron-log`, or a wrapper) with level + file rotation support. Replace `console.log` calls (particularly in `electron/methods/*` and `electron/qdrantWorker.js`).

### 4.4 🟡 Medium · Effort: S — Generic `catch (e: any)` blocks
~95 try/catch blocks in `electron/`, and many `catch (err: any)` in `src/` (`login.tsx`, `register.tsx`, `journalDetails.tsx`). Catch-all errors get swallowed or only displayed as a generic message.

**Remediation**
- Type caught values as `unknown`, narrow with `instanceof`, and propagate typed errors to a central error handler.

### 4.5 🟡 Medium · Effort: M — Mixed import-extension style
TypeScript imports use explicit `.ts/.tsx` extensions (e.g. `import App from "./App.tsx"`), enabled via `allowImportingTsExtensions: true`. This couples the source to Vite's bundler resolution and makes migration to other toolchains (or Node-native ESM) harder.

**Remediation**
- Drop extension-suffix imports in favor of extensionless ones; keep `allowImportingTsExtensions` off unless strictly required.

### 4.6 🟡 Medium · Effort: S — Mix of `.tsx` and `.js` for utilities
`src/utils/electronUtils.js` is plain JavaScript; everything else in `src/utils/` is TypeScript. Inconsistent and type-unsafe.

**Remediation**
- Convert `electronUtils.js` → `electronUtils.ts`.

---

## 5. Dependencies

### 5.1 🟠 High · Effort: S — Redundant / conflicting dependencies
| Have | Likely should keep | Remove |
|---|---|---|
| `qdrant-client@^0.0.1` **and** `@qdrant/js-client-rest@^1.15.1` | `@qdrant/js-client-rest` | `qdrant-client` (a 0.0.1 placeholder package) |
| `sqlite3@^5.1.7` **and** `better-sqlite3@^12.2.0` | `better-sqlite3` (sync API, used by electron) | `sqlite3` (server uses `pg`/Postgres, not sqlite) |
| `framer-motion@^12` **and** `motion@^12` **and** `gsap@^3` **and** `lottie-react@^2` | Pick one primary | Consolidate animation strategy |
| `react-hot-toast@^2` **and** a custom `ToastContext.tsx`/`ToastNotification.tsx` | Custom Context | `react-hot-toast` |
| `@reduxjs/toolkit` + `react-redux` **and** React Context (Auth/ColorTheme/Toast) | Context (only thing actually used in `App.tsx`) | Redux Toolkit unless introduced intentionally |
| `chart.js` **and** `recharts` | Pick one | Remove the other |
| `date-fns` **and** `dayjs` | Pick one | Remove the other |
| `@emotion/react` + `@emotion/styled` + `@mui/material@^7` **and** Tailwind v4 | Tailwind | Confirm whether MUI is actually used; if not, drop MUI + Emotion |

Each duplicate adds bundle size, security surface, and confusion about which to use.

**Remediation**
- Run `depcheck` to confirm actual usage, then trim the manifest.

### 5.2 🟡 Medium · Effort: S — `dependencies` vs `devDependencies` classification
Several build-time or dev-only tools sit under `dependencies`:
- `@tailwindcss/vite`, `@tailwindcss/line-clamp`, `autoprefixer`, `postcss`, `tailwindcss` — should be in `devDependencies`.
- `@types/*` packages (`@types/google.accounts`, `@types/zxcvbn`) — should be in `devDependencies`.

These inflate the packaged `node_modules` shipped inside the Electron build.

**Remediation**
- Move tooling/types to `devDependencies`; ensure `electron-builder` excludes `devDependencies` from the final release.

### 5.3 🟢 Low · Effort: S — `react-audio-visualize`, `dictionary-en`, `nspell` purpose unclear
Used inconsistently across the renderer; verify they are needed before keeping them.

---

## 6. Documentation

### 6.1 🟡 Medium · Effort: S — Outdated / misleading docs
- `README.md` (~316 lines) describes the desktop app's features and workflows but does not mention how to run tests, lint, or build the release (because those scripts don't exist yet).
- `src/server/README.md` is effectively empty.
- `electron/services/chat.js` is empty — referenced by anything?

### 6.2 🟢 Low · Effort: S — No CONTRIBUTING / developer onboarding
There is no `CONTRIBUTING.md`, no `AGENTS.md`, and no doc describing environment setup beyond `.env.example`. New contributors must reverse-engineer the run commands.

**Remediation**
- Once tests/lint/format scripts exist, add a `CONTRIBUTING.md` that documents setup, scripts, code style, and PR expectations.

---

## 7. iOS Port (Lower priority — separate codebase)

### 7.1 🟢 Low · Effort: M — iOS spike scaffolding tracked in repo
The `ios/` workspace (SwiftUI + SwiftPM) is real but small (~30 KB of Swift total) and currently has no AI model integration. The spike docs (`ML_STACK_SPIKE.md`, `SQLITE_VEC_SPIKE.md`, `TESTFLIGHT_CADENCE.md`) lay out a multi-week plan that has not been executed yet.

**Recommendation**
- Track separately. Once the desktop app's critical debt (Sections 1–5) is addressed, re-evaluate the iOS port's priority.

---

## 8. Quick-Win Priority List

| # | Severity | Effort | Action |
|---|---|---|---|
| 1 | 🔴 | S | Move hardcoded JWT secrets in `auth.js` / `authenticate.js` to env vars and rotate them |
| 2 | 🔴 | S | Add npm scripts `lint`, `typecheck`, `format` and a Prettier config |
| 3 | 🔴 | M | Add a CI workflow (`.github/workflows/ci.yml`) running `tsc --noEmit` + ESLint |
| 4 | 🔴 | M | Set up Vitest + a couple of smoke tests; add a `test` script |
| 5 | 🟠 | S | Extend ESLint globs and add a `jsconfig`/`tsconfig` for `electron/` and `src/server/` |
| 6 | 🟠 | S | Run `depcheck` and remove redundant deps (`qdrant-client`, `sqlite3`, one of framer-motion/motion, etc.) |
| 7 | 🟠 | S | Move build-time deps (`tailwindcss`, `postcss`, `@types/*`) to `devDependencies` |
| 8 | 🟡 | S | Remove `src/server/utils/db.pdf` from source control; remove empty dirs/files (`scripts/`, `website/`, `controller/`, `chat.js`) |
| 9 | 🟡 | S | Reconcile `package.json` `build.files` globs (`servers` vs `src/server`, `electron/workers` vs actual layout) |
| 10 | 🟡 | M | Introduce a logger and replace the 100+ `console.log` calls in `electron/` |
| 11 | 🟡 | L | Split the largest page components (`journalForm`, `journalList`, `dashBoard`, `chat`) into smaller subcomponents and hooks |

---

**Summary:** The app is well-architected at the feature level and shipped, but carries heavy debt in **testing/security/CI hygiene** (Sections 1–3) that should be addressed before further feature work. The remaining code-structure debt (Section 4) and dependency cleanup (Section 5) are typical maintenance tasks that can be tackled incrementally.
