# Optimisation log

One row per performance issue, carrying its measured **before**, the fix, and
its measured **after**. This is the ledger the whole benchmark harness exists to
fill in.

- [BASELINE.md](BASELINE.md) — generated numbers, do not edit
- [FINDINGS.md](FINDINGS.md) — what the baseline means
- [COVERAGE.md](COVERAGE.md) — what is measured and what is not
- **This document** — what we did about it

Every "before" below is from the run labelled `baseline`
([results/baseline.json](results/baseline.json), 2026-08-25, i5-9300H / 16 GB /
Windows 11). **Numbers are only comparable on the same machine.** Check the
machine line in both reports before quoting any ratio.

## Workflow after every performance change

```bash
# 1. Make the change.
# 2. Re-measure under a label naming it. Never reuse `baseline` - the whole
#    ledger quotes that one run as its "before".
npm run bench:full -- --label after-indexes

# 3. Generate the delta table:
npm run bench -- --compare baseline --label after-indexes
#    -> docs/benchmarks/COMPARISON-baseline-vs-after-indexes.md

# 4. Regenerate the board and the dashboard from the stored runs:
npm run bench:board

# 5. Write the parts a machine cannot: add a row to the run index below, and
#    the reasoning into that issue's own section. Never type a number - the
#    board reads every figure out of results/ so none of them can go stale.
```

The status board below is **generated**. Its numbers come from
[issues.json](issues.json), which names *where* each issue's metric lives rather
than what it measured. Editing the board by hand is pointless: the next
`npm run bench:board` overwrites it. For a live, multi-machine view with
trends, see mindsage-web's `/benchmarks` page, fed by `npm run bench -- --publish`.

Only the stages that can move need re-running. A database change needs
`npm run bench -- --label after-indexes` (about six minutes rather than forty);
a model swap needs `--stages ai,rag,quality`; a renderer change needs
`--stages app,bundle`.

**Three ways to invalidate your own numbers**, all of them easy:

- **Comparing across machines.** Every report carries a machine line. Check that
  both sides match before quoting a ratio.
- **Comparing across model tags.** Swapping the chat or embedding model moves
  the AI numbers further than any code change in this ledger. The run index
  carries a model column for exactly this reason: an AI comparison is only valid
  with the models held fixed, and a model swap is itself a change to log.
- **Overwriting a label.** Running a subset of stages under an existing label
  rewrites that file with `null` for every stage not run. Use a new label and
  merge deliberately.

---

## Run index

One row per measurement run, oldest first. This is the chronological record —
the status board says where each issue stands *now*, this says how it got there.
Add a row here before touching anything else.

