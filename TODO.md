# MindSage — Technical Debt TODO

**Purpose:** Actionable, checkable task list for paying down technical debt. Derived from [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) (the detailed catalog) and re-verified against the codebase on 2026-08-11.

**Legend:** severity `🔴 Critical` `🟠 High` `🟡 Medium` `🟢 Low` · effort `S` < 1d · `M` 1–3d · `L` > 3d

---

## 🩹 Branch `feat/ai-metadata-status` — fix before merge

Review findings from the AI metadata/summary status + retry feature (pushed 2026-08-11). Fix these before this branch merges to `main`.

- [x] 🔴 S — **Cancel button causes data loss.** `handleCancelMetadata` / `handleCancelSummary` in [journalDetails.tsx](src/pages/journalDetails.tsx) call `journal:update` with only `{ ai_metadata_status, ai_metadata_error }`. [updateJournalEntry](electron/db/journal.js#L267) then writes back the missing `title` (→null), `content` (→''), `mood_score` (→null), deletes all tags, and resets `created_at` to now — **wiping the entry.** It also doesn't persist the status column at all. Route AI-status changes through a dedicated handler that only updates the status/error columns, not the generic journal update. *Fixed: new `updateAIStatus` DB helper + `handleUpdateAIStatus` on the `journal:update-ai-status` channel; cancel handlers now use it.*
- [x] 🔴 S — **Live status events never reach the renderer.** The forwarder in [ipcHandlers.js:200](electron/ipcHandlers.js#L200) guards on `runtime.mainWindow`, but `runtime` (from `startQdrant()`) is `{ httpPort, grpcPort, baseUrl, dataDir }` — no `mainWindow`, so the guard is always false and `ai-status-event` is never sent. The pending→completed/failed UI silently never updates. Use `BrowserWindow.getAllWindows()[0]` (the pattern [events.js:6](electron/events.js#L6) uses) or pass the real window into `registerIPCHandlers`. *Fixed: forwarder now resolves the live window via `BrowserWindow.getAllWindows()[0]`.*
- [x] 🟡 S — **`removeAllListeners` clobbers other listeners.** Both [useAIStatus.ts:68](src/hooks/useAIStatus.ts#L68) and the inline listener in `journalDetails.tsx` clean up with `removeAllListeners("ai-status-event")`, so one component unmounting kills every other subscription on that channel. Remove only the specific handler. *Fixed: preload `on` now returns an unsubscribe that removes only its own listener; both call sites use it.*
- [x] 🟡 S — **Dead `result.skipped` branch.** The summary retry UI checks `result.skipped`, but neither `journalService.retryAIMetadata` nor `handleRetryAIMetadata` ever returns it. Either return `skipped` from the handler for short entries or drop the branch. *Fixed: dropped the branch (retry intentionally regenerates even short entries) and removed `skipped` from the service return type.*
- [x] 🟢 S — **Unused params** `mode` / `token` in the new `retryAIMetadata` service method (TS6133 warnings). *Fixed: dropped the unused `mode` param; `journalDetails.tsx` now calls the service wrapper instead of `ipcRenderer.invoke` directly.*

---

## 🔴 Critical — do first

- [~] 🔴 S — **Remove hardcoded JWT secrets.** ~~`offlineAccessTokenSecret` / `offlineRefreshTokenSecret` are still literals in [src/server/routes/auth.js:12](src/server/routes/auth.js#L12) and [src/server/middleware/authenticate.js:8](src/server/middleware/authenticate.js#L8) (same value, duplicated). Move to `process.env.ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET` (already in `.env.example`)~~ *(done — read lazily from env, fail loud if unset).* **Still to do by a maintainer:** rotate the exposed values and scrub git history (BFG / `git filter-repo` + force-push) — not done automatically because it rewrites shared history.
- [x] 🔴 S — **Add a secret-scanning pre-commit hook** (e.g. `gitleaks`) so secrets can't be re-committed. *Done: husky `.husky/pre-commit` runs `gitleaks protect --staged` (warns-and-continues if the binary isn't installed) + `.gitleaks.toml`. **Devs must `npm install` (husky prepare) and install the gitleaks binary for real protection.***
- [x] 🔴 S — **Add quality-gate npm scripts:** `lint` (`eslint .`), `typecheck` (`tsc -p tsconfig.app.json --noEmit`), `format` (Prettier), and a `.prettierrc`. *Done: added `lint`/`typecheck`/`format`/`format:check` scripts, prettier devDependency, `.prettierrc` + `.prettierignore`. Repo not yet reformatted (separate change). Note: `typecheck` and `lint` currently surface pre-existing errors.*
- [x] 🔴 M — **Add a CI workflow** (`.github/workflows/ci.yml`) running `tsc --noEmit` + `eslint .` (+ tests once they exist) on every PR/push. There is currently no CI at all. *Done: workflow runs typecheck + lint (report-only until pre-existing errors are cleared) + `npm test` (blocking) on push to main and all PRs.*
- [~] 🔴 L — **Introduce a test runner** (Vitest + `@testing-library/react`, plus Playwright/electron-playwright for e2e). Bootstrap smoke tests for the critical flows: journal CRUD, auth, sync, and the AI enrichment worker. Coverage today is ~0% for JS/TS. *Done: Vitest + Testing Library set up with smoke tests for pure utils and the journalService IPC layer, wired into CI. **Still to do:** deeper coverage of journal CRUD / AI worker (needs main-process + better-sqlite3 harness) and Playwright e2e.*

## 🟠 High

- [ ] 🟠 S — **Close the lint/typecheck blind spot.** ESLint only matches `**/*.{ts,tsx}`, so all `.js` in `electron/` and `src/server/` (and `src/utils/electronUtils.js`) is unchecked. Extend the ESLint globs and add a `jsconfig.json`/`tsconfig` covering those dirs (or migrate them to TS).
- [~] 🟠 S — **Trim redundant dependencies** (run `depcheck` first): ~~`qdrant-client` (keep `@qdrant/js-client-rest`), `sqlite3` (keep `better-sqlite3`), one of `framer-motion`/`motion`~~ *(removed; `motion` deduped into `framer-motion`)*, `chart.js` vs `recharts`, `date-fns` vs `dayjs`, `react-hot-toast` *(still imported in 3 files — migrate to `ToastContext` first)*, ~~and Redux Toolkit/react-redux (only Context is used). Confirm whether MUI + Emotion are used~~ *(removed — MUI/Emotion/Redux all unused; also dropped @heroicons/react, langchain, d3-array, dictionary-en, nspell, node-key-sender, react-audio-visualize, react-date-picker, @tailwindcss/line-clamp)*. **Remaining:** `chart.js` vs `recharts` and `date-fns` vs `dayjs` both still used — need a migration to drop one of each.
- [~] 🟠 S — **Fix `dependencies` vs `devDependencies` classification.** ~~Move `@tailwindcss/vite`, `@tailwindcss/line-clamp`, and google `@types/*` into `devDependencies`~~ *(done — `@tailwindcss/vite` + `@types/google.accounts` moved to devDeps; `@tailwindcss/line-clamp` removed entirely; `tailwindcss`/`autoprefixer`/`postcss` were already in devDeps).*
- [ ] 🟠 M — **Reduce `any` usage** (~59 occurrences across `src/**`). Start with the IPC bridge: give `window.electron`/`electron.d.ts` real channel types instead of `channel: string, ...args: any[]`, and add DTOs for API service wrappers.
- [ ] 🟠 L — **Split oversized page/components.** Break up the multi-responsibility monoliths into subcomponents + hooks: `journalForm.tsx` (~29 KB), `ModelSettings.tsx`, `journalList.tsx`, `dashBoard.tsx`, `journalDetails.tsx`, plus `electron/qdrantWorker.js` (~28 KB) and `electron/db/connection.js`.

## 🟡 Medium

- [ ] 🟡 S — **Remove `src/server/utils/db.pdf` from source control** (`git rm --cached`) — it's a ~684 KB binary tracked in git. Link it externally / host in a wiki instead.
- [ ] 🟡 S — **Reconcile `package.json` `build.files` globs.** `"servers/**/*"` and `"electron/workers/**/*"` (lines 33 & 36) reference paths that don't exist — actual dirs are `src/server/` and `electron/{db,methods,services}/`. Fix and smoke-test the installer.
- [ ] 🟡 S — **Remove the 0-byte placeholder** `electron/services/chat.js` (confirm nothing imports it first).
- [ ] 🟡 S — **Audit `.gitignore` for duplicate entries** (`dist` and `dist-electron` are listed twice) and confirm `dist/` is fully untracked.
- [ ] 🟡 M — **Introduce a logger** (`electron-log` / `winston`) with levels + file rotation, and replace the loose `console.log` calls (17 files in `electron/`, plus renderer/server). Redact sensitive payloads.
- [ ] 🟡 S — **Tighten catch blocks.** Type caught values as `unknown` and narrow with `instanceof` instead of `catch (e: any)` swallowing errors; route to a central error handler.
- [ ] 🟡 S — **Convert `src/utils/electronUtils.js` → `.ts`** for consistency and type safety (it's the only JS file in an otherwise-TS `src/utils/`).
- [ ] 🟡 M — **Decide the mixed import-extension policy.** Explicit `.ts`/`.tsx` import suffixes (via `allowImportingTsExtensions`) couple source to Vite's resolver. Either keep intentionally and document it, or migrate to extensionless imports. *(Note: [AGENTS.md](AGENTS.md) currently treats explicit extensions as the required convention — align the two docs whichever way you choose.)*
- [ ] 🟡 S — **Decide the Express backend's fate.** `import { startServer }` is commented out in [electron/main.js:8](electron/main.js#L8) and the backend isn't wired into the packaged app. Either wire it up or delete the dead imports/paths.
- [ ] 🟡 S — **Fill in `src/server/README.md`** (effectively empty) or remove it.

## 🟢 Low

- [ ] 🟢 S — **Verify niche renderer deps** (`react-audio-visualize`, `dictionary-en`, `nspell`) are actually used; drop if not.
- [ ] 🟢 S — **Add a `CONTRIBUTING.md`** documenting setup, scripts, and PR expectations — once the lint/test/format scripts above exist.
- [ ] 🟢 M — **Re-evaluate the iOS port** (`ios/`) priority after desktop Critical/High debt is cleared; the ML-stack spike plan there is unstarted.

---

## Already resolved since last review

- [x] Empty placeholder directories `scripts/`, `website/`, and `src/server/controller/` no longer exist.
- [x] `AGENTS.md` developer-onboarding doc now exists (was listed as missing).

---

## Suggested order (quick wins → structural)

1. JWT secrets + secret-scanning hook (🔴 S)
2. `lint`/`typecheck`/`format` scripts + Prettier (🔴 S)
3. CI workflow (🔴 M)
4. Dependency trim + dep/devDep reclassification (🟠 S)
5. Repo hygiene: `db.pdf`, `build.files` globs, empty `chat.js`, `.gitignore` (🟡 S)
6. Vitest + smoke tests (🔴 L)
7. Logger rollout (🟡 M)
8. Type the IPC bridge / reduce `any` (🟠 M)
9. Split oversized components (🟠 L)
