# MindSage — Master TODO

**Built:** 2026-08-25 · **Sources:** every document in `docs/`, deduplicated and re-verified against the code.

This is the **single ordered queue** — what to do first, second, third. It deliberately carries no rationale: each item links to the document that argues for it. If an item and its source doc disagree, this file is newer.

**Legend:** severity `🔴 blocker` `🟠 high` `🟡 medium` `🟢 low` · effort `S` < 1d · `M` 1–3d · `L` > 3d

**How the order was chosen.** Irreversible harm first (data loss, then anything that gets harder after launch), then changes whose payoff exceeds their cost by an order of magnitude, then the privacy promise, then everything gated behind a decision or a measurement. Two hard gates are marked inline: **caching is blocked on the indexes** and **six auth items are blocked on one decision.**

---

## 0. Verified done — do not re-open

Claims still open in older docs that are actually resolved. Checked against the tree on 2026-08-25.

| Item | Where it's still listed as open | Reality |
| --- | --- | --- |
| `lint` / `typecheck` / `format` / `test` scripts | TECHNICAL_DEBT §1.1 | All exist, plus `bench`, `seed:demo`, `capture` |
| CI pipeline | TECHNICAL_DEBT §1.2 | `.github/workflows/ci.yml` + `release.yml` |
| Test runner | TECHNICAL_DEBT §1.1 | Vitest, 5 files / 35 tests, CI-blocking |
| Prettier, husky, gitleaks | TECHNICAL_DEBT §1.3 | `.prettierrc`, `.husky/pre-commit`, `.gitleaks.toml` |
| `build.files` globs broken | TECHNICAL_DEBT §3.3, TODO | Fixed — `dist`, `dist-electron`, `public`, `package.json` |
| Redux / MUI / Emotion / `sqlite3` / `qdrant-client` / `motion` | TECHNICAL_DEBT §5.1 | All removed from `package.json` |
| Empty `scripts/`, `website/`, `src/server/controller/` | TECHNICAL_DEBT §3.2 | Gone (`scripts/` now holds real tooling) |
| `busy_timeout = 5000` | PERFORMANCE §1.1 | Already the better-sqlite3 default — that half of §1.1 is a no-op |
| **Embedding model tag mismatch** | TODO, PRODUCTION_READINESS §3 | **Fixed** — all five call sites now pin `nomic-embed-text:v1.5` |
| Thumbnail caching | TODO §Performance | Landed in `97184be`, keyed on path+size+mtime |
| **AI pipeline unmeasured** | COVERAGE §2, Phase 6 items 37–39 | **Measured 2026-08-25** — enrichment 6.85s/entry, backfill 8.5 min @ 5k, chat RAG 14.06s, TTFT 410ms, ghost text 448ms, cold start 1.34s |
| **IPC round-trip / media payload** | COVERAGE §1.5, PERFORMANCE §2.1 | **Measured** — `media:getImage` is 2.20ms for 122 KB. The 🔴 rating is not supported; see OPTIMIZATION_LOG MEDIA-1 |
| `ffmpeg-static` broken by asar | (retracted in MAC §3.1, BUNDLE §2.2) | Never broken; it is only large |
| `feat/ai-metadata-status` review findings | TODO | All five fixed |
| iOS port items | TECHNICAL_DEBT §7, TODO, BUNDLE §3.2 | **`ios/` no longer exists** — these items and their links are obsolete |
| **Items 20, 21, 23, 24 — the online backend** | Phase 3 | **Done 2026-08-28.** `src/server/` and `src/api/axios.ts` deleted with the 7 server-only dependencies; Google sign-in and the `login:google` channel removed; all 44 `mode === "online"` branches collapsed; `authMode` retired from every service, handler, call site and `localStorage`. `journalService.chat` was kept, since `chat:send` has a live handler |
| **Item 22 — forgot password** | Phase 3 | **Resolved differently.** Route and page kept, page rewritten to state there is no account server and no reset. Not a deletion |
| **Item 12 — per-platform `extraResources`** | Phase 1 | **Done 2026-08-28.** Verified against a real `electron-builder` run: `resources/mac` is absent from `win-unpacked` |
| **Item 55 — `electronUtils.js` to TypeScript** | Phase 9 | **Moot.** It was main-process code misfiled under `src/`, and two `electron/methods` modules imported it. Now `electron/methods/authToken.js` |
| **Item 56 — import-extension policy** | Phase 9 | **Done 2026-08-28.** CLAUDE.md now documents the majority style (extensionless in the renderer, explicit `.js` in `electron/`), and AGENTS.md was rewritten against the current tree |
| Half of item 53 | Phase 9 | 0-byte `electron/services/chat.js` and root `test-color-db.js` are gone. The duplicate `.gitignore` entries remain |
| **Items 1, 2 — pre-migration backup and `PRAGMA user_version`** | Phase 0 | **Done 2026-08-30.** `electron/db/migrations.js` holds an ordered `MIGRATIONS` list applied against `user_version`, one transaction per migration; `initDatabase()` takes a `VACUUM INTO` snapshot into `<userData>/backups/` (5 kept) before the first one runs. The two unconditional `DROP TABLE` statements are now migration 3 rather than a per-boot instruction, and `PRAGMA foreign_keys` moved to connection scope, where the worker's own handle finally reaches it |
| **Items 3, 4, 5, 6 — the renderer data-loss paths** | Phase 0 | **Done 2026-08-30.** Quick Capture persists a draft and shows no writing surface when signed out; a route-level and a root-level `ErrorBoundary` replace the white screen (and the root one fires the splash handshake, which used to be stranded in `AppLayout`); `logout()` resets context state and removes three keys instead of `localStorage.clear()`; the dashboard settles its five reads independently and never calls `logout()` on a failed fetch. The dead `react-hot-toast` imports in `quickCapture.tsx` and `ModelSettings.tsx` went with them, since no `<Toaster/>` was ever mounted and every one of those messages rendered nothing |
| **Items 26, 27 — IPC types and the quality gates** | Phase 4 | **Done 2026-08-28.** Typecheck, lint and format at zero; CI blocks on all four gates |
| **Item 36 — the benchmark harness** | Phase 6 | **Committed**, with runs mirrored to mindsage-web |
| **Item 12 measured** | Phase 1 | `after-extraresources` (2026-10-06): installer 248.3 → 217.7 MB. PKG-1 is improved, not closed: its 180 MB target needs item 13 too |
| **Items 7, 8, 9: indexes, WAL, sargable dates** | Phase 1 | **Done 2026-10-06.** WAL + `synchronous = NORMAL` in `connection.js` (both handles); migration 4 adds `journal_entries(user_id, is_deleted, created_at)`; `getAllEntries` and `getRecentEntries` use a tag subquery instead of `GROUP BY`, and compare `created_at` without `DATE()`. Full scans 41 to 12; at 50k `list.page1` 246ms to 0.30ms and reads under worker writes 436ms to 0.41ms (`after-wal-and-indexes`). The `journal_entry_tags(journal_entry_id)` index was not added: the primary key already serves it. Old and new queries matched on 494 comparisons against a copy of a real journal. DB-3 and DB-5 remain |
| **Items 10, 11, 13, 14: the rest of Phase 1** | Phase 1 | **Done 2026-10-06.** **10:** `LICENSE` (proprietary, all rights reserved, source public for reading) and `"license": "UNLICENSED"`. **11:** `electron-updater` is CommonJS, so its exports arrive on `default` from ESM; the destructured `autoUpdater` was undefined and every packaged launch threw on `autoDownload`. Fixed, and the launch check now runs only when Settings > Appearance > "Check for Updates Automatically" is on (default off); "Check now" reports the result. Verified in a packaged build: the check reaches GitHub and reports that no production release exists, which is true while every release is a pre-release. **13:** `public/**` dropped from `files` (Vite already copies it into `dist/`), `dist/screenshots` and `better-sqlite3/{deps,src}` excluded, `electronLanguages: ["en-US"]`, `compression: "maximum"`. Packaged output 791.8 to 717.5 MB, installer 217.6 to 198.4 MiB (`after-packaging-trims`); the packaged app opens, migrates and uses its database without the SQLite source. **14:** `userDataOverride.js` publishes userData as `MS_DB_DIR`, which `connection.js` and the worker use. Same file on Windows; an existing journal at the old macOS/Linux path wins over an empty new location, and an explicit `MS_USER_DATA_DIR` always gets its own database |
| **Items 15, 16b, 17, half of 19: the password, honestly** | Phase 2 | **Done 2026-10-06.** Option B. `electron/session.js` holds who is signed in; every handler under `electron/methods/` asks it, and the `token` parameter is gone from all of them, from every `src/api` wrapper and from every caller. `jsonwebtoken`, `tokenSecret.js` and `authToken.js` are deleted. "Keep me signed in" persists the user id (electron-store `session.json`); unticked, a relaunch asks for the password. The first launch after upgrading adopts the old localStorage token once, so nobody is signed out by the upgrade, then refuses it for good. Both windows follow `auth:changed`. Also fixed: `user:get-me` returned the bcrypt hash, which the Settings page cached in localStorage. Verified in the running app: signed-out refusal, every feature channel, password change, relaunch both ways, and the legacy handover once and refused twice |
| **Packaged Qdrant worker never started** | (not previously listed) | **Fixed 2026-08-28.** `createQdrantWorker` resolved a packaged path outside `app.asar`, so background AI enrichment was dead in every install. → [CODEBASE_STRUCTURE_AUDIT §3](CODEBASE_STRUCTURE_AUDIT.md) |

