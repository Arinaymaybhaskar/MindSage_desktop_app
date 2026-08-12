# MindSage — Technical Debt TODO

**Purpose:** Actionable, checkable task list for paying down technical debt. Derived from [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) (the detailed catalog) and re-verified against the codebase on 2026-08-11.

**Legend:** severity `🔴 Critical` `🟠 High` `🟡 Medium` `🟢 Low` · effort `S` < 1d · `M` 1–3d · `L` > 3d

---

## 🔎 Code review — 2026-08-12 (new findings)

Fresh read of auth, the DB layer, and the Qdrant worker. These are **new** items not previously tracked; the criticals are also folded into the sections below.

**Headline:** the app's "offline-first, private journaling" promise is not actually enforced. Data at rest is plaintext and the login secures a UI, not the data. Fixing encryption + a real session matters more than every hygiene item in this file combined.

- [ ] 🔴 M — **Encrypt the DB at rest.** See Critical section — plaintext SQLite defeats the privacy pitch. Highest-value single change.
- [ ] 🔴 S — **Hardcoded JWT secret moved into the packaged app** ([electron/methods/auth.js:9](electron/methods/auth.js#L9)), not removed. See Critical section.
- [ ] 🔴 S — **Issued JWT is never verified** anywhere in the desktop process. See Critical section.
- [ ] 🟠 S — **165 strict-mode typecheck errors across 44 files** (`npm run typecheck`), and CI runs it `continue-on-error`. Worst offender: the `window.electron` bridge is typed `any`, so `TitleBar.tsx` calls `.minimize`/`.maximize`/`onAIStarted`/`onWindowStateChange` — methods the *typed* preload doesn't expose. Renderer and preload disagree about the IPC surface and nothing catches it. Ties into the "type the IPC bridge" item under High.
- [ ] 🟠 M — **Dead / half-wired subsystems inflate the tree and mislead.** (a) "Online mode" in `handleLogin`/`handleRegister` POSTs to `http://localhost:4000` ([auth.js:40](electron/methods/auth.js#L40)) — nothing listens there, so it always throws. (b) Google OAuth ([auth.js:98](electron/methods/auth.js#L98)) completes the full refresh-token flow then returns tokens that nothing stores/uses. (c) The whole `src/server/` Express backend is never started. Decide: wire up or delete — don't ship dead auth paths.
- [ ] 🟡 S — **Embedding model tag mismatch may silently break semantic search.** The worker requests `nomic-embed-text:v1.5` ([qdrantWorker.js:31](electron/qdrantWorker.js#L31)) while `OllamaEmbeddingModelSetup` pulls `nomic-embed-text`. If the tags don't resolve to the same model, embeddings fail with only a `console.error`, and search quietly returns nothing. Pin one tag in both places.
- [ ] 🟢 S — **Worker cleanup:** stale header comment (`electron/workers/qdrantWorker.js` — file is at `electron/qdrantWorker.js`), unused `const collections = await response.json()` in `testQdrantConnection` ([qdrantWorker.js:12](electron/qdrantWorker.js#L12)), and leftover `// <-- PASTE YOUR CLIENT ID HERE` comments in `auth.js`.

---

## 🩹 Branch `feat/ai-metadata-status` — fix before merge

Review findings from the AI metadata/summary status + retry feature (pushed 2026-08-11). Fix these before this branch merges to `main`.

- [x] 🔴 S — **Cancel button causes data loss.** `handleCancelMetadata` / `handleCancelSummary` in [journalDetails.tsx](src/pages/journalDetails.tsx) call `journal:update` with only `{ ai_metadata_status, ai_metadata_error }`. [updateJournalEntry](electron/db/journal.js#L267) then writes back the missing `title` (→null), `content` (→''), `mood_score` (→null), deletes all tags, and resets `created_at` to now — **wiping the entry.** It also doesn't persist the status column at all. Route AI-status changes through a dedicated handler that only updates the status/error columns, not the generic journal update. *Fixed: new `updateAIStatus` DB helper + `handleUpdateAIStatus` on the `journal:update-ai-status` channel; cancel handlers now use it.*
- [x] 🔴 S — **Live status events never reach the renderer.** The forwarder in [ipcHandlers.js:200](electron/ipcHandlers.js#L200) guards on `runtime.mainWindow`, but `runtime` (from `startQdrant()`) is `{ httpPort, grpcPort, baseUrl, dataDir }` — no `mainWindow`, so the guard is always false and `ai-status-event` is never sent. The pending→completed/failed UI silently never updates. Use `BrowserWindow.getAllWindows()[0]` (the pattern [events.js:6](electron/events.js#L6) uses) or pass the real window into `registerIPCHandlers`. *Fixed: forwarder now resolves the live window via `BrowserWindow.getAllWindows()[0]`.*
- [x] 🟡 S — **`removeAllListeners` clobbers other listeners.** Both [useAIStatus.ts:68](src/hooks/useAIStatus.ts#L68) and the inline listener in `journalDetails.tsx` clean up with `removeAllListeners("ai-status-event")`, so one component unmounting kills every other subscription on that channel. Remove only the specific handler. *Fixed: preload `on` now returns an unsubscribe that removes only its own listener; both call sites use it.*
- [x] 🟡 S — **Dead `result.skipped` branch.** The summary retry UI checks `result.skipped`, but neither `journalService.retryAIMetadata` nor `handleRetryAIMetadata` ever returns it. Either return `skipped` from the handler for short entries or drop the branch. *Fixed: dropped the branch (retry intentionally regenerates even short entries) and removed `skipped` from the service return type.*
- [x] 🟢 S — **Unused params** `mode` / `token` in the new `retryAIMetadata` service method (TS6133 warnings). *Fixed: dropped the unused `mode` param; `journalDetails.tsx` now calls the service wrapper instead of `ipcRenderer.invoke` directly.*

---

## ⚡ Performance & caching — 2026-08-12

Caching opportunities found while auditing the data, media, and AI layers. Ordered by value/effort. **Read the caveat first:** the single biggest speedup here is *not* a cache — it's the missing `journal_entries` index (first item). Every cached query below still sits on top of a full-table scan until that lands, so do it first.

- [ ] 🟠 S — **Add indexes on `journal_entries` (prerequisite, not a cache).** [connection.js:359-374](electron/db/connection.js#L359) indexes `goals`, `tags`, `chats`, etc. but **nothing on `journal_entries`** — the hottest table. Every dashboard/list/mood/stats query filters `WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at`. Add a composite `idx_journal_entries_user_active ON journal_entries(user_id, is_deleted, created_at)` (plus a partial index `WHERE image_key IS NOT NULL` for the image queries). Turns repeated O(n) scans into index seeks; makes every cache below cheaper to (re)fill.
- [ ] 🟠 M — **Cache dashboard/stats aggregates in the main process, invalidated on journal mutation.** `getDashboardData`, `getUserStats`, `getMonthlyScores`, `getAllTimeScores` ([dashboard.js](electron/db/dashboard.js)) each run several full-table aggregate scans (word-count `SUM`, the all-time streak CTE, per-day-of-week averages) on **every** dashboard visit. They only change when an entry is created/updated/deleted. Memoize per-`userId` and bust the cache from the `journal:created` / update / delete paths via `eventBus`. Highest-value cache as entry count grows.
- [ ] 🟠 M — **Cache decoded media (image/audio/pdf → base64) instead of re-reading + re-encoding per IPC call.** `getImageBase64` / `getAudioBase64` / `getPdfBase64` ([media.js:8-71](electron/methods/media.js#L8)) `readFileSync` + base64-encode on every call, and callers re-request constantly (dashboard masonry, journal list, and the profile picture is fetched independently in [profileDropdown.tsx:56](src/components/profileDropdown.tsx#L56) *and* [ProfileSettings.tsx:31](src/components/settings/ProfileSettings.tsx#L31)). Add a bounded LRU in the main process keyed by `path + mtime` (mtime so edits bust it). Base64 of large images is CPU-heavy and blocks the main process. *Note: base64 over IPC is itself wasteful — longer-term, prefer a custom `file://`-style protocol or `nativeImage`, but an LRU is the cheap win now.*
- [ ] 🟡 M — **Add a renderer-side query cache (React Query/SWR, or a small TTL cache in Context).** There is none today — every page mount refetches over IPC (`dashboard:get-data`, `journal:get-all`, `category:get-all`, `ollama:models`), so navigating away and back re-runs everything. A cache with explicit invalidation on mutations would make navigation feel instant and cut redundant IPC/DB work. Pairs naturally with typing the IPC bridge (see High section).
- [ ] 🟡 S — **Cache the Ollama model list with a short TTL + explicit invalidation.** `handleGetOllamaModels` ([ollama.js:11](electron/methods/ollama.js#L11)) runs `ollama list` via **blocking `execSync`** and then fires N parallel `/api/show` fetches on every Model-Settings open. The list rarely changes. Cache it (30–60s TTL) and bust on `ollama:download-model` / `ollama:delete-model`. Also move the `execSync` off the sync path.
- [ ] 🟡 S — **Reuse prepared statements at module scope.** Every `db/*.js` function calls `db.prepare(...)` on each invocation (e.g. [journal.js](electron/db/journal.js) prepares the same statements per call; the create/update tag loops re-prepare inside transactions). better-sqlite3 caches internally by SQL string, but hoisting the `prepare` calls to module-level constants removes the per-call lookup and makes the hot paths clearly zero-alloc. Low risk, mechanical.
- [ ] 🟢 S — **Content-hash cache for embeddings.** `generateEmbedding` ([ollama.js:458](electron/methods/ollama.js#L458)) recomputes a vector every call; the chat flow can embed identical/repeated queries. A `sha1(text) → vector` cache (in-memory LRU, or a small `embedding_cache` table for persistence) avoids redundant Ollama round-trips for repeated content. Low frequency today — do last.

---

## 🔴 Critical — do first

- [ ] 🔴 M — **Journal data is stored unencrypted (core-promise failure).** [connection.js:10](electron/db/connection.js#L10) opens the DB with a bare `new Database(dbPath)` — no SQLCipher, no `PRAGMA key`, no `safeStorage`. Every journal entry, mood score, and the bcrypt password hash sit in plaintext at `%APPDATA%/MindSage/mind-sage.db`, readable by any process or person with file access. For a privacy-first journaling app this makes the entire auth layer (below) decorative and contradicts the `biometric_lock` setting and the README's privacy claims. **Fix:** encrypt at rest (`better-sqlite3-multiple-ciphers` / SQLCipher) with the key held in Electron `safeStorage`. This is the single highest-value fix in the repo — see the 2026-08-12 review section for rationale.
- [ ] 🔴 S — **Hardcoded JWT secret is STILL in shipped code — it moved, not fixed.** The literal `offlineAccessTokenSecret` now lives in [electron/methods/auth.js:9](electron/methods/auth.js#L9) (the packaged desktop app), not just the dead `src/server/`. `generateAccessToken` signs with it. Move to `process.env` / `safeStorage`, rotate, and scrub git history (BFG / `git filter-repo` + force-push). *Note: lower urgency than it sounds — see next item, the token secures nothing today — but still must not ship a literal secret.*
- [ ] 🔴 S — **Offline auth verifies nothing (security theater).** The desktop app issues a JWT but never checks one: `jwt.verify` exists **only** in the commented-out `src/server/` backend. The bcrypt login gates a React route, not the data (which is plaintext — see above). Either make the session real (verify the token / gate DB access on it) or stop advertising it as security.
- [x] 🔴 S — **Add a secret-scanning pre-commit hook** (e.g. `gitleaks`) so secrets can't be re-committed. *Done: husky `.husky/pre-commit` runs `gitleaks protect --staged` (warns-and-continues if the binary isn't installed) + `.gitleaks.toml`. **Devs must `npm install` (husky prepare) and install the gitleaks binary for real protection.***
- [x] 🔴 S — **Add quality-gate npm scripts:** `lint` (`eslint .`), `typecheck` (`tsc -p tsconfig.app.json --noEmit`), `format` (Prettier), and a `.prettierrc`. *Done: added `lint`/`typecheck`/`format`/`format:check` scripts, prettier devDependency, `.prettierrc` + `.prettierignore`. Repo not yet reformatted (separate change). Note: `typecheck` and `lint` currently surface pre-existing errors.*
- [x] 🔴 M — **Add a CI workflow** (`.github/workflows/ci.yml`) running `tsc --noEmit` + `eslint .` (+ tests once they exist) on every PR/push. There is currently no CI at all. *Done: workflow runs typecheck + lint (report-only until pre-existing errors are cleared) + `npm test` (blocking) on push to main and all PRs.*
- [~] 🔴 L — **Introduce a test runner** (Vitest + `@testing-library/react`, plus Playwright/electron-playwright for e2e). Bootstrap smoke tests for the critical flows: journal CRUD, auth, sync, and the AI enrichment worker. Coverage today is ~0% for JS/TS. *Done: Vitest + Testing Library set up with smoke tests for pure utils and the journalService IPC layer, wired into CI. **Still to do:** deeper coverage of journal CRUD / AI worker (needs main-process + better-sqlite3 harness) and Playwright e2e.*

## 🟠 High

- [ ] 🟠 S — **Close the lint/typecheck blind spot.** ESLint only matches `**/*.{ts,tsx}`, so all `.js` in `electron/` and `src/server/` (and `src/utils/electronUtils.js`) is unchecked. Extend the ESLint globs and add a `jsconfig.json`/`tsconfig` covering those dirs (or migrate them to TS).
- [~] 🟠 S — **Trim redundant dependencies** (run `depcheck` first): ~~`qdrant-client` (keep `@qdrant/js-client-rest`), `sqlite3` (keep `better-sqlite3`), one of `framer-motion`/`motion`~~ *(removed; `motion` deduped into `framer-motion`)*, `chart.js` vs `recharts`, `date-fns` vs `dayjs`, `react-hot-toast` *(still imported in 3 files — migrate to `ToastContext` first)*, ~~and Redux Toolkit/react-redux (only Context is used). Confirm whether MUI + Emotion are used~~ *(removed — MUI/Emotion/Redux all unused; also dropped @heroicons/react, langchain, d3-array, dictionary-en, nspell, node-key-sender, react-audio-visualize, react-date-picker, @tailwindcss/line-clamp)*. **Remaining:** `chart.js` vs `recharts` and `date-fns` vs `dayjs` both still used — need a migration to drop one of each.
- [~] 🟠 S — **Fix `dependencies` vs `devDependencies` classification.** ~~Move `@tailwindcss/vite`, `@tailwindcss/line-clamp`, and google `@types/*` into `devDependencies`~~ *(done — `@tailwindcss/vite` + `@types/google.accounts` moved to devDeps; `@tailwindcss/line-clamp` removed entirely; `tailwindcss`/`autoprefixer`/`postcss` were already in devDeps).*
- [ ] 🟠 M — **Reduce `any` usage** (48 occurrences across `src/**` as of 2026-08-12). Start with the IPC bridge: give `window.electron`/`electron.d.ts` real channel types instead of `channel: string, ...args: any[]`, and add DTOs for API service wrappers. This also clears a large share of the 165 typecheck errors (the untyped bridge is why `TitleBar.tsx` fails).
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

0. **Encrypt the DB at rest + make the session real** (🔴 M) — the privacy promise; do before any new feature work
1. Move the live JWT secret out of `electron/methods/auth.js` + rotate/scrub history (🔴 S)
2. Decide the fate of the dead online-mode / Google-OAuth / Express paths (🟠 M)
3. Type the IPC bridge → clears most of the 165 typecheck errors, then flip CI typecheck/lint to blocking (🟠 M)
4. Pin the embedding model tag in worker + setup (🟡 S)
5. Dependency trim + dep/devDep reclassification (🟠 S)
6. Repo hygiene: `db.pdf`, `build.files` globs, empty `chat.js`, `.gitignore` (🟡 S)
7. Deeper tests: journal CRUD + AI worker (🔴 L)
8. Logger rollout (🟡 M)
9. Split oversized components (🟠 L)
