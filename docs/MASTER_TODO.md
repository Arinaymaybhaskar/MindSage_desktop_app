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

---

## Phase 0 — Stop the data loss

Nothing else matters if the app eats entries. Every item is small and none needs a design decision.

1. 🔴 S — **Back up the DB file before any schema change.** Nothing copies `mind-sage.db` before `initDatabase()` runs its `ALTER` blocks. → [PRODUCTION_READINESS §1](PRODUCTION_READINESS.md)
2. 🔴 M — **Add `PRAGMA user_version` and an ordered migration list.** Follows directly from 1; today there is no migration framework at all. → [PRODUCTION_READINESS §1](PRODUCTION_READINESS.md)
3. 🔴 S — **Quick Capture destroys entries when logged out.** Global shortcut opens it unconditionally, `accessToken` is `null`, the handler throws, the user sees "Failed to save entry" and their text is gone. → [AUTH_REVIEW §2.7](AUTH_REVIEW.md)
4. 🔴 S — **Add a React ErrorBoundary.** Verified absent. One render exception white-screens the app with no recovery and no draft preservation. → [PRODUCTION_READINESS §1](PRODUCTION_READINESS.md)
5. 🔴 S — **Fix `logout()`** — reset `accessToken`/`user` state, and delete the three auth keys instead of `localStorage.clear()`, which also wipes the user's theme and zoom. → [AUTH_REVIEW §2.2–2.3](AUTH_REVIEW.md)
6. 🟠 S — **Stop the dashboard calling `logout()` on any fetch error.** One slow Qdrant call currently destroys the session. → [AUTH_REVIEW §2.4](AUTH_REVIEW.md)

## Phase 1 — The free wins

Config and two-line changes with measured or obvious payoff. The whole phase is roughly one day and ships ~145 MB and the app's worst latency cliff.

7. 🟠 S — **Add the `journal_entries` indexes** (`user_id, is_deleted, created_at`) **and `journal_entry_tags(journal_entry_id)`.** Measured: 41 full scans per run; `dashboard.stats` p95 goes 3ms → 1.69s as entries grow. Largest effect, smallest change. → [benchmarks/FINDINGS §1](benchmarks/FINDINGS.md), [PERFORMANCE §1.2](PERFORMANCE.md)
8. 🔴 S — **Enable WAL + `synchronous = NORMAL`.** Measured: a read that takes 0.92ms alone takes 200ms while the worker writes — a 217× stall at only 150 entries, in the app's normal operating condition. Skip `busy_timeout`; it is already 5000. → [benchmarks/FINDINGS §2](benchmarks/FINDINGS.md)
9. 🟠 S — **Remove the `DATE()` / `DATETIME()` wrappers in `getAllEntries`** so the new index is usable at all. → [PERFORMANCE §1.3](PERFORMANCE.md)
10. 🔴 S — **Add a LICENSE file.** Verified absent. The repo is legally unshippable without one. → [PRODUCTION_READINESS §1](PRODUCTION_READINESS.md)
11. 🔴 S — **Gate the auto-updater** behind an explicit setting (default off) or a manual button. It fires on every packaged launch with `autoDownload = true` — the one thing that contradicts the offline-first claim. → [NETWORK_AUDIT §1.1](NETWORK_AUDIT.md)
12. 🟢 S — **Per-platform `extraResources`** — the Windows installer ships 73.5 MB of macOS binaries. **−74 MB**, and a prerequisite for any mac build. → [BUNDLE_SIZE_PLAN §2.1](BUNDLE_SIZE_PLAN.md)
13. 🟢 S — **Four packaging one-liners: −72 MB.** `electronLanguages: ["en-US"]` (−42), drop `public/**` from `files` (−20), exclude `better-sqlite3/{deps,src}` (−9.6), `compression: "maximum"` (installer only). → [BUNDLE_SIZE_PLAN §2.5–2.8](BUNDLE_SIZE_PLAN.md)
14. 🔴 S — **Write the DB to `app.getPath("userData")`.** On macOS it currently lands in `~/Library/Preferences`, where its own logs do not. Two lines now; a migration once anyone has shipped. → [MAC_RELEASE_PLAN §1.3](MAC_RELEASE_PLAN.md)

## Phase 2 — The privacy promise

> **Gate:** item 15 is a decision, and items 17–19 are meaningless until it is made. Fixing any one of them in isolation either logs every user out or leaves the guarantee hollow.