---

## Phase 0 — Stop the data loss

Nothing else matters if the app eats entries. Every item is small and none needs a design decision.

1. ✅ **Done 2026-08-30** — pre-migration backup. See §0.
2. ✅ **Done 2026-08-30** — `PRAGMA user_version` and an ordered migration list. See §0.
3. ✅ **Done 2026-08-30** — Quick Capture keeps a draft and refuses to offer a writing surface when signed out. See §0.
4. ✅ **Done 2026-08-30** — a route-level and a root-level React ErrorBoundary. See §0.
5. ✅ **Done 2026-08-30** — `logout()` resets state and removes only the auth keys. See §0.
6. ✅ **Done 2026-08-30** — the dashboard degrades instead of ending the session. See §0.

**Phase 0 is closed.** Every known data-loss path in the app is now either fixed or recorded as recoverable.

## Phase 1 — The free wins

Config and two-line changes with measured or obvious payoff. The whole phase is roughly one day and ships ~145 MB and the app's worst latency cliff.

7. ✅ **Done 2026-10-06:** `journal_entries(user_id, is_deleted, created_at)` index, as migration 4. The `journal_entry_tags(journal_entry_id)` half was not needed: that lookup already uses the table's primary key. See §0.
8. ✅ **Done 2026-10-06:** WAL + `synchronous = NORMAL`. See §0.
9. ✅ **Done 2026-10-06:** together with item 7, which made the list queries slower on its own. See §0.
10. ✅ **Done 2026-10-06:** proprietary, all rights reserved; `package.json` says `UNLICENSED`. See §0.
11. ✅ **Done 2026-10-06:** import crash fixed, launch check gated behind a Settings toggle (default off), plus a "Check now" button. See §0.
12. ✅ **Done 2026-08-28** — per-platform `extraResources`. See §0.
13. ✅ **Done 2026-10-06:** packaged output 791.8 to 717.5 MB, installer 217.6 to 198.4 MiB. See §0.
14. ✅ **Done 2026-10-06:** with a fallback that keeps an existing journal at the old path. See §0.

