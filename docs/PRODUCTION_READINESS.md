# MindSage — Production Readiness

**Reviewed:** 2026-08-24 · **Scope:** Whole repo — Electron main, renderer, DB layer, packaging, CI/CD, and docs.

A single prioritised list of what stands between the current codebase and a product that can be shipped to strangers. Synthesised from every doc in this folder **and re-verified against the code**, because several tracked items were already fixed and several live numbers had drifted.

> **For execution order, use [MASTER_TODO.md](MASTER_TODO.md)**, which merges this document with every other doc in the folder into one sequential queue. This document holds the reasoning and the evidence; that one holds the ordering.

**Legend:** severity `🔴 blocker` `🟠 high` `🟡 medium` `🟢 low` · effort `S` < 1d · `M` 1–3d · `L` > 3d

---

## 0. Verified state as of this review

Run before trusting any older doc in this folder.

| Check | Older docs claim | Actual (2026-08-24) |
| --- | --- | --- |
| `npm run typecheck` | 165 errors | **131 errors** — still failing |
| `npm run lint` | "pre-existing errors" | **106 problems** (92 errors, 14 warnings) |
| Tests | "~0% coverage" | **5 test files**, CI-blocking |
| CI / release workflows | "no CI at all" | Both exist; quality gates are `continue-on-error` |
| `build.files` globs | broken (`servers/**/*`) | **Fixed** — `dist`, `dist-electron`, `public`, `package.json` |
| npm scripts | "only four exist" | **Stale** — `lint`, `typecheck`, `format`, `test`, `seed:demo`, `capture` all exist |
| `any` in `src/` | 61 → 48 | **58** |
| `console.log` in `electron/` | 108 | **106** |
| Empty `electron/services/chat.js` | flagged | **Still 0 bytes** |
| `src/server/utils/db.pdf` | flagged | **Still tracked** (684 KB) |

> ⚠️ [CLAUDE.md](../CLAUDE.md) §Commands and [AGENTS.md](../AGENTS.md) both describe the pre-tooling state and will actively mislead a new contributor or coding agent. Correcting them is a 10-minute job with outsized value.

---

## 1. 🔴 Blockers

### Data & privacy — the product's core promise