| Date | Label | What changed | Chat / embed model | Headline | Record |
| --- | --- | --- | --- | --- | --- |
| 2026-08-25 | `baseline` | Nothing — first measurement of the tree as it stands | `llama3.2:latest` / `nomic-embed-text:v1.5` | Seventeen issues opened. Worst: `dashboard.stats` 1.69s, chat reply 14.06s, reads stalling 200ms under worker writes | [results/baseline.json](results/baseline.json) → [BASELINE.md](BASELINE.md) |
| 2026-08-27 | `baseline-extra` | Nothing — ran the four stages the baseline predated (`app`, `bundle`, `rag`, `quality`) and merged them into the `baseline` record, so one file now covers all eleven | `llama3.2:latest` / `nomic-embed-text:v1.5` | Reproduced the ad-hoc figures the log already quoted: chat 14.00s p50, precision@1 0.467, 1.9 MB of JavaScript | [results/baseline-extra.json](results/baseline-extra.json) |
| 2026-08-27 | `embeddinggemma` | Embedding model swapped, retrieval-quality stage only. **Measured, not shipped** | — / `embeddinggemma` | precision@1 0.467 → **0.733**, recall@5 → 0.933, MRR → 0.867. Costs −20% embedding throughput and +347 MB on disk. See [SEARCH-1](#candidate-measured-embeddinggemma) | [results/embeddinggemma.json](results/embeddinggemma.json) → [comparison](COMPARISON-baseline-vs-embeddinggemma.md) |

| 2026-08-30 | `phase0-before` | Nothing — all eleven stages on `main` at `1c21eb0`, as the before for Phase 0. The app stage measured error envelopes: the harness still passed the retired `"offline"` argument to `auth:login` | `llama3.2:latest` / `nomic-embed-text:v1.5` | The DB, AI and size figures stand. Use `phase0-app-before` for the app stage | [results/phase0-before.json](results/phase0-before.json) → [PHASE0-BEFORE.md](PHASE0-BEFORE.md) |
| 2026-08-30 | `phase0-app-before` | Nothing — app stage only, re-run once the harness passed credentials correctly | `llama3.2:latest` / `nomic-embed-text:v1.5` | `dashboard:get-stats` 67ms p95 over IPC at 5k, journal list 1.8% dropped frames, RSS stable across three route passes | [results/phase0-app-before.json](results/phase0-app-before.json) → [PHASE0-APP-BEFORE.md](PHASE0-APP-BEFORE.md) |
| 2026-08-30 | `phase0-after` | Phase 0 database work: the schema moved behind an ordered migration list applied against `PRAGMA user_version`, a `VACUUM INTO` snapshot is taken before the first migration, and `PRAGMA foreign_keys` moved to connection scope so the Qdrant worker's own handle finally enforces it | — | **No effect detectable.** Every delta against `phase0-before` was smaller than this machine's noise on the day. See [PHASE0](#phase0--schema-migrations-and-worker-foreign-keys-measured-no-detectable-effect) | [results/phase0-after.json](results/phase0-after.json) → [comparison](COMPARISON-phase0-before-vs-phase0-after.md) |
| 2026-08-30 | `phase0-ai` | Same Phase 0 database work, measured on the AI write path — enrichment goes through the Qdrant worker, whose connection now enforces foreign keys | `llama3.2:latest` / `nomic-embed-text:v1.5` | Unchanged against the baseline: enrichment end-to-end **6.63s** (was 6.85s), TTFT **374ms** (was 410ms), ghost text **349ms** (was 448ms), vector search 1.9–4.1ms | [results/phase0-ai.json](results/phase0-ai.json) |
| 2026-08-30 | `phase0-rag` | Nothing — ran the RAG and retrieval-quality stages to confirm the pipeline still behaves | `llama3.2:latest` / `nomic-embed-text:v1.5` | RAG total **11.66s** p50 / 14.13s p95 (baseline 14.06s). Retrieval quality reproduced the baseline **exactly**: recall@5 0.767, MRR 0.644, precision@1 0.467 | [results/phase0-rag.json](results/phase0-rag.json) |
| 2026-08-30 | `phase0-app-after`, `phase0-app-after-2` | Phase 0 renderer work: the dashboard settles its five reads independently and never logs out on a failed fetch | `llama3.2:latest` / `nomic-embed-text:v1.5` | Time to interactive 367ms before, 391ms and 336ms for two runs of the same after code. No measurable effect at 5,000 entries | [phase0-app-after.json](results/phase0-app-after.json), [phase0-app-after-2.json](results/phase0-app-after-2.json) |
| 2026-10-06 | `main-2026-10-06` | Nothing in `electron/` or `src/` since `phase0-before` (the diff is empty). All eleven stages on a fresh packaged build of `main` plus the harness fix, after a Windows update from 10.0.26200 to 10.0.26300 | `llama3.2:latest` / `nomic-embed-text:v1.5` | The same code across the OS update: the 50k dashboard and gallery scenarios are flat; the list scenarios moved 1.2–2.1× faster, within this suite's run-to-run noise. Two AI outliers, see below | [results/main-2026-10-06.json](results/main-2026-10-06.json) → [MAIN-2026-10-06.md](MAIN-2026-10-06.md) · [vs phase0-before](COMPARISON-phase0-before-vs-main-2026-10-06.md) |
| 2026-10-06 | `after-extraresources` | MASTER_TODO item 12: per-platform `extraResources`, so the Windows build no longer ships `resources/mac`. Size stage only | — | Installer 248.3 → **217.7 MB** (−30.6 MB). PKG-1's target needs item 13 too | [results/after-extraresources.json](results/after-extraresources.json) → [AFTER-EXTRARESOURCES.md](AFTER-EXTRARESOURCES.md) |
| 2026-10-06 | `phase-0-2026-10-06` | **Full run closing Phase 0** (`npm run bench:phase -- 0`, kind `full`). Phase 0 as merged in #18 and #19: versioned migrations with a `VACUUM INTO` backup, the renderer data-loss fixes, Quick Capture auth sync, per-platform `extraResources`, and `MS_USER_DATA_DIR`. Startup now launches on a copy of the real profile instead of the real one | `llama3.2:latest` / `nomic-embed-text:v1.5` | **No change attributable to Phase 0**, as expected: it touched no query. 50k DB scenarios flat except `dashboard.allTimeScores` (214 to 362ms, noise-sized; no query changed). Total to visible window 1.58 to **1.35s**; the slower "Qdrant started" step (434 to 847ms) is the first launch reading a freshly copied `qdrant-data` from a cold cache. All 3 startup runs complete. Retrieval quality identical (recall@5 0.767, MRR 0.644, P@1 0.467). Installer **217.6 MB**. This is the "before" for Phase 1 | [results/phase-0-2026-10-06.json](results/phase-0-2026-10-06.json) → [PHASE-0-2026-10-06.md](PHASE-0-2026-10-06.md) · [vs main-2026-10-06](COMPARISON-main-2026-10-06-vs-phase-0-2026-10-06.md) |
| 2026-10-06 | `after-wal-and-indexes` | Phase 1 items 7, 8 and 9 (DB-1, DB-2, DB-4): WAL with `synchronous = NORMAL`; migration 4 adds `journal_entries(user_id, is_deleted, created_at)`; the list queries take tags from a correlated subquery and compare `created_at` bare. DB stage only | — | Full table scans **41 to 12**. At 50k: `list.page1` 246ms to **0.30ms**, `list.dateFiltered` 153ms to **0.30ms**, `dashboard.recent` 258ms to **0.13ms**, reads under worker writes 436ms to **0.41ms** (0.41ms at 150 too), `write.create` 6.8ms to **0.38ms**. `dashboard.stats` 1.63s to 899ms and `dashboard.data` 603 to 170ms, still above target: they aggregate every row. `gallery.random` unchanged (DB-5). The index alone made the list queries **slower** (5k `list.page1` 9 to 98ms, caught by the commit's quick run), because the old `GROUP BY` plan then sorted every entry twice; items 7 and 9 only work together | [results/after-wal-and-indexes.json](results/after-wal-and-indexes.json) → [AFTER-WAL-AND-INDEXES.md](AFTER-WAL-AND-INDEXES.md) |
| 2026-10-06 | `after-packaging-trims` | MASTER_TODO 13 (PKG-1): `public/**` out of `files`, `dist/screenshots` and `better-sqlite3/{deps,src}` excluded, one locale, maximum NSIS compression. Size and bundle stages only | — | Packaged output **791.8 to 717.5 MB** (the plan predicted −72 MB). Installer **217.6 to 198.4 MiB**; PKG-1's 180 MiB target still needs one of the structural cuts (BUNDLE_SIZE_PLAN §3). JS bundle unchanged, so PKG-2 is unchanged too | [results/after-packaging-trims.json](results/after-packaging-trims.json) → [AFTER-PACKAGING-TRIMS.md](AFTER-PACKAGING-TRIMS.md) |

All runs are on the same hardware: i5-9300H / 16 GB / Windows 11. **The OS build
changed on the way:** everything up to 2026-08-30 ran on 10.0.26200, and the
2026-10-06 runs on 10.0.26300, so the comparison report opens with a "different
machines" warning. `main-2026-10-06` measured the same code as `phase0-before`
across that update, and the large DB scenarios came out flat, so the update is
not a confound worth correcting for. Run-to-run noise is: single scenarios move
up to about 2× between identical runs.

**Two AI outliers in `main-2026-10-06`.** `generate.coldStart` read 64.89s: a
single sample, the first load of a 2 GB model from disk straight after `ollama
serve` started on a cold file cache (Ollama 0.20.5). `ghostText` p95 read 9.42s,
but that is one sample in 15 (p95 = max at n=15), most likely a model reload; the
p50 improved, 448 to 335ms. The `rag.2.embedding` and `rag.3.vectorSearch` p95s
are the same kind of outlier.

**One to investigate:** in two of the three `startup` runs on 2026-10-06 the log
has no "Qdrant started" step or anything after it, yet the renderer still
signalled ready. Tracked as MASTER_TODO 35b.

Runs of unchanged code (`phase0-before`, `phase0-app-before`,
`main-2026-10-06`) are listed in `baselineLabels` in [issues.json](issues.json),
so the status board never shows them as an "after".

---

## Status board

<!-- BOARD:START - generated by npm run bench:board, do not edit -->

_Generated from `results/` by `npm run bench:board` — every figure below is
read out of a stored run, so none of them can go stale. Before = `baseline`
(2026-08-25).
After = the most recent run that measured each metric. 16 runs on record._

| ID | Issue | Key metric | Before | Target | After | Change | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **DB-1** | No indexes on `journal_entries` | `list.page1` p95 @ 50k | **586ms** | < 20ms | **0.30ms** _(after-wal-and-indexes)_ | 1979.6× faster | ✅ fixed and verified |
| **DB-2** | No WAL — writers block readers | read p95 under worker writes @ 150 | **174ms** | < 10ms | **0.41ms** _(after-wal-and-indexes)_ | 428.4× faster | ✅ fixed and verified |
| **DB-3** | `getUserStats` does 18 table scans | `dashboard.stats` p95 @ 50k | **2.02s** | < 100ms | **899ms** _(after-wal-and-indexes)_ | 2.2× faster | 🔴 improved, target not met |
| **DB-4** | `DATE()`/`DATETIME()` defeat the index | `list.dateFiltered` p95 @ 50k | **186ms** | < 20ms | **0.30ms** _(after-wal-and-indexes)_ | 613.1× faster | ✅ fixed and verified |
| **DB-5** | `ORDER BY RANDOM()` in the gallery | `gallery.random` p95 @ 50k | **1.07s** | < 50ms | **1.07s** _(after-wal-and-indexes)_ | unchanged | 🔴 re-measured, no change |
| **AI-1** | Metadata + summary are two serial calls | `enrich.endToEnd` p50 | **6.85s** | < 5.00s | **6.48s** _(phase-0-2026-10-06)_ | 1.1× faster | 🔴 improved, target not met |
| **AI-2** | Unbounded backfill sweep | projected backfill @ 5k entries | **8.5 min** | — | **7.9 min** _(phase-0-2026-10-06)_ | — | 🔴 re-measured, no change |
| **AI-3** | No model pre-warm | first generation after launch | **6.40s** | < 1.00s | **5.88s** _(phase-0-2026-10-06)_ | 1.1× faster | 🟠 improved, target not met |
| **AI-4** | Ghost text slower than its budget | `ghostText` p95 | **670ms** | < 300ms | **565ms** _(phase-0-2026-10-06)_ | 1.2× faster | 🟠 improved, target not met |
| **STT-1** | Whisper respawns per transcription | fixed overhead per call | **1.40s** | < 200ms | **1.26s** _(phase-0-2026-10-06)_ | 1.1× faster | 🟠 improved, target not met |
| **STT-2** | ffmpeg conversion on the critical path | per voice note | **92ms** | eliminate | **86ms** _(phase-0-2026-10-06)_ | 1.1× faster | 🟡 improved, target not met |
| **PKG-1** | mac binaries inside the Windows build | installer size | **248.3 MB** | < 180.0 MB | **198.4 MB** _(after-packaging-trims)_ | 1.3× faster | 🟠 improved, target not met |
| **CHAT-1** | RAG runs two serial generations | chat reply p50 | **14.00s** | < 6.00s | **10.65s** _(phase-0-2026-10-06)_ | 1.3× faster | 🔴 improved, target not met |
| **SEARCH-1** | Retrieval ranks the wrong entry first | precision@1 | **0.467** | > 0.750 | **0.467** _(phase-0-2026-10-06)_ | unchanged | 🔴 re-measured, no change |
| **UI-1** | Journal list drops frames while scrolling | frames over 16.7ms | **2.4%** | < 2.0% | **1.9%** _(phase-0-2026-10-06)_ | −21% | ✅ fixed and verified |
| **PKG-2** | zxcvbn dominates the JS bundle | share of JS | **42.2%** | < 5.0% | **43.2%** _(after-packaging-trims)_ | +2% worse | 🟠 regressed |
| **MEDIA-1** | base64 media over IPC | `media.getImage` round-trip | **1.30ms** | — | **0.90ms** _(phase-0-2026-10-06)_ | 1.4× faster | ✅ closed, no action |

Legend: 🔴 high · 🟠 moderate · 🟡 low · ✅ done and verified

<!-- BOARD:END -->

---

## DB-1 — Missing indexes on `journal_entries`

**Before**

| Scenario (p95) | 150 | 5,000 | 50,000 | Growth |
| --- | --- | --- | --- | --- |
| `list.page1` | 0.92ms | 9.54ms | **339ms** | 368× |
| `list.deepPage` | 1.58ms | 18ms | 319ms | 202× |
| `dashboard.recent` | 0.42ms | 12ms | 259ms | 622× |
| `gallery.top` | 0.13ms | 1.47ms | 174ms | 1296× |
| `entry.byId` *(control)* | 0.15ms | 0.15ms | 0.16ms | 1.0× |

`EXPLAIN QUERY PLAN` reports **41 full table scans per run**. The hottest table
in the app has no index at all; `journal_entry_tags` is indexed on `tag_id` but
not on `journal_entry_id`, which is the side every `LEFT JOIN` keys on.

**Root cause** — [connection.js:337-352](../../electron/db/connection.js#L337-L352)
indexes goals, categories, chats and tags, but nothing on `journal_entries`.

**Fix**

```sql
CREATE INDEX IF NOT EXISTS idx_je_user_deleted_created
  ON journal_entries(user_id, is_deleted, created_at);
CREATE INDEX IF NOT EXISTS idx_jet_journal_entry_id
  ON journal_entry_tags(journal_entry_id);
```

**Verify** — `npm run bench -- --label after-indexes`, then compare. Success is
the `Slope` column collapsing toward 1× and `SCAN j` becoming
`SEARCH j USING INDEX` in the query-plan table.

**After** — _not yet measured._

---

## DB-2 — No WAL mode; writers block readers

**Before**

| Entries | reads sampled | read p50 | read p95 | read max | `SQLITE_BUSY` |
| --- | --- | --- | --- | --- | --- |
| 150 | 74 | 24ms | **200ms** | 443ms | 0 |
| 5,000 | 30 | 96ms | 363ms | 402ms | 0 |
| 50,000 | 30 | 363ms | 523ms | 529ms | 0 |

The same `list.page1` that costs 0.92ms alone costs **200ms p95** at 150 entries
while the worker writes — a ~217× degradation on a dataset small enough that
nothing else is slow. This is the app's normal operating condition: the main
process and `qdrantWorker.js` hold separate connections to one file.

**Correction to the audit** — [PERFORMANCE.md §1.1](../PERFORMANCE.md) predicts
`SQLITE_BUSY` errors and recommends `busy_timeout = 5000`. Zero busy errors were
recorded, and `busy_timeout` is **already 5000** because better-sqlite3 sets that
default itself. That half of the recommendation is a no-op. The failure mode is
waiting, not failing.

**Fix**

```js
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
```

**Verify** — the pragma table in the new report must read `wal` / `1`, and the
contention p95 must drop. If the pragma table still says `delete`, any speedup
has some other cause and the claim is invalid.

**After** — _not yet measured._

---

## DB-3 — `getUserStats` runs eight aggregates and 18 scans

**Before** — `dashboard.stats` p95: 3.15ms @ 150 → 72ms @ 5,000 → **1.69s** @
50,000. The single worst query in the app. Its plan contains `SCAN
journal_entries` eight times plus subquery and CTE scans, 18 in total.

Note the 50,000 figure rests on **13 samples** (the 20s per-scenario budget cut
it short), so treat `1.69s` as approximate. The 5,000 figure — 72ms, n=50 — is
the solid one and is already the visible cost.

**Fix** — combine the simple aggregates into one pass; cache the result until
the next journal write. Do this *after* DB-1: indexes may make it adequate on
their own, and re-measuring will show whether the rewrite is still needed.

**After** — _not yet measured._

---

## DB-4 — `DATE()` / `DATETIME()` wrappers defeat the index

**Before** — `list.dateFiltered` p95: 0.74ms → 3.08ms → **167ms** (225×).

**Root cause** — [journal.js:157-168](../../electron/db/journal.js#L157-L168)
filters `DATE(j.created_at) >= DATE(?)` and orders by `DATETIME(j.created_at)`.
Wrapping a column in a function makes it non-sargable, so no index on
`created_at` can ever be used — including the one DB-1 adds.

**Fix** — store `created_at` as plain ISO text and compare the raw column.

**After** — _not yet measured._

---

## DB-5 — `ORDER BY RANDOM()` in the dashboard gallery

**Before** — `gallery.random` p95: 0.79ms → 19ms → **1.16s** (1480×, the steepest
slope in the suite). Its plan shows eleven separate `SCAN journal_entries`.

**Root cause** — [dashboard.js:41-47](../../electron/db/dashboard.js#L41-L47)
sorts the whole image-bearing set to pick ten. `journal.js` already does the
right thing (sample by random offset over an indexed count) — the dashboard just
needs to match it.

**After** — _not yet measured._

---

## AI-1 — Enrichment fires two serial generations per entry

**Before** (`llama3.2:latest`, `nomic-embed-text:v1.5`)

| Stage | p50 | p95 |
| --- | --- | --- |
| Metadata (JSON mode) | 2.82s | 3.45s |
| Summary | 1.37s | 2.40s |
| Embedding | 96ms | 108ms |
| **End to end** | **6.85s** | **7.03s** |

Ollama serves serially, so the two generations queue even though the app fires
them from independent `journal:created` listeners
([ollama.js:255](../../electron/methods/ollama.js#L255) and
[ollama.js:305](../../electron/methods/ollama.js#L305)).

**Fix** — one prompt returning title, mood score, mood tags *and* summary in a
single JSON object. Saves roughly 1.4s per entry and removes one queued call.

**Guard rail** — metadata currently parses **5/5** and summaries are usable
**5/5**. A merged prompt asks the model for more at once; if the parse rate
drops, the retry path costs a full generation and the change is a net loss.
Re-measure the rate, not just the latency.

**After** — _not yet measured._

---

## AI-2 — The backfill sweep is unbounded

**Before** — sustained embedding throughput **9.75/sec** (102.5ms each):

| Journal size | Projected backfill |
| --- | --- |
| 150 entries | 0.3 min |
| 5,000 entries | **8.5 min** |
| 50,000 entries | **85.5 min** |

Embedding only. The real sweep also does a Qdrant upsert and a SQLite write per
entry — and DB-2 shows those writes stall foreground reads by up to 523ms.

**This is the app's worst realistic scenario.** A user with a few thousand
entries who triggers a re-sync gets roughly ten minutes of background work with
an intermittently frozen UI. Neither DB-2 nor AI-2 reveals it alone.

**Root cause** — [qdrantWorker.js:546](../../electron/qdrantWorker.js#L546)
selects every entry not marked `success` and processes the lot, with no batch
limit, no throttle, no attempt counter, and no backoff. An entry that fails
permanently is retried on every sweep forever.

**Fix** — batch with a ceiling per pass, yield between batches, add an attempt
counter with backoff and a terminal state after N failures. DB-2 (WAL) reduces
the foreground damage independently and should land first.

**After** — _not yet measured._

---

## AI-3 — No model pre-warm

**Before** — cold generation **6.40s** (of which 6.21s is model load) against
**224ms** warm. A 28× difference paid by whichever AI feature the user touches
first after launch.

**Fix options** — issue a tiny warm-up generation once services are ready, or
raise Ollama's `keep_alive`. The trade is memory held resident against a 6-second
first-use stall.

**Note** — cold and warm are single samples each. Re-measure with more runs
before quoting a precise figure; the order of magnitude is what matters.

**After** — _not yet measured._

---

## AI-4 — Ghost text is slower than its usability budget

**Before** — **448ms p50 / 670ms p95** for a 20-token completion, fired while the
user types ([ollama.js:435](../../electron/methods/ollama.js#L435)).

A completion that lands 670ms after the keystroke arrives once the thought has
moved on. This is a product question as much as a performance one: either get it
under ~300ms, or reconsider whether inline completion is the right shape for the
feature.

**After** — _not yet measured._

---

## STT-1 — Whisper respawns for every transcription

**Before**

| Clip | Audio | p50 | RTF |
| --- | --- | --- | --- |
| Short | 10.0s | 1.72s | 0.172 |
| Medium | 63.7s | 7.14s | 0.112 |
| Long | 187.5s | 20.69s | 0.110 |
| *Spawn + model load* | — | **1.40s** | — |

Transcription itself is good: RTF ~0.11, about **9× faster than real time** on
CPU. The problem is the fixed 1.40s to spawn `whisper-cli.exe` and load
`ggml-tiny.en`, paid every time because no process persists
([whisper.js:93](../../electron/methods/whisper.js#L93)). For a 10-second voice
note — the common case — that is **81% of the total cost**.

**Fix** — keep a warm whisper process, or use the bundled `whisper-server.exe`
that already ships in `resources/whisper-bin-x64/Release/`.

**After** — _not yet measured._

---

## STT-2 — ffmpeg conversion before transcription

**Before** — **92ms p50** per voice note, converting WebM to 16 kHz mono
([media.js:85-107](../../electron/methods/media.js#L85-L107)).

Small next to STT-1, but it is pure overhead on the critical path and may be
removable by recording at 16 kHz mono directly in the renderer.

**After** — _not yet measured._

---

## PKG-1 — The Windows installer ships macOS binaries

**Before**

| Item | Size |
| --- | --- |
| `MindSage Setup 1.0.0.exe` | **248.3 MB** |
| `resources/` | 233.0 MB |
| — `whisper-bin-x64` | 82.8 MB |
| — `win` | 76.7 MB |
| — `mac` | **73.5 MB** |
| `dist/` (renderer) | 13.5 MB |
| `dist-electron/` | 435 KB |

30% of the installer is macOS binaries the platform cannot execute. The
`extraResources` filter in [package.json](../../package.json) is `**/*` with no
platform split.

**Fix** — per-platform `extraResources` filters. No runtime risk.

**After** — _not yet measured._

---

## MEDIA-1 — base64 media over IPC (closed: not a problem)

**Before**

| Scenario | p95 | Payload |
| --- | --- | --- |
| Ten demo images | 3.97ms | 1.0 MB |
| Ten 3 MB photos | 34ms | **30 MB** |
| Five-minute voice note | 14ms | 9.2 MB |

[PERFORMANCE.md §2.1](../PERFORMANCE.md) rates this 🔴 major for blocking the
main process. **The encode cost does not support that weighting** — 34ms of
blocking for a worst-case dashboard is an order of magnitude below what DB-2
costs. Base64 inflation measured 1.33×, as expected.

**The other half is now measured.** `bench-app.mjs` drives the real
`media:getImage` channel against the packaged app:

| Channel | p50 | Payload |
| --- | --- | --- |
| `media:getImage` | **2.20ms** | 122.5 KB |
| `media:getThumbnail` | **1.70ms** | 4.7 KB |

Crossing the IPC boundary costs about two milliseconds for a full-size image.
The thumbnail cache added earlier already keeps grid views small, so the 30 MB
worst case is hypothetical rather than a path the app actually takes.

**Closed with no action.** [PERFORMANCE.md §2.1](../PERFORMANCE.md)'s 🔴 rating
is not supported by measurement, and the custom-protocol rewrite it proposes
would be effort spent on a two-millisecond cost. Revisit only if a future
feature loads many full-resolution images at once.


---

## CHAT-1 — the RAG pipeline runs two serial generations

**Before** — a chat reply costs **14.06s p50 / 17.75s p95**, split as:

| Stage | p50 | Share |
| --- | --- | --- |
| 1. Query planning (LLM) | 6.16s | **43.8%** |
| 2. Embedding | 32ms | 0.2% |
| 3. Vector search | 4.50ms | **0.0%** |
| 4. Answer generation (LLM) | 8.15s | **57.9%** |
| **Total** | **14.06s** | |

**The finding is the shape, not the total.** Retrieval — the part that looks
like the complicated bit — accounts for two tenths of one percent. The entire
cost is two sequential LLM calls against an Ollama instance that serves requests
one at a time.

This also reframes AI-1: the app makes *two* generations per chat reply and
*two* per journal entry, and in both cases the second one exists because the
first produced structured metadata rather than an answer.

**Fix directions** — in rough order of payoff:

1. Skip stage 1 when it cannot help. Query planning decides whether context is
   needed and extracts a time filter; for most queries a cheap heuristic would
   reach the same conclusion, and the call could be reserved for ambiguous ones.
2. Stream stage 4. Time to first token on the non-RAG path is already 410ms, so
   a reply that *starts* quickly would feel dramatically better even at the same
   total.
3. Shrink the stage 4 prompt. Five retrieved entries are pasted in whole;
   passing summaries would cut prompt-eval time.

**Do not** optimise retrieval. It is already free.

**After** — _not yet measured._

---

## SEARCH-1 — semantic search ranks the wrong entry first

**Before**, over an 18-entry hand-labelled corpus
([fixtures/retrieval.mjs](../../scripts/bench/fixtures/retrieval.mjs)):

| Metric | Score |
| --- | --- |
| recall@5 | 0.767 |
| MRR | 0.644 |
| **precision@1** | **0.467** |

The right entry usually appears somewhere in the top five, but **the top hit is
wrong more than half the time**. Concrete misses:

| Query | Returned | Should have returned |
| --- | --- | --- |
| "What have I written about my knee?" | the dentist entry | the running-injury entry |
| "What is my mum up to these days?" | a friend moving away | the pottery class |
| "Anything about cooking or food I made" | the pottery class | the dal recipe |
| "Have I been to any medical appointments?" | a river walk | the dentist |

These are not label disputes — they are wrong answers to unambiguous questions.
Semantic search feeds the chat feature's retrieval, so CHAT-1's expensive
pipeline is spending fourteen seconds reasoning over the wrong entries.

**One hypothesis already tested and rejected.** `nomic-embed-text` is documented
as expecting `search_document:` / `search_query:` task prefixes, which the app
does not apply. Adding them made every metric **worse** (precision@1 0.467 →
0.333, MRR 0.644 → 0.544), so Ollama's packaging evidently applies them already.
Recorded here so nobody spends an afternoon rediscovering it.

**Remaining directions** — untested, in order of cheapness:

1. Embed a title-plus-summary rather than the full entry. Long entries dilute
   the vector; queries are short. The asymmetry is the usual culprit.
2. Check the similarity threshold. `SemanticSearch` defaults to 0.5
   ([qdrant.js:23](../../electron/methods/qdrant.js#L23)) — worth confirming what
   that excludes.
3. Consider hybrid retrieval: keyword matching would trivially get the knee
   query right, and combining the two is standard practice.

Re-run `node scripts/bench/bench-quality.mjs` after each attempt. The corpus is
fixed, so the scores are directly comparable.

### Candidate measured: `embeddinggemma`

Same corpus, same queries, same Qdrant configuration — only the embedding model
differs.

| Metric | `nomic-embed-text:v1.5` | `embeddinggemma` | Change |
| --- | --- | --- | --- |
| recall@5 | 0.767 | **0.933** | +22% |
| MRR | 0.644 | **0.867** | +35% |
| **precision@1** | 0.467 | **0.733** | **+57%** |
| Queries with a wrong top hit | 8 of 15 | **4 of 15** | −4 |

Four of the previously wrong answers are now right, including the ones that were
plainly wrong rather than arguable: "what have I written about my knee" now
returns the running-injury entry rather than the dentist, and "what is my mum up
to" returns the pottery class rather than a friend moving away.

**It is a drop-in.** `embeddinggemma` is also 768-dimensional, so the Qdrant
collection config (`size: 768`,
[qdrantManager.js:118](../../electron/services/qdrantManager.js#L118)) is
unchanged and no schema migration is needed. Existing vectors would still have
to be re-embedded, because vectors from two different models are not comparable.

**The costs, both real:**

| | `nomic-embed-text:v1.5` | `embeddinggemma` |
| --- | --- | --- |
| Model on disk | 274 MB | 621 MB (**+347 MB**) |
| Sustained throughput | 9.44/sec | 7.53/sec (**−20%**) |
| Projected backfill, 5k entries | 8.8 min | **11.1 min** |
| Projected backfill, 50k entries | 88.3 min | 110.7 min |

So the swap trades roughly 2.3 extra minutes of *background* re-embedding at
5,000 entries, and 347 MB of the user's disk, for the top search result being
right 73% of the time instead of 47%. Given that AI-2 already calls for the
backfill to be bounded and throttled regardless, and that retrieval feeds the
chat feature's entire context, that looks like a good trade — but it is a
product judgement, not a benchmark result.

**Sample-size caveat.** The corpus is 18 entries and 15 queries, so
precision@1 moving from 0.467 to 0.733 is 7 correct top hits becoming 11. Four
queries. The *direction* is consistent across all three metrics and the
qualitative misses that disappeared were unambiguous, so the conclusion is
sound; the precise percentages are soft and should not be quoted as though they
came from a large evaluation set.

**Not shipped.** The model is pulled and measured; the application still uses
`nomic-embed-text:v1.5`, which is hardcoded in three places:

- [ollama.js:542](../../electron/methods/ollama.js#L542) — `generateEmbedding`
- [qdrantWorker.js:31](../../electron/qdrantWorker.js#L31) — the worker's own embed call
- [OllamaSetup.js:118](../../electron/services/OllamaSetup.js#L118) — the first-run availability check

Switching also requires re-embedding every existing entry, which is the AI-2
sweep. Sequence the two together.

**After** — _candidate measured, change not yet applied._

Raw results: the `quality` stage of
[results/baseline.json](results/baseline.json) (nomic) ·
[results/embeddinggemma.json](results/embeddinggemma.json) ·
[side-by-side comparison](COMPARISON-baseline-vs-embeddinggemma.md)

Reproduce either side with:

```bash
npm run bench -- --stages quality --label embeddinggemma --embed-model embeddinggemma
npm run bench -- --compare baseline --label embeddinggemma
```

---

## UI-1 — the journal list drops frames while scrolling

**Before**, scrolling a 5,000-entry list in the packaged app:

| Frame p50 | Frame p95 | Dropped | DOM nodes |
| --- | --- | --- | --- |
| 5.60ms | **22ms** | **96 of 787 (12.2%)** | 3,867 |

A dropped frame is any frame taking longer than 16.7ms. Twelve percent is
visible stutter, and it grows with scroll depth because
[journalList.tsx](../../src/pages/journalList.tsx) appends pages and never
unmounts a card — so both the DOM and the set of framer-motion `layout`-animated
nodes grow without bound.

**Confirms [PERFORMANCE.md §4.1](../PERFORMANCE.md).**

**Fix** — virtualize the list (react-window / virtua), or at minimum drop
`layout` from the list items and keep animation to enter/exit.

**After** — _not yet measured._

---

## PKG-2 — zxcvbn is 42% of the JavaScript bundle

**Before**

| Owner | Size | Share of JS |
| --- | --- | --- |
| **zxcvbn** | **800.0 KB** | **42.1%** |
| chart.js | 194.8 KB | 10.3% |
| react-dom | 170.3 KB | 9.0% |
| src/components | 170.0 KB | 8.9% |
| src/pages | 133.1 KB | 7.0% |
| framer-motion | 81.2 KB | 4.3% |
| gsap | 68.3 KB | 3.6% |

Total JavaScript is 1.9 MB (728 KB gzipped) plus 91.5 KB of CSS.

**zxcvbn is a password-strength estimator**, and most of its weight is the
bundled dictionary of common passwords. It is used on registration and password
change — two screens a user visits approximately once.

**Fix** — lazy-load it on the screens that need it, so it leaves the initial
bundle entirely. That single change removes over 40% of the JavaScript.

Also worth noting: `chart.js` at 194.8 KB sits alongside `recharts`, which
[PRODUCTION_READINESS.md](../PRODUCTION_READINESS.md) §3 already flags as a
duplicate charting dependency. This measurement puts a number on it.

**After** — _not yet measured._

---

## Measured fine — do not optimise

Recording what is already good is as useful as recording what is not, because it
bounds where effort should go.

| Area | Measured | Verdict |
| --- | --- | --- |
| Chat time to first token | 410ms p50 / 993ms p95, 60 tok/s | Responsive. Leave alone. |
| Vector search vs collection size | 3.53ms → 4.37ms p50 from 150 → 50,000 vectors (**1.2× for 333× the data**) | The architecture working. Set against SQLite's 368×, this is the strongest thing in the codebase. |
| Cold start | **1.34s** total (1.99s first launch of a session) | Good. Qdrant is 882ms of it — the long pole, as predicted — but the total does not justify work. |
| Whisper transcription | RTF 0.11, ~9× real time | Good; the overhead is STT-1, not the inference. |
| JSON metadata parsing | 5/5 at every entry length | [COVERAGE.md §2.6](COVERAGE.md)'s retry-multiplication concern is not real with `format: "json"`. |
| SQLite write path | 6.67 / 6.96 / 6.36ms p95, flat across volumes | Inserts are not a problem. |
| `entry.byId` | 0.12ms flat | Primary-key lookups are fine — and serve as the harness's control. |
| IPC round-trip overhead | ~25ms on top of the query at 5k entries | Real but small next to the query itself. The bridge is not the bottleneck. |
| Media over IPC | 2.20ms for a 122 KB image | Closes MEDIA-1. |
| Memory across a session | ~580 MB, no growth over three route cycles | No leak evident. The baseline is high for a journalling app but stable. |
| Data export | Measured per volume in `bench-db.mjs` | Included in the suite so a regression would show. |

## Still unmeasured

Everything that can reasonably be automated now is — eleven benchmark stages.
Three items remain deliberately manual, with the reasoning recorded in
[COVERAGE.md](COVERAGE.md#deliberately-not-automated):

| Gap | Why it is not automated |
| --- | --- |
| Live transcription lag | Needs audio played into the mic through a virtual audio device. Already bounded by RTF 0.11 and the 1.40s spawn cost. |
| First-run model download | 274 MB, bandwidth-bound. Measures the network, not the code. |
| Installer run time | Would install and uninstall the app on every run; dominated by antivirus and disk state. |

---

## PHASE0 — schema migrations and worker foreign keys (measured: no detectable effect)

**Not an optimisation.** Phase 0 exists to stop data loss, and this entry is
here because the house rule is that anything which could move a number gets
measured. Two changes could plausibly have:

- `initDatabase()` no longer re-executes the whole schema on every launch. It
  now runs only the migrations newer than `PRAGMA user_version`, which on an
  up-to-date install is none.
- `PRAGMA foreign_keys = ON` moved from inside the DDL to connection scope.
  The main connection always had it; the **Qdrant worker's connection never
  did**, so the worker has been writing with foreign keys off and now pays for
  enforcement on every insert. That was the change most likely to cost
  something, and the reason for measuring rather than assuming.

**Result: nothing measurable, and the run cannot resolve anything smaller than
roughly an order of magnitude.**

The first comparison looked alarming — `write.create` 2.1× slower and
`contention.listWhileWorkerWrites` 2.0× slower at 50,000 entries, which fits
the foreign-key hypothesis neatly. It also showed contention **2.5× faster** at
5,000 entries from the same code, which does not fit anything.

So the same branch was measured against itself
([comparison](COMPARISON-phase0-after-vs-phase0-after-2.md)). With **no code
change at all**, that run reports `write.create` **13.2× slower** and
`contention.listWhileWorkerWrites` **5.2× slower**, and twelve measurements
"got worse". The noise floor is larger than every delta in the real
before/after, so the real before/after establishes nothing in either direction.

### The AI and app stages, added 2026-08-30

The database stage was only ever half the question, so the rest was measured
too, with Ollama running.

**AI write path — unchanged.** Enrichment is the code that writes through the
Qdrant worker's connection, so it is where enabling foreign keys there would
show up. End-to-end enrichment came in at **6.63s** against a 6.85s baseline,
time to first token at **374ms** against 410ms, ghost text at **349ms**
against 448ms. Nothing regressed; the foreign-key cost is invisible next to
model inference.

**Retrieval quality reproduced the baseline exactly** — recall@5 0.767, MRR
0.644, precision@1 0.467, the same three figures to three decimals. That is
worth recording for its own sake: it shows the harness is deterministic where
it should be, which is what makes the timing noise below credible as noise
rather than as an unexplained regression.

**Dashboard IPC — no measurable effect either.** Collapsing five sequential
reads into one `Promise.allSettled` batch moved `dashboard settle` from 367ms
to 391ms, and a second run of the same code gave 336ms. The before sits
between the two afters. Per-channel round trips, which the change does not
touch at all, moved as much as 43% between identical runs.

There is a reason not to expect much here, worth writing down so nobody tries
this again expecting a win: the five calls are handled by a single main
process running synchronous SQLite. Issuing them together removes the
round-trip latency from stacking, but the queries still execute one after
another. `dashboard:get-stats` alone is 66–74ms of the total and is
unaffected. The change was made so a failed read stops ending the session;
treat any speed effect as incidental.

Two caveats on the record, so nobody quotes these numbers later:

- The machine was busy. Electron, a Vite dev server and Qdrant had been
  starting and stopping across the session. A trustworthy figure needs a quiet
  machine and repeated runs.
- Two harness bugs had to be fixed before the app stage could measure
  anything at all. Both were leftovers from MASTER_TODO item 24 retiring
  `authMode`: `auth:login` was being called with a stale `"offline"` first
  argument, so every login failed, and every IPC scenario passed the same
  stale argument ahead of the token, so the channels that do not throw were
  timing their `{ error: "Invalid token" }` envelope. `dashboard:get-data`
  read as 0.30ms and 25 bytes. Anyone who ran the app stage between item 24
  landing and this fix got numbers that measured nothing.
- `ollamaList.execSyncBlock` still cannot be measured: the stage skips with
  "ollama CLI not on PATH". The app shells out to `ollama` by name for that
  call, so the same absence would affect the product, which is worth folding
  into MASTER_TODO item 40.