## Phase 2 — The privacy promise

> **Gate, resolved 2026-10-06:** item 15 chose option B. Items 16b and 17 are done, 19 is half done, and 18 is deferred until encryption is taken on as a feature.

15. ✅ **Decided 2026-10-06: Option B now, A later.** The password picks the account and keeps people out of the app, and the app says so on the login page and in Settings > Security. Encryption (item 18) becomes a later, deliberate feature. Reasoning: a typical install is one person on their own Windows account, where other OS accounts are already kept out by file permissions and a stolen laptop by device encryption when it is on; A's added protection is copies of the file and determined snooping, at the cost of several days and permanent data loss for anyone who loses both password and recovery code. See §0.
16. 🟡 S — **Scrub the old JWT secret from git history.** The constant no longer ships: `electron/services/tokenSecret.js` now generates a 64-byte secret per install on first run and persists it outside the bundle, so installs no longer share a signing key. What remains is the history rewrite, which needs a `backup/` branch first and coordination with anyone holding a clone. Downgraded from 🔴 because the live code no longer carries the value. → [TECHNICAL_DEBT §2.1](TECHNICAL_DEBT.md)
16b. ✅ **Dissolved 2026-10-06** by item 17: there are no tokens left to verify. See §0.
17. ✅ **Done 2026-10-06:** session in the main process, tokens and `jsonwebtoken` deleted, the `token` parameter gone from every handler and caller. See §0.
18. 🔴 L ⏸ — **Deferred by item 15: encrypt the journal at rest, as a later feature.** SQLCipher, DEK wrapped by password + recovery code, mandatory recovery-code confirmation at setup, and the §7 migration for existing installs. **The design covers only the SQLite file.** It must also cover the Qdrant payloads (journal `content`, titles and tags are stored in plaintext in `qdrant-data`), the media files (photos, voice notes, chat attachments), and the `VACUUM INTO` snapshots in `backups/`, or the encryption claim is hollow. → [OFFLINE_AUTH_DESIGN §3–7](OFFLINE_AUTH_DESIGN.md), [AUTH_REVIEW §2.6](AUTH_REVIEW.md)
19. 🟡 S — **Idle and sleep lock.** Half done 2026-10-06: the dead `biometric_lock` toggle is gone and Settings says what the password does; the quit case is "Keep me signed in", which now works (unticked, the next launch asks for the password). Still open: sign out after an idle period and on system sleep, as an opt-in setting, with Quick Capture following. → [AUTH_REVIEW §2.5, §2.8](AUTH_REVIEW.md)

