# Baseline findings

Interpretation of [BASELINE.md](BASELINE.md), run 2026-08-25 on an i5-9300H /
16 GB / Windows 11 laptop, covering all seven stages. BASELINE.md is generated and must not be edited; this
document is the hand-written reading of it, including where the measurements
**disagree** with [PERFORMANCE.md](../PERFORMANCE.md).

Measured before any optimisation work. `journal_mode=delete`, `synchronous=2`,
no indexes on `journal_entries`.

## 1. Confirmed — the missing indexes are the dominant cost

`EXPLAIN QUERY PLAN` over the statements the app actually executes reports **41
full table scans per run**, including `SCAN journal_entries` eighteen times
inside `getUserStats` alone.

The scans show up as near-linear growth in latency:

| Scenario | 150 | 5,000 | 50,000 | Growth |
| --- | --- | --- | --- | --- |
| `list.page1` p95 | 0.92ms | 9.54ms | **339ms** | 368× |
| `dashboard.stats` p95 | 3.15ms | 72ms | **1.69s** | 536× |
| `gallery.random` p95 | 0.79ms | 19ms | **1.16s** | 1480× |

`entry.byId` is the control: it resolves through the primary key and stays flat
at 0.12ms across all three sizes. That the same harness reports flat for an
indexed lookup and linear for the others is what makes the slope trustworthy.

At a realistic 3–4 entries per day, a user reaches 5,000 entries in about four
years — where the dashboard already costs 72ms per visit against 3ms today.
50,000 is beyond a decade of daily journalling and is included to establish the
shape of the curve, not to describe a likely user.

**PERFORMANCE.md §1.2 and §1.3 are correct and are the highest-value fix.**

## 2. Confirmed, with a correction — contention blocks, it does not error

Reads stall badly while the worker thread writes to the same file:

| Entries | `list.page1` alone (p95) | Same read while worker writes (p95) |
| --- | --- | --- |
| 150 | 0.92ms | **200ms** |
| 50,000 | 339ms | **523ms** |

At 150 entries that is a ~217× degradation caused entirely by lock contention,
on a dataset small enough that every query is otherwise instant. This is the
single most under-weighted finding in the performance audit: it is invisible to
any single-threaded measurement, and it is the normal operating condition of the
app, since `qdrantWorker.js` writes sync status continuously after every entry.

**The correction:** PERFORMANCE.md §1.1 predicts that concurrent access "throws
`SQLITE_BUSY` instead of waiting" and recommends setting `busy_timeout = 5000`.
The benchmark recorded **zero `SQLITE_BUSY` errors** across all three volumes,
and the pragma table shows `busy_timeout` is **already 5000** — better-sqlite3
sets that default itself, so that line of the recommendation is a no-op.

The failure mode is therefore not an error to catch but latency to eliminate:
readers wait on the writer's exclusive lock rather than failing. The WAL half of
§1.1 stands and is the actual fix.

## 3. Not confirmed at the claimed severity — base64 media

PERFORMANCE.md §2.1 rates synchronous base64 media as 🔴 major on the grounds
that it blocks the main process. The encode cost does not support that weighting:

| Scenario | p95 |
| --- | --- |
| Ten demo images (1.0 MB total) | 3.97ms |
| Ten 3 MB phone photos (30 MB total) | 34ms |
| Five-minute voice note (9.2 MB) | 14ms |

34ms of main-thread blocking for a worst-case dashboard load is real but is an
order of magnitude below the 523ms the DB contention causes. Base64 inflation
measured 1.33×, as expected.

What this benchmark **cannot** see is the other half of §2.1: the cost of moving
a 40 MB data-URL string across the IPC boundary and holding it in renderer
memory. That requires the running app — `npm run bench:ipc` — and until that is
recorded, the severity of §2.1 should be treated as unproven rather than
disproven.

## 4. Confirmed — the installer ships another platform's binaries

| Item | Size |
| --- | --- |
| `MindSage Setup 1.0.0.exe` | 248.3 MB |
| `resources/` total | 233.0 MB |
| — `whisper-bin-x64` | 82.8 MB |
| — `win` | 76.7 MB |
| — `mac` | **73.5 MB** |

73.5 MB of macOS binaries ship inside the Windows installer — 30% of it, for
files that platform can never execute. This matches
[BUNDLE_SIZE_PLAN.md](../BUNDLE_SIZE_PLAN.md) and needs no benchmark to justify,
only an `electron-builder` filter.


## 5. The AI pipeline costs seconds, and one number is alarming

Measured with `llama3.2:latest` and `nomic-embed-text:v1.5`, the models the app
defaults to.

### 5.1 Journal enrichment is ~7 seconds per entry

| Stage | p50 |
| --- | --- |
| Metadata generation (JSON mode) | 2.82s |
| Summary generation | 1.37s |
| Embedding | 96ms |
| **End to end, serialized** | **6.85s** |

Ollama serves requests serially, so the three calls the app fires from
independent event listeners queue behind one another. **PERFORMANCE.md 3.1 is
confirmed**: merging the metadata and summary prompts into one call is worth
roughly 1.4 seconds per entry, and the embedding is not the problem.

### 5.2 The backfill sweep is the highest-consequence number in the app

Sustained embedding throughput is **9.75/sec** (102.5ms each). The worker's
startup sweep (`qdrantWorker.js:546`) re-embeds every entry not marked
`success`:

| Journal size | Projected backfill |
| --- | --- |
| 150 entries | 0.3 min |
| 5,000 entries | **8.5 min** |
| 50,000 entries | **85.5 min** |

Embedding only — the real sweep also does a Qdrant upsert and a SQLite write per
entry, so these are optimistic lower bounds. And section 2 above showed that
those writes stall foreground reads by up to 523ms.

