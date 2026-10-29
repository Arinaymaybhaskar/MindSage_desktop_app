# Commands, tests, CI, benchmarks and tooling

Read this before you run or write tests, run a benchmark, touch CI, formatting or lint config, or need the demo-data and screenshot commands.

## Commands

```bash
npm run dev            # Vite dev server + Electron (vite-plugin-electron sets VITE_DEV_SERVER_URL). Normal way to run the app.
npm run build          # vite build && electron-builder → installers in release/
npm run release        # same, with --publish always (used by .github/workflows/release.yml on v* tags)
npm run rebuild        # electron-rebuild -f -w better-sqlite3
npm run postinstall    # runs rebuild automatically; without it better-sqlite3 fails to load at runtime
npm test               # vitest run (pure modules + renderer; needs no native build)
npm run test:db        # *.db.test.js under Electron-as-Node: real SQLite migrations, journal CRUD, backup, trash, profile delete, the sqlite-vec search index and the indexer loop
npm run test:e2e       # builds, then launches the real app (Playwright): sign up, write, wait for AI, search. Needs Ollama; E2E_SKIP_AI=1 skips those steps
npm run test:watch     # vitest
npm run typecheck      # tsc -p tsconfig.app.json --noEmit  (renderer only)
npm run lint           # eslint .
npm run format         # prettier --write .    (format:check for CI-style verification)
npm run tokens -- <session.jsonl>   # token totals, turns and subagent usage by model for a Claude Code transcript (default: newest session)
npm run bench          # SQLite/media/size benchmark suite → docs/benchmarks/results/
npm run bench:ipc      # IPC-boundary benchmark; needs the running app
npm run bench:quick    # db stage, ~25s; the pre-commit hook runs it when runtime code is staged
npm run bench:phase -- <n>   # full suite after Jira release P<n>; needs Ollama, builds first
```

**Running a subset of tests:**

```bash
npx vitest run src/utils/DateFormatter.test.ts   # one file
npx vitest run -t "formats a relative date"       # one test by name
```

## Typecheck, lint and format baseline, and CI

**Typecheck, lint and format are all clean; keep them that way.** `npm run typecheck`, `npm run lint` and `npm run format:check` all report **zero** problems (cleared wholesale in a single pass on 2026-08-28, replacing a long-standing baseline of 131 typecheck errors and 106 lint problems), and `npm test` must be green. **A non-zero typecheck or lint exit means you broke something**, so treat it as a real failure rather than comparing counts against a tolerated baseline.

CI ([.github/workflows/ci.yml](../../.github/workflows/ci.yml)) **blocks on all four**: typecheck, lint, `format:check` and `npm test` (job `Typecheck & Lint`). The `continue-on-error: true` that made the first two report-only is gone, so a red `Typecheck & Lint` check means what its name says. The same file has two more jobs: `Database & index tests` (`npm run test:db`) and `End-to-end (Windows)` (`npm run test:e2e` with Ollama on a CPU runner). The pre-commit hook catches the same problems earlier (see **Husky and lint-staged** below), but it can be bypassed with `--no-verify`; CI cannot.

## Test conventions

Tests sit next to the module they cover (`electron/methods/jsonStream.test.js`, `src/api/journalService.test.ts`). [vitest.config.ts](../../vitest.config.ts) is deliberately separate from [vite.config.ts](../../vite.config.ts) so `vite-plugin-electron` doesn't boot during tests; it uses jsdom, `globals: true`, `src/test/setup.ts`, and `pool: "threads"` (the default `forks` pool hangs on newer Node). `electron/**` is in the include list, but only **pure modules** are testable there — anything importing `better-sqlite3` or `electron` won't load. The include list also covers the `.claude/hooks/*.test.mjs` tests.

## Database tests are a second project