## Phase 3 — Delete the dead weight

Independently shippable, and it shrinks everything downstream — fewer files to type, test, sign, and package.

20. ✅ **Done 2026-08-28** — `src/server/` deleted. See §0.
21. ✅ **Done 2026-08-28**, with one exception: `journalService.chat` stays, because `chat:send` has a live handler. See §0.
22. ⚠️ **Resolved differently 2026-08-28.** The route and page were kept rather than removed, and the page rewritten to say plainly that there is no account server and therefore no password reset. A dead-end that explains itself beats a missing link. See §0.
23. ✅ **Done 2026-08-28** — all 44 branches collapsed. The count was exact. See §0.
24. ✅ **Done 2026-08-28** — `authMode` retired everywhere, in one pass rather than service by service. See §0.
25. 🟢 S — **Move renderer-only libraries to `devDependencies`.** They ship twice today — once minified in the 2.6 MB bundle, once as raw source in `app.asar`. **−80 MB**, one line per package. → [BUNDLE_SIZE_PLAN §2.3](BUNDLE_SIZE_PLAN.md)

## Phase 4 — Make the quality gates real

26. ✅ **Done 2026-08-28** — `electron.d.ts` describes the whole preload surface and `invoke` is generic. See §0.
27. ✅ **Done 2026-08-28** — typecheck, lint and format are at zero and CI blocks on all four gates. See §0.
28. 🟠 S — **Extend ESLint to `electron/**/*.js`.** All main-process JS is currently neither linted nor type-checked. → [TECHNICAL_DEBT §1.3](TECHNICAL_DEBT.md)
29. 🔴 L — **Deepen test coverage** to journal CRUD, the AI worker, and migrations, plus a Playwright e2e for launch → write → search. → [PRODUCTION_READINESS §2](PRODUCTION_READINESS.md)

## Phase 5 — Production operations

30. 🟠 S — **Wire up the update UI.** `autoUpdater` emits `update:available` / `:progress` / `:downloaded` and **nothing in the renderer listens** (verified). Updates install silently. Item 11 unblocked this (2026-10-06): the updater now runs, on opt-in or from Settings' "Check now", which reports the check's result but not download progress or a ready-to-install prompt. Testing it end to end needs a production (non-pre-release) GitHub release. → [PRODUCTION_READINESS §2](PRODUCTION_READINESS.md)
31. 🟠 M — **Crash reporting.** Zero visibility into production failures; anything network-bound needs explicit opt-in here. → [PRODUCTION_READINESS §2](PRODUCTION_READINESS.md)
32. 🟠 M — **A real logger** with levels, rotation, and redaction, replacing 106 `console.log` calls. → [TECHNICAL_DEBT §4.3](TECHNICAL_DEBT.md)
33. 🟠 S — **Add a Content-Security-Policy.** Verified absent. Cheap, and it turns "we make no external requests" into an enforced invariant. → [NETWORK_AUDIT §4.1](NETWORK_AUDIT.md)
34. 🟠 S — **Handle the offline first run.** A 274 MB model pull is required to finish setup; document it and fail gracefully instead of stalling. → [NETWORK_AUDIT §1.2](NETWORK_AUDIT.md)
35. 🟢 S — **`sandbox: true` on both BrowserWindows.** `contextIsolation` and `nodeIntegration` are already correct. → [PRODUCTION_READINESS §4](PRODUCTION_READINESS.md)
35b. 🟡 S — **Startup race on `models:get-selected`.** The renderer invokes it before `registerIPCHandlers()` has run, so the packaged log shows `No handler registered for 'models:get-selected'` on launch. Seen 2026-10-06. Related: in two of three `startup` benchmark runs on 2026-10-06 the log stops before "Qdrant started" while the renderer still signals ready. → [benchmarks/OPTIMIZATION_LOG](benchmarks/OPTIMIZATION_LOG.md)
35c. 🔴 S: **A Qdrant failure takes every IPC handler down with it.** In `main.js`, `startQdrant()` and `registerIPCHandlers()` share one `try` block, so when Qdrant throws, the handlers are never registered and the app opens with nothing working: no login, no journal, no settings, though none of that needs Qdrant. Seen 2026-10-06 on a scratch profile whose fresh `qdrant-data` path exceeded Windows' 260-character limit (`createCollection` returned "os error 3"); any Qdrant start or collection failure does the same. Register the handlers regardless and let search and chat degrade. Likely the same root as part of 35b. → [benchmarks/OPTIMIZATION_LOG](benchmarks/OPTIMIZATION_LOG.md)