**These two findings compound into the app's worst realistic scenario:** a user
with a few thousand entries who triggers a re-sync faces roughly ten minutes of
background work during which the UI intermittently freezes. Neither measurement
alone reveals it.

### 5.3 Cold model load is 6.4 seconds

| | Wall | Of which model load |
| --- | --- | --- |
| Cold (after unload) | 6.40s | 6.21s |
| Warm | 224ms | 183ms |

A 28x difference. The first AI action after launch — whichever it is — pays
6.4 seconds. Nothing in the app pre-warms the model, so this lands on whichever
feature the user happens to touch first.

### 5.4 Chat is fine; ghost text is borderline

Time to first token is **410ms p50 / 993ms p95** at 60 tok/s. That reads as
responsive, and needs no work.

Ghost text is **448ms p50 / 670ms p95** for a 20-token completion. It fires
while the user types, so at 670ms the suggestion arrives well after the thought
has moved on. Not catastrophic, but below the bar the feature needs to justify
itself.

### 5.5 Not confirmed — the JSON retry concern

COVERAGE.md 2.6 worried that `parseAIWithRetries` might silently multiply
latency through failed JSON parses. Metadata parsed successfully **5/5 at every
entry length**, and summaries were usable 5/5. With `format: "json"` and
llama3.2, the retry path is essentially never taken. This is a real negative
result: no work needed here.

## 6. Vector search is the architecture working

| Collection | Search p50 | Search p95 | Qdrant RSS |
| --- | --- | --- | --- |
| 150 vectors | 3.53ms | 12ms | 60.7 MB |
| 5,000 vectors | 3.02ms | 3.63ms | 90.5 MB |
| 50,000 vectors | 4.37ms | 6.10ms | 386.6 MB |

**1.2x slower for 333x the data.** Set against SQLite's 368x on the same growth,
this is the sharpest contrast in the whole baseline: the bolted-on vector
database scales properly and the hand-written SQL does not.

Costs: 386 MB resident and 753 MB on disk at 50,000 vectors (the disk figure
includes mmap preallocation and overstates real usage at small sizes). That is
the price of the flat line, and it is worth stating alongside it.

Latency only. This says nothing about whether the results are *relevant* —
recall against a labelled query set remains unmeasured (COVERAGE.md 3.4).

## 7. Whisper is fast; its overhead is not

| Clip | Audio | p50 | RTF |
| --- | --- | --- | --- |
| Short | 10.0s | 1.72s | 0.172 |
| Medium | 63.7s | 7.14s | 0.112 |
| Long | 187.5s | 20.69s | 0.110 |

RTF ~0.11 is roughly **9x faster than real time** on CPU with `ggml-tiny.en` —
genuinely good, and nothing to fix.

The finding is the fixed cost: **1.40s to spawn the binary and load the model**,
paid on every single transcription because no whisper process persists. For the
10-second clip that is 81% of the total. Add 92ms of ffmpeg WebM-to-WAV
conversion on the critical path before transcription can even start. Short voice
notes — the common case — are almost entirely overhead.

## 8. Cold start is dominated by Qdrant

Packaged build, three launches:

| Step | p50 |
| --- | --- |
| App ready to splash shown | 118ms |
| Main window created | 19ms |
| Database init | 1ms |
| Ollama embedding setup | 41ms |
| Qdrant spawn issued | 24ms |
| **Qdrant ready** | **882ms** |
| IPC, event bus, worker | 7ms |
| Renderer painted | 268ms |
| **Total** | **1.34s** (1.99s on the first launch of a session) |

**COVERAGE.md 4.1 predicted Qdrant would be the long pole, and it is** — roughly
two thirds of startup, against 268ms for the renderer to paint.

> **Correction.** An earlier single-run reading of this benchmark reported
> Qdrant at 42ms and concluded the renderer accounted for 76% of startup. That
> was wrong: it came from one launch where sub-millisecond steps were filtered
> out of the display and Qdrant was already warm. Three clean runs show the
> opposite. The single-run figure should not be quoted.

1.34s is a good startup time and is not a priority to optimise. It is worth
recording precisely because it is *not* a problem — it bounds where the
remaining work should go.

## Revised priority after the full baseline

The database findings from sections 1-2 still lead, but the AI measurements
change what comes after them:

1. **Indexes on `journal_entries`** — 368x growth, smallest change.
2. **WAL mode** — removes a 217x stall present at every dataset size.
3. **Merge the metadata and summary prompts** — ~1.4s off every entry, and one
   fewer serialized call queued against a serial Ollama.
4. **Bound or defer the backfill sweep** — 8.5 minutes of stalling background
   work at 5,000 entries is the worst realistic user experience in the app.
   Batch it, throttle it, or run it only on explicit request.
5. **Keep a whisper process warm, or skip ffmpeg** — 1.4s of pure overhead on
   every voice note.
6. **Per-platform `extraResources` filters** — 73.5 MB, no runtime risk.

Not worth doing: chat TTFT, cold start, vector search, JSON retry handling. All
four measured fine, and recording that is as useful as recording the failures.

## Priority implied by the database measurements alone

1. **Indexes on `journal_entries`** — largest effect, smallest change, and every
   caching idea downstream depends on it.
2. **WAL mode** — removes a 217× stall that exists at every dataset size,
   including today's.
3. **Per-platform `extraResources` filters** — 73.5 MB, no runtime risk.
4. **`getUserStats` single-pass rewrite** — 1.69s and 18 scans is the worst
   single query in the app, but fixing the indexes first may make it adequate.
5. **Media protocol** — worth doing, but re-measure with `bench:ipc` before
   ranking it against the above.

Re-run `npm run bench -- --label after-<change>` after each, then
`npm run bench -- --compare baseline --label after-<change>`.