- [ ] 🔴 M — **Encrypt the database at rest.** [connection.js:6-10](../electron/db/connection.js#L6-L10) opens a plain `better-sqlite3` file at a predictable path. Journal text, moods, and the bcrypt hash are readable by anyone with file access, which makes the login screen a UI gate in front of an open door. Depends on the recovery decision in [OFFLINE_AUTH_DESIGN.md](OFFLINE_AUTH_DESIGN.md).
- [ ] 🔴 S — **Remove the hardcoded JWT secret** from [electron/methods/auth.js:9](../electron/methods/auth.js#L9) — it now ships *inside the packaged app*. Rotate it and scrub git history.
- [ ] 🔴 S — **Resolve the token charade.** Nine handlers call `jwt.decode`, never `jwt.verify`; `expiresIn: '15m'` is never enforced. Decide lock-vs-profile first ([AUTH_REVIEW.md](AUTH_REVIEW.md) §1) — fixing verification alone logs every user out with no refresh path.
- [ ] 🔴 S — **Gate the auto-updater.** Fires unprompted on every packaged launch with `autoDownload = true` ([NETWORK_AUDIT.md](NETWORK_AUDIT.md) §1.1). Contradicts the offline-first claim.

### Data-loss paths (not tracked in any prior doc)

- [ ] 🔴 S — **Quick Capture destroys entries when logged out.** Opened unconditionally by the global shortcut ([main.js:311](../electron/main.js#L311)), not wrapped in `PrivateRoute` ([App.tsx:232](../src/App.tsx#L232)); `accessToken!` is `null`, [journal.js:26](../electron/methods/journal.js#L26) throws, and the user sees only "Failed to save entry" with their text gone.
- [ ] 🔴 S — **No React ErrorBoundary anywhere.** A single render exception white-screens the whole app, with no recovery and no draft preservation.
- [ ] 🔴 M — **No schema versioning, no migration framework, no pre-migration backup.** [connection.js](../electron/db/connection.js) uses `CREATE TABLE IF NOT EXISTS` plus ad-hoc `ALTER` blocks; there is no `PRAGMA user_version`, no ordered migration list, and nothing copies the DB before a schema change. A bad upgrade lands on the user's only copy of their journal. **This is the largest untracked risk in the repo.**
- [ ] 🔴 S — **`logout()` doesn't reset React state**, and `localStorage.clear()` also wipes `colorTheme` and `zoom_scale`. The dashboard calls `logout()` on *any* fetch error ([dashBoard.tsx:139](../src/pages/dashBoard.tsx#L139)). See [AUTH_REVIEW.md](AUTH_REVIEW.md) §2.2–2.4.

### Distribution trust

- [ ] 🔴 S — **The installer is unsigned.** `CSC_LINK` / `CSC_KEY_PASSWORD` are wired into `release.yml` but unset, so Windows SmartScreen warns on a journaling app that asks for the user's private thoughts.
- [ ] 🔴 S — **No LICENSE file.** The repo is legally unshippable as-is.

---

## 2. 🟠 High — production operations

- [ ] 🟠 M — **No crash reporting.** Zero visibility into production failures. Electron's `crashReporter` at minimum. Anything network-bound needs explicit opt-in given the offline positioning.
- [ ] 🟠 S — **Update UI is missing.** `autoUpdater` emits `update:available`, `update:progress`, and `update:downloaded` to the renderer ([autoUpdater.js:28-36](../electron/services/autoUpdater.js#L28-L36)) and **nothing listens**. Updates download and install silently.
- [ ] 🟠 M — **Make CI quality gates blocking.** Requires clearing 131 typecheck + 92 lint errors. The highest-leverage fix: `electron.d.ts` doesn't declare `minimize` / `maximize` / `close` / `onWindowStateChange`, which [preload.js:4-32](../electron/preload.js#L4) *does* expose — a pure typing gap that accounts for the `TitleBar.tsx` failures.
- [ ] 🟠 M — **Cut the installer down from 236 MB.** The unpacked app is **777 MB** — over half of it avoidable: mac binaries shipped inside the Windows build, an 81 MB ffmpeg, renderer libraries shipped twice, and 43 MB of unused Electron locales. Full breakdown and plan in [BUNDLE_SIZE_PLAN.md](BUNDLE_SIZE_PLAN.md).
- [ ] 🟠 M — **Deepen test coverage** to journal CRUD, the Qdrant/AI worker, and migrations. Add a Playwright e2e for launch → write → search.
- [ ] 🟠 S — **Add a Content-Security-Policy.** None exists and `webSecurity` is default ([NETWORK_AUDIT.md](NETWORK_AUDIT.md) §4.1). Cheap, and it turns "we make no external requests" into an enforced invariant.
- [ ] 🟠 S — **Release pipeline is Windows-only** while `build` declares `mac: dmg` and `linux: AppImage`. See [MAC_RELEASE_PLAN.md](MAC_RELEASE_PLAN.md).
- [ ] 🟠 M — **Introduce a logger** (`electron-log`) with levels, rotation, and redaction — replaces 106 `console.log` calls.
- [ ] 🟠 S — **First run requires the network** (274 MB model pull). Document it and fail gracefully offline instead of stalling at setup.

---

## 3. 🟡 Medium — codebase health

- [ ] 🟡 S — **Add WAL mode and a busy timeout.** [PERFORMANCE.md](PERFORMANCE.md) §1.1 — two processes share the DB file (main + worker) and neither is configured for it. Three lines.
- [ ] 🟡 S — **Add the `journal_entries` indexes.** [PERFORMANCE.md](PERFORMANCE.md) §1.2 — the hottest table has none. Every caching item is gated behind this.
- [ ] 🟡 M — **Delete `src/server/` and online mode** — 1,877 orphaned LOC and 10 removable dependencies ([ONLINE_MODE_REMOVAL.md](ONLINE_MODE_REMOVAL.md)).
- [ ] 🟡 S — **Remove the dead forgot-password link** ([login.tsx:142](../src/pages/auth/login.tsx#L142)) — visible on the login screen, always fails.
- [ ] 🟡 M — **Type the IPC bridge** — 58 `any`, generic `channel: string, ...args: any[]`.
- [ ] 🟡 S — **Pin the embedding model tag.** The worker requests `nomic-embed-text:v1.5` ([qdrantWorker.js:31](../electron/qdrantWorker.js#L31)); setup pulls a different tag. Mismatch silently breaks semantic search.
- [ ] 🟡 L — **Split the monoliths** — `journalForm.tsx` (29 KB), `ModelSettings.tsx`, `qdrantWorker.js`, `db/connection.js`.
- [ ] 🟡 S — **Repo hygiene** — `db.pdf` still tracked, `electron/services/chat.js` still 0 bytes, duplicate `.gitignore` entries.
- [ ] 🟡 S — **Finish the dependency trim** — `chart.js` vs `recharts`, `date-fns` vs `dayjs`, `react-hot-toast` vs the in-house `ToastContext`.

---

## 4. 🟢 Low — polish

- [ ] 🟢 M — **Accessibility is thin** — 72 aria attributes across 166 buttons, and exactly **one** `prefers-reduced-motion` rule in a heavily animated app. No focus-trap or skip-link pattern.
- [ ] 🟢 S — **Add `CONTRIBUTING.md` and `CHANGELOG.md`.**
- [ ] 🟢 S — **No user-facing data deletion or uninstall cleanup.** NSIS leaves `%APPDATA%/MindSage` behind. For a journaling app, "delete everything" should be explicit and honest.
- [ ] 🟢 S — **Add `sandbox: true`** to both BrowserWindows. `contextIsolation` and `nodeIntegration` are already set correctly.
- [ ] 🟢 S — **Resolve the import-extension contradiction** between [AGENTS.md](../AGENTS.md) and [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) §4.5.
- [ ] 🟢 S — **Refresh [CLAUDE.md](../CLAUDE.md) and [AGENTS.md](../AGENTS.md)** against §0 of this document.

---

## 5. Suggested milestones

**M1 — Stop losing data.** Blockers 5–8 plus the two DB pragmas (§3). All small, none require a design decision. Ship this first.

**M2 — Make the promise true.** Decide lock-vs-profile, then encryption, token handling, and the updater together — they are coupled and fixing any one alone leaves the guarantee hollow.

**M3 — Releasable.** Signing, LICENSE, blocking CI, crash reporting, update UI, the size reduction, and the mac pipeline.

**M4 — Maintainable.** Delete the dead backend, type the bridge, trim dependencies, split the monoliths.

---

## 6. The two most under-weighted items

Everything above appears somewhere except these, and both are cheap:

1. **No migration or backup strategy** (§1) — the only failure mode in this list that permanently destroys user data with no recovery path.
2. **No error boundary** (§1) — the difference between "a page failed" and "the app is bricked until reinstall."
