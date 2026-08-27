# Benchmarks

Recorded performance measurements for MindSage, and the harness that produces
them.

Every number in [PERFORMANCE.md](../PERFORMANCE.md) was arrived at by reading
the code. That is enough to form a hypothesis and not enough to justify a claim
— several of those findings could turn out to be irrelevant in practice, and one
of them is only visible under a condition a single-threaded test never creates.
This directory exists so that optimisation work is judged against measurements
taken the same way before and after.

## Running

```bash
npm run bench                              # headless suite (db, media, size)
npm run bench:full                         # every stage, including AI and startup
npm run bench -- --stages ai,vector        # just the stages named
npm run bench -- --label after-indexes     # a later run, for comparison
npm run bench -- --volumes 150,5000        # skip the slow volume while iterating
npm run bench -- --runs 100                # more samples, tighter percentiles
npm run bench -- --compare baseline --label after-indexes
npm run bench -- --render --label baseline # re-render markdown from stored JSON

# Score an alternative model. Reaches the ai, rag and quality stages; the rest
# ignore it, and bench-quality takes only the embedding model.
npm run bench -- --stages quality --label embeddinggemma --embed-model embeddinggemma
npm run bench -- --stages ai,rag --label qwen --chat-model qwen2.5:7b
```

**A label owns a file.** Re-running a subset of stages under a label that
already exists rewrites that file with `null` for every stage not run. Give each
run its own label and leave `baseline` untouched — the optimisation log quotes
it as the "before" for every issue.

[OPTIMIZATION_LOG.md](OPTIMIZATION_LOG.md) is the ledger: one row per issue with
its measured before, the fix, and its measured after. Start there when picking
up performance work, and fill in the After cell when a fix lands.

[FINDINGS.md](FINDINGS.md) is the hand-written reading of the baseline run,
including the two places where measurement contradicts
[PERFORMANCE.md](../PERFORMANCE.md). [COVERAGE.md](COVERAGE.md) inventories
everything worth benchmarking; all eleven stages are automated now, and the
three remaining gaps are listed there with the reason each stays manual.

Results land in three forms:

- `results/<label>.json` — the full record, including query plans. Committed, so
  a claim made months later can still be traced to the run behind it.
- `<LABEL>.md` — the same run rendered as tables. Generated; re-run rather than
  edit.
- `COMPARISON-<before>-vs-<after>.md` — the delta between two runs, produced by
  `--compare`. It carries the machine line and both model tags, so a figure
  quoted from it comes with the conditions attached.

## What is measured

| Stage | Script | Requires |
| --- | --- | --- |
| `db` | `bench-db.mjs` | nothing — SQLite latency, query plans, write contention |
| `media` | `bench-media.mjs` | nothing — base64 encode cost and payload inflation |
| `size` | `bench-size.mjs` | nothing — bundles, binaries, installers on disk |
| `ai` | `bench-ai.mjs` | **Ollama running** with the app's chat and embedding models |
| `vector` | `bench-vector.mjs` | the bundled Qdrant binary in `resources/` |
| `whisper` | `bench-whisper.mjs` | Windows, the bundled whisper build, and `ggml-tiny.en` |
| `startup` | `bench-startup.mjs` | a **packaged build** (`npm run build`) — launches the real app |
| `app` | `bench-app.mjs` | a packaged build — IPC latency, frame rate, memory, time to interactive |
| `bundle` | `bench-bundle.mjs` | nothing — builds with sourcemaps and attributes bytes per package |
| `rag` | `bench-rag.mjs` | Ollama **and** the Qdrant binary — the four chat stages, timed separately |
| `quality` | `bench-quality.mjs` | Ollama and Qdrant — retrieval **quality**, not speed |

`npm run bench` runs the first three: fast, headless, safe any time.
`npm run bench:full` runs every stage. A stage that cannot run records itself as
skipped with a reason rather than aborting the suite.