## Phase 6 — Act on what the benchmarks found

> Measurement is done: eleven stages cover the database, the AI pipeline, vector search, retrieval quality, Whisper, startup, the renderer and packaging. The old items 37–39 are complete and moved to §0. What remains here is the work those measurements produced.

36. ✅ **Done** — `scripts/bench/` (11 stages), `scripts/run-bench.mjs` and `docs/benchmarks/` are tracked, and runs publish to mindsage-web. See §0.
37. 🟠 M — **Swap the embedding model to `embeddinggemma`, together with a full re-embed.** Measured on the labelled corpus: precision@1 **0.467 → 0.733**, recall@5 0.767 → 0.933, MRR 0.644 → 0.867. It is a drop-in — also 768-dimensional, so the Qdrant collection config is unchanged. Costs **+347 MB** on the user's disk and **−20% embedding throughput** (backfill at 5k goes 8.8 → 11.1 min). Three call sites pin the current tag: [ollama.js:542](../electron/methods/ollama.js#L542), [qdrantWorker.js:31](../electron/qdrantWorker.js#L31), [OllamaSetup.js:118](../electron/services/OllamaSetup.js#L118). **Sequence with item 38** — changing models invalidates every stored vector, so the re-embed and the throttling work are the same job. → [benchmarks/OPTIMIZATION_LOG SEARCH-1](benchmarks/OPTIMIZATION_LOG.md)
38. 🔴 M — **Bound and throttle the backfill sweep.** `qdrantWorker.js:546` re-embeds every entry not marked `success` with no batch limit, no attempt counter and no backoff — 8.5 minutes of continuous background work at 5,000 entries, during which item 8's contention stalls every foreground read. A permanently-failing entry is retried on every sweep forever. → [benchmarks/OPTIMIZATION_LOG AI-2](benchmarks/OPTIMIZATION_LOG.md)
39. 🟢 S — **Widen the retrieval corpus before quoting item 37's margin.** 18 entries and 15 queries means precision@1 0.467 → 0.733 is four queries changing answer. The direction is consistent across all three metrics, but the percentages are soft. → [fixtures/retrieval.mjs](../scripts/bench/fixtures/retrieval.mjs)

## Phase 7 — Performance and caching

> **Gate:** every cached query below sits on top of a full-table scan until item 7 lands. Do not start this phase early — you would be memoising a 1.69s query instead of fixing it.