15. 🔴 — **DECIDE: Option A (encrypted vault) or Option B (profile picker, no security claim).** The current code pays A's complexity and delivers B's protection. → [AUTH_REVIEW §1](AUTH_REVIEW.md), [OFFLINE_AUTH_DESIGN](OFFLINE_AUTH_DESIGN.md)
16. 🟡 S — **Scrub the old JWT secret from git history.** The constant no longer ships: `electron/services/tokenSecret.js` now generates a 64-byte secret per install on first run and persists it outside the bundle, so installs no longer share a signing key. What remains is the history rewrite, which needs a `backup/` branch first and coordination with anyone holding a clone. Downgraded from 🔴 because the live code no longer carries the value. → [TECHNICAL_DEBT §2.1](TECHNICAL_DEBT.md)
16b. 🔴 M — **Verify tokens instead of decoding them.** All eight modules under `electron/methods/` call `jwt.decode`, so neither the signature nor `exp` is ever checked and a hand-written `{"id": N}` payload is accepted as user N. **Blocked on item 17, not merely sequenced after it:** switching to `jwt.verify` on its own logs every user out mid-session with no way back, because the refresh interceptor at [src/api/axios.ts:83](../src/api/axios.ts#L83) posts to a `localhost:4000` server that never starts. Item 17 deletes the tokens outright, which dissolves this item rather than fixing it — prefer that over patching eight call sites. Also deduplicate `getUserIdFromToken`, currently copy-pasted into all eight. → [AUTH_REVIEW §2.1](AUTH_REVIEW.md)
17. 🔴 M — **Session refactor, without encryption.** Move the session into the main process, delete the tokens, drop the `token` parameter from ~68 IPC channels. Behaviour-neutral and independently testable — do it before any encryption work. → [OFFLINE_AUTH_DESIGN §9.2](OFFLINE_AUTH_DESIGN.md)
18. 🔴 L — **Encrypt the database at rest.** SQLCipher, DEK wrapped by password + recovery code, mandatory recovery-code confirmation at setup, and the §7 migration for existing installs. The single highest-value change in the repo. → [OFFLINE_AUTH_DESIGN §3–7](OFFLINE_AUTH_DESIGN.md), [AUTH_REVIEW §2.6](AUTH_REVIEW.md)
19. 🟠 M — **Lock states** (idle, sleep, quit) **and `biometric_lock` implemented for real or removed.** Shipping an inert security toggle is worse than shipping none. → [AUTH_REVIEW §2.5, §2.8](AUTH_REVIEW.md)

## Phase 3 — Delete the dead weight

Independently shippable, and it shrinks everything downstream — fewer files to type, test, sign, and package.

20. 🟡 M — **Delete `src/server/`** — 1,877 orphaned LOC, 10 removable dependencies (**−15 MB**), and `db.pdf` (684 KB, still tracked) goes with it. → [ONLINE_MODE_REMOVAL §2](ONLINE_MODE_REMOVAL.md)
21. 🟢 S — **Delete the zero-caller code:** `src/api/axios.ts`, `googleLoginElectron.tsx`, the `login:google` handler and channel, and `journalService.chat` / `getUploadUrl` / `getMediaUrl`. → [ONLINE_MODE_REMOVAL §5](ONLINE_MODE_REMOVAL.md), [NETWORK_AUDIT §1.3–1.4](NETWORK_AUDIT.md)
22. 🟡 S — **Remove the forgot-password link, route, and page.** Verified still linked from the login screen; it always fails. The only user-visible casualty of the current state. → [ONLINE_MODE_REMOVAL §6.1](ONLINE_MODE_REMOVAL.md)
23. 🟢 S — **Collapse the 44 `mode === 'online'` branches**, adding the stale-`localStorage` coercion in the *same* commit or a legacy install routes into deleted code. → [ONLINE_MODE_REMOVAL §3, §7](ONLINE_MODE_REMOVAL.md)
24. 🟡 M — **Retire the `authMode` parameter** — 151 references across 25 files. Mechanical but positional: remove it from a service and its handler in lockstep, one service at a time. Safe to defer. → [ONLINE_MODE_REMOVAL §4](ONLINE_MODE_REMOVAL.md)
25. 🟢 S — **Move renderer-only libraries to `devDependencies`.** They ship twice today — once minified in the 2.6 MB bundle, once as raw source in `app.asar`. **−80 MB**, one line per package. → [BUNDLE_SIZE_PLAN §2.3](BUNDLE_SIZE_PLAN.md)

## Phase 4 — Make the quality gates real

26. 🟠 M — **Type the IPC bridge.** `electron.d.ts` omits `minimize`/`maximize`/`close` that `preload.js` does expose; that single gap accounts for a large share of the 131 typecheck errors. → [PRODUCTION_READINESS §2](PRODUCTION_READINESS.md)
27. 🟠 S — **Clear the rest, then remove `continue-on-error` from CI.** 131 typecheck errors and 106 lint problems today; until this lands CI cannot block a regression. → [.github/workflows/ci.yml](../.github/workflows/ci.yml)
28. 🟠 S — **Extend ESLint to `electron/**/*.js`.** All main-process JS is currently neither linted nor type-checked. → [TECHNICAL_DEBT §1.3](TECHNICAL_DEBT.md)
29. 🔴 L — **Deepen test coverage** to journal CRUD, the AI worker, and migrations, plus a Playwright e2e for launch → write → search. → [PRODUCTION_READINESS §2](PRODUCTION_READINESS.md)

## Phase 5 — Production operations

30. 🟠 S — **Wire up the update UI.** `autoUpdater` emits `update:available` / `:progress` / `:downloaded` and **nothing in the renderer listens** (verified). Updates install silently. → [PRODUCTION_READINESS §2](PRODUCTION_READINESS.md)
31. 🟠 M — **Crash reporting.** Zero visibility into production failures; anything network-bound needs explicit opt-in here. → [PRODUCTION_READINESS §2](PRODUCTION_READINESS.md)
32. 🟠 M — **A real logger** with levels, rotation, and redaction, replacing 106 `console.log` calls. → [TECHNICAL_DEBT §4.3](TECHNICAL_DEBT.md)
33. 🟠 S — **Add a Content-Security-Policy.** Verified absent. Cheap, and it turns "we make no external requests" into an enforced invariant. → [NETWORK_AUDIT §4.1](NETWORK_AUDIT.md)
34. 🟠 S — **Handle the offline first run.** A 274 MB model pull is required to finish setup; document it and fail gracefully instead of stalling. → [NETWORK_AUDIT §1.2](NETWORK_AUDIT.md)
35. 🟢 S — **`sandbox: true` on both BrowserWindows.** `contextIsolation` and `nodeIntegration` are already correct. → [PRODUCTION_READINESS §4](PRODUCTION_READINESS.md)

## Phase 6 — Act on what the benchmarks found

> Measurement is done: eleven stages cover the database, the AI pipeline, vector search, retrieval quality, Whisper, startup, the renderer and packaging. The old items 37–39 are complete and moved to §0. What remains here is the work those measurements produced.

36. 🟡 S — **Commit the benchmark harness.** `scripts/bench/` (11 stages), `scripts/run-bench.mjs`, and `docs/benchmarks/` are all still untracked. Until this lands, every "before" number exists on one machine only and no after/before comparison can be anchored. → [benchmarks/README](benchmarks/README.md)
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
53. 🟡 S — **Repo hygiene** — the 0-byte `electron/services/chat.js`, the duplicate `dist` / `dist-electron` entries in `.gitignore`, and the root `test-color-db.js`. All three verified still present. → [TECHNICAL_DEBT §3](TECHNICAL_DEBT.md)
54. 🟡 S — **Tighten catch blocks** — `unknown` plus narrowing, routed to a central error handler, instead of ~95 catch-alls. → [TECHNICAL_DEBT §4.4](TECHNICAL_DEBT.md)
55. 🟡 S — **Convert `src/utils/electronUtils.js` to TypeScript** — the only JS file in an otherwise-TS directory. → [TECHNICAL_DEBT §4.6](TECHNICAL_DEBT.md)
56. 🟡 M — **Settle the import-extension policy** and align AGENTS.md with TECHNICAL_DEBT §4.5, which currently contradict each other. → [PRODUCTION_READINESS §4](PRODUCTION_READINESS.md)
57. 🟡 S — **Finish the dependency trim** — `chart.js` vs `recharts`, `date-fns` vs `dayjs`, and `react-hot-toast` vs the in-house `ToastContext` (still imported in 3 files). → [TODO §High](TODO.md)
58. 🟢 M — **Accessibility** — 72 aria attributes across 166 buttons, and exactly one `prefers-reduced-motion` rule in a heavily animated app. No focus-trap or skip-link pattern. → [PRODUCTION_READINESS §4](PRODUCTION_READINESS.md)
59. 🟢 S — **`CONTRIBUTING.md` and `CHANGELOG.md`.** → [PRODUCTION_READINESS §4](PRODUCTION_READINESS.md)
60. 🟢 S — **User-facing data deletion and uninstall cleanup.** NSIS leaves `%APPDATA%/MindSage` behind; for a journaling app "delete everything" should be explicit. → [PRODUCTION_READINESS §4](PRODUCTION_READINESS.md)

## Phase 10 — Structural bets

Each is a real architecture decision, not a cleanup. Schedule deliberately.

61. 🟡 M — **Drop or shrink FFmpeg** — 81 MB for one job (audio → 16 kHz mono WAV). Check whether `MediaRecorder` can produce that directly before building custom binaries. **−65 to −81 MB.** → [BUNDLE_SIZE_PLAN §2.2](BUNDLE_SIZE_PLAN.md)
62. 🔴 M — **Fetch the Whisper model on first use** instead of bundling 77 MB. Decide together with item 34 — it adds a network dependency to an otherwise-offline feature. → [BUNDLE_SIZE_PLAN §3.1](BUNDLE_SIZE_PLAN.md)
63. 🔴 L — **Replace Qdrant with `sqlite-vec`** — deletes a 77 MB binary, a spawned process, the port-allocation dance, the `synced_to_qdrant` state machine, and the debug viewer. → [BUNDLE_SIZE_PLAN §3.2](BUNDLE_SIZE_PLAN.md)

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

**Totals by severity:** 16 🔴 · 22 🟠 · 16 🟡 · 9 🟢.

**The short version.** Phases 0 and 1 are about twenty items, nearly all `S`, and they remove every known data-loss path, the worst latency cliff, and ~145 MB — before a single architectural decision is required. Phase 2 is the product's actual promise. Everything after that is a real roadmap rather than a sprint.