**`bench-app.mjs` is the one to understand.** It seeds a throwaway profile at a
chosen entry count, launches the *packaged* app against it with `APPDATA`
redirected and `MS_REMOTE_DEBUG` set, logs in through the real `auth:login`
handler, and drives the renderer over CDP. That is what makes application-level
numbers reproducible and volume-parameterised instead of one-off readings from
whatever happens to be in the developer's own journal.

`bench-quality.mjs` is the odd one out: it measures whether search returns the
*right* entries, scored against the hand-labelled corpus in
`scripts/bench/fixtures/retrieval.mjs`. Every other number in the suite can
improve while this one silently collapses.

## Methodology

**Percentiles, not averages.** A mean hides exactly the stalls users notice: one
400ms freeze among fifty 8ms calls averages to 16ms and looks healthy. p95 is
the number to quote and the number to optimise.

**Three dataset sizes.** 150 / 5,000 / 50,000 entries. A single size cannot
distinguish an indexed lookup from a full table scan, because both are instant
when the table fits in cache. The `Slope` column — cost at 50k divided by cost at
150 — is the actual finding. Flat is an index; linear is a scan.

**Generated data, not the demo seed.** `scripts/seed-demo.mjs` is tuned for
screenshots and tops out near 150 entries.
[`lib/volume.mjs`](../../scripts/bench/lib/volume.mjs) generates the same shape
of data at any size, from a fixed PRNG seed so two runs benchmark identical
databases. Entry text is realistically long: SQLite reads whole pages, so
benchmarking against 20-character entries would understate every scan.

**A throwaway database.** The launcher redirects `APPDATA` to a scratch
directory per child process, so the suite never touches the real journal at
`%APPDATA%/MindSage/mind-sage.db`.

**Real SQL, not copies.** [`lib/capture.mjs`](../../scripts/bench/lib/capture.mjs)
wraps `db.prepare` to record the statements a code path actually executes, then
runs `EXPLAIN QUERY PLAN` on those. Pasting the queries into the benchmark would
have been simpler and would silently drift from `electron/db/*.js` on the first
edit — proving an index works on a query nobody runs is worse than not checking.

**Contention is measured, not assumed.** The main process and
`electron/qdrantWorker.js` open the same database file from two threads.
`lib/writer-worker.mjs` reproduces the worker's write pattern while the main
thread reads, and reports both read latency and `SQLITE_BUSY` count. This is the
only scenario in the suite that reflects what the app does in normal use, and it
behaves nothing like the single-threaded numbers.

**One process per dataset size.** `electron/db/connection.js` opens its database
at module scope from a path fixed at import time, and every db module shares
that instance. A process gets exactly one database, so each size needs its own
child.

**Electron's ABI.** `better-sqlite3` is compiled against Electron, so the DB
benchmarks run under `ELECTRON_RUN_AS_NODE=1`. Plain `node` throws
`NODE_MODULE_VERSION`. Same reason `scripts/run-seed.mjs` exists.

## Reading the results honestly

- Timings are only comparable within the same machine. Each report records CPU,
  core count, RAM and OS in its header; check those match before quoting a
  before/after ratio.
- The `Pragma` table in each report records `journal_mode`, `synchronous` and
  `busy_timeout` as they were at run time. "We enabled WAL" is only a valid
  explanation of a speedup if the before run really was in `delete` mode.
- `bench-ipc.mjs` runs against whatever is in the real database, so its numbers
  carry an entry count and are not comparable across machines.
- A first run on a cold filesystem cache reads high. The suite discards warmup
  iterations, but the very first volume of a session can still be pessimistic.
- The contention table reports how many reads it sampled. It runs to a minimum
  of 30 samples precisely because a time-boxed loop collects hundreds at 150
  entries and about ten at 50,000, where p95 degenerates into "slowest of ten".
  Treat a low sample count as noise, not as a finding.
- `write.create` commits a transaction per call, and in `delete` journal mode
  that is one fsync each. It is the noisiest scenario in the suite and has come
  out non-monotonic across volumes; repeat the run before quoting it.