better-sqlite3 is built for Electron's ABI, so anything that touches the real database is a `*.db.test.js` file, excluded from `npm test` and run by `npm run test:db` under `ELECTRON_RUN_AS_NODE=1` ([vitest.db.config.ts](../../vitest.db.config.ts), [scripts/run-db-tests.mjs](../../scripts/run-db-tests.mjs); it needs the `electron-rebuild` build from `postinstall`). They use `electron/db/dbTestUtils.js` and choose their folder through `MS_DB_DIR` / `MS_USER_DATA_DIR` before the first import, because `connection.js` opens the database as a side effect. `searchIndex.db.test.js` and `services/indexer.db.test.js` run the real sqlite-vec extension and the indexer loop with a fake embedding function (no Ollama needed). A new migration needs a case in `migrations.db.test.js`.

## End-to-end

The end-to-end run is [scripts/e2e/run.mjs](../../scripts/e2e/run.mjs); it waits on the app's own events, never a sleep. The e2e run also checks that no log file contains the entry it wrote (see [logging.md](logging.md)).

## Benchmarks

**Benchmarks come in two kinds, kept apart everywhere** (file location, `kind` field, website): a **quick** run on every commit that stages runtime code, from the pre-commit hook, never committed and never blocking; and a **full** run at the end of every roadmap phase (a Jira release, P1, P2, ...), committed. Finishing a phase is not done until `npm run bench:phase -- <n>` has run and its results are committed with a run-index row. See [docs/benchmarks/README.md](../benchmarks/README.md#two-kinds-of-run).

Targeted runs: `npm run bench -- --label after-<change>` then `npm run bench -- --compare baseline --label after-<change>`. [docs/benchmarks/BASELINE.md](../benchmarks/BASELINE.md) is **generated — never hand-edit it**; [FINDINGS.md](../benchmarks/FINDINGS.md) is the hand-written reading, and it **corrects PERFORMANCE.md in two places**. Trust the measurements over the audit prose.

## Husky and lint-staged

husky's [pre-commit hook](../../.husky/pre-commit) does three things. First `gitleaks protect --staged` (warns and passes through if gitleaks isn't installed — install it for real protection; allowlist false positives in `.gitleaks.toml`). Then `lint-staged`, which runs `prettier --write` on staged files and `eslint --fix --max-warnings=0` on staged `.ts`/`.tsx`, re-staging whatever it fixes. A commit that would introduce a lint error or a warning is refused. Last, the quick benchmark when runtime code is staged (never blocks; skip one commit with `MS_SKIP_BENCH=1`).

ESLint's flat config ([eslint.config.js](../../eslint.config.js)) matches only `**/*.{ts,tsx}`, which is why the `lint-staged` globs in `package.json` send `.js`/`.mjs` to Prettier alone; adding them to the ESLint glob makes it fail with "no matching configuration". **That means the whole main process is formatted but never linted** — `electron/**` and `scripts/**` are plain `.js`/`.mjs`, so `npm run lint` says nothing about them. Widening the config is a real (unclaimed) improvement, not a one-line glob change: those files would report fresh errors on their first run.

Prettier (`.prettierrc`: LF, double quotes, semicolons, trailing commas, 80 columns) was applied across the repo in one sweep after years of drift, so `format:check` passes; `.prettierignore` excludes all `*.md` (so `CLAUDE.md` and `docs/agent/*.md` are exempt) and `docs/benchmarks/results/` (regenerated by every `npm run bench`), plus build output, `resources/` and `assets/`. [.gitattributes](../../.gitattributes) pins the working tree to LF on every platform, without which `format:check` would pass on the Linux runner and fail on a fresh Windows clone. `.npmrc` sets `engine-strict=true` against the Node 20–24 range in `package.json`; `.nvmrc` pins 20.

## Demo data and screenshots

```bash
npm run seed:demo -- --reset   # populate a demo user (spawns Electron with ELECTRON_RUN_AS_NODE=1 — better-sqlite3 is built against Electron's ABI)
npm run dev:capture            # terminal 1: dev app with CDP on 127.0.0.1:9222
npm run capture                # terminal 2: marketing screenshots → public/screenshots/v2/ at 2x
npm run gen:images             # regenerate demo imagery
```

Capture drives the real Electron window over CDP — pointing a browser at the Vite URL gives you no `window.electron`, so every IPC call rejects and the app renders empty.
- `npm run test:coverage` writes a v8 coverage report (text summary plus `coverage/index.html`). Local only, not in CI; `test:db` is not covered.