40. 🟠 S — **Make `execSync("ollama list")` async and cache it** (30–60s TTL, busted on model download/delete). The only caching item independent of the DB, and it currently freezes the main process on every Model Settings open. → [PERFORMANCE §3.2](PERFORMANCE.md), [TODO §Performance](TODO.md)
41. 🟠 M — **Rewrite `getUserStats` as a single pass; cache only if still needed.** 18 scans and 1.69s today — but the indexes may make it adequate on their own. Re-measure first. → [benchmarks/FINDINGS](benchmarks/FINDINGS.md), [PERFORMANCE §1.4](PERFORMANCE.md)
42. 🟠 M — **Serve media over a custom protocol** rather than base64 over IPC (an LRU keyed on `path + mtime` is the cheap interim). Ranked by item 37's result. → [PERFORMANCE §2.1](PERFORMANCE.md)
43. 🟠 M — **Virtualize the journal list** or drop framer-motion `layout` on cards. It never unmounts, so the animated set grows without bound. → [PERFORMANCE §4.1](PERFORMANCE.md)
44. 🟡 M — **Renderer-side query cache** with invalidation on mutation. Every page mount refetches over IPC today. → [TODO §Performance](TODO.md)
45. 🟠 M — **Merge the metadata and summary AI calls.** Three serialized model calls per entry against a serially-serving Ollama. → [PERFORMANCE §3.1](PERFORMANCE.md)
46. 🟡 S — **The small ones, together:** module-scope prepared statements, embedding content-hash cache, worker logging behind a debug flag, stable masonry heights, and `ORDER BY RANDOM()` in the dashboard gallery. → [PERFORMANCE §1.5, §3.3, §4.3](PERFORMANCE.md), [TODO §Performance](TODO.md)

## Phase 8 — macOS

> **Gate:** items 12 and 14 belong to Phase 1 and are prerequisites. Do not pay for a certificate until every item here below 50 passes on a local unsigned build.

47. 🔴 L — **Build Whisper for `darwin-arm64` and `darwin-x64`** and replace the hardcoded `.exe` paths with a platform resolver. Speech-to-text is Windows-only today. → [MAC_RELEASE_PLAN §1.1](MAC_RELEASE_PLAN.md)
48. 🔴 M — **Ship an arm64 Qdrant.** The bundled mac binary is x86_64 and needs Rosetta, which is not installed by default. → [MAC_RELEASE_PLAN §1.2](MAC_RELEASE_PLAN.md)
49. 🔴 S — **`NSMicrophoneUsageDescription`.** Without it macOS *terminates* the app when it touches the mic — a crash, not a prompt. → [MAC_RELEASE_PLAN §1.5](MAC_RELEASE_PLAN.md)
50. 🔴 M — **Signing and notarisation** — Hardened Runtime, entitlements, and every one of the four nested binaries signed. Expect the nested-binary step to consume most of the effort. → [MAC_RELEASE_PLAN §2](MAC_RELEASE_PLAN.md)
51. 🟠 M — **CI matrix and native polish** — a `release-macos` job, `latest-mac.yml`, then the traffic-lights/menu-bar/shortcut differences. → [MAC_RELEASE_PLAN §4–6](MAC_RELEASE_PLAN.md)

## Phase 9 — Code health

52. 🟠 L — **Split the monoliths** — `journalForm.tsx` (29 KB), `ModelSettings.tsx`, `journalList.tsx`, `dashBoard.tsx`, `qdrantWorker.js`, `db/connection.js`. → [TECHNICAL_DEBT §4.1](TECHNICAL_DEBT.md)
53. 🟡 S — **Repo hygiene.** The 0-byte `electron/services/chat.js` and the root `test-color-db.js` are gone as of 2026-08-28. Still open: the duplicate `dist` / `dist-electron` entries in `.gitignore`, and README's claim that every new file under `electron/db`, `electron/methods` or `electron/services` needs a `viteStaticCopy` target. Only `qdrantWorker.js` and its imports do. → [TECHNICAL_DEBT §3](TECHNICAL_DEBT.md)
54. 🟡 S — **Tighten catch blocks** — `unknown` plus narrowing, routed to a central error handler, instead of ~95 catch-alls. → [TECHNICAL_DEBT §4.4](TECHNICAL_DEBT.md)
55. ✅ **Moot 2026-08-28** — the file was main-process code misfiled under `src/`. It moved to `electron/methods/authToken.js` and stays JavaScript, like the rest of `electron/`. See §0.
56. ✅ **Done 2026-08-28** — the policy is documented as it is actually practised, and AGENTS.md was rewritten. See §0.
57. 🟡 S — **Finish the dependency trim** — `chart.js` vs `recharts`, `date-fns` vs `dayjs`, and `react-hot-toast` vs the in-house `ToastContext` (still imported in 3 files). → [TODO §High](TODO.md)
58. 🟢 M — **Accessibility** — 72 aria attributes across 166 buttons, and exactly one `prefers-reduced-motion` rule in a heavily animated app. No focus-trap or skip-link pattern. → [PRODUCTION_READINESS §4](PRODUCTION_READINESS.md)
59. 🟢 S — **`CONTRIBUTING.md` and `CHANGELOG.md`.** → [PRODUCTION_READINESS §4](PRODUCTION_READINESS.md)
60. 🟢 S — **User-facing data deletion and uninstall cleanup.** NSIS leaves `%APPDATA%/MindSage` behind; for a journaling app "delete everything" should be explicit. → [PRODUCTION_READINESS §4](PRODUCTION_READINESS.md)

## Phase 10 — Structural bets

Each is a real architecture decision, not a cleanup. Schedule deliberately.

61. 🟡 M — **Drop or shrink FFmpeg** — 81 MB for one job (audio → 16 kHz mono WAV). Check whether `MediaRecorder` can produce that directly before building custom binaries. **−65 to −81 MB.** → [BUNDLE_SIZE_PLAN §2.2](BUNDLE_SIZE_PLAN.md)
62. 🔴 M — **Fetch the Whisper model on first use** instead of bundling 77 MB. Decide together with item 34 — it adds a network dependency to an otherwise-offline feature. → [BUNDLE_SIZE_PLAN §3.1](BUNDLE_SIZE_PLAN.md)
63. 🔴 L — **Replace Qdrant with `sqlite-vec`** — deletes a 77 MB binary, a spawned process, the port-allocation dance, the `synced_to_qdrant` state machine, and the debug viewer. → [BUNDLE_SIZE_PLAN §3.2](BUNDLE_SIZE_PLAN.md)
64. 🟡 M — **Move `resources/` out of plain git.** About 230 MB across 11 tracked binaries, no Git LFS configured. Every clone pays it and every binary update adds another full copy to history permanently. Deleting the unused Whisper executables shrank the installer, not the history. Gets harder the longer it waits. → [CODEBASE_STRUCTURE_AUDIT §4](CODEBASE_STRUCTURE_AUDIT.md)

---

## Where each source document went

Every item in every doc is accounted for here. Nothing was dropped silently.

| Document | Items | Landed in |
| --- | --- | --- |
| [AUTH_REVIEW.md](AUTH_REVIEW.md) | 9 | 3, 5, 6, 15–19 |
| [NETWORK_AUDIT.md](NETWORK_AUDIT.md) | 6 | 11, 21, 33, 34 |
| [PERFORMANCE.md](PERFORMANCE.md) | 12 | 7–9, 40–46 |
| [benchmarks/FINDINGS.md](benchmarks/FINDINGS.md) | 8 | 7, 8, 12, 37, 38, 41, 43, 45 |
| [benchmarks/COVERAGE.md](benchmarks/COVERAGE.md) | 25 gaps, 22 now measured | 36–39 · rest in §0 · 3 deliberately manual |
| [ONLINE_MODE_REMOVAL.md](ONLINE_MODE_REMOVAL.md) | 7 | 20–24 |
| [BUNDLE_SIZE_PLAN.md](BUNDLE_SIZE_PLAN.md) | 10 | 12, 13, 20, 25, 61–63 |
| [MAC_RELEASE_PLAN.md](MAC_RELEASE_PLAN.md) | 16 | 14, 47–51 |
| [OFFLINE_AUTH_DESIGN.md](OFFLINE_AUTH_DESIGN.md) | 6 steps | 15, 17–19 |
| [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) | 20 | 16, 28, 32, 52–57 · rest in §0 |
| [TODO.md](TODO.md) | 30 | 40, 44, 46, 57 · rest in §0 or duplicated above |
| [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) | 34 | Throughout; §0 verified table folded into §0 here |
| [CODEBASE_STRUCTURE_AUDIT.md](CODEBASE_STRUCTURE_AUDIT.md) | 8 (P1–P8) | 20–24, 52, 64 · P4 declined · rest in §0 |

**Totals by severity:** 39 items still open, 9 🔴 · 14 🟠 · 10 🟡 · 6 🟢 (item 18 counted, though deferred). Since the 56 counted on 2026-08-28: Phase 0 closed six (2026-08-30), items 26, 27 and 36 were found done but still listed (2026-10-06), 35b and 35c were added, Phase 1 closed items 7, 8, 9, 10, 11, 13 and 14, and Phase 2 closed 15, 16b and 17 (all 2026-10-06). Everything closed is recorded in §0.

**The short version.** Phases 0 and 1 are about twenty items, nearly all `S`, and they remove every known data-loss path, the worst latency cliff, and ~145 MB — before a single architectural decision is required. Phase 2 is the product's actual promise. Everything after that is a real roadmap rather than a sprint.
