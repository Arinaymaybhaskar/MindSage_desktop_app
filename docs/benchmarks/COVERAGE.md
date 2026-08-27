# What should be benchmarked

An inventory of every performance-relevant thing MindSage does, what it would
take to measure each, and what is covered today.

**Status:** everything that can be measured automatically now is. Eleven
benchmark stages cover the database, media, AI pipeline, vector search, chat
RAG, retrieval quality, Whisper, startup, the application layer, the renderer
bundle, and disk footprint.

Three items remain uncovered, all of them deliberately — see
[Deliberately not automated](#deliberately-not-automated) at the end. Each is a
one-shot, environment-dependent measurement where a script would rot faster than
it would pay for itself.

See [FINDINGS.md](FINDINGS.md) for what the numbers mean and
[OPTIMIZATION_LOG.md](OPTIMIZATION_LOG.md) for what is being done about them.

Legend: ✅ automated · ❌ deliberately not automated (see the section at the end)

---

## 1. Local data layer

| # | What | Status | Notes |
| --- | --- | --- | --- |
| 1.1 | SQLite query latency across 150/5k/50k entries | ✅ | `bench-db.mjs` |
| 1.2 | Query plans / scan detection | ✅ | 41 scans confirmed |
| 1.3 | Read latency under worker write contention | ✅ | The sharpest finding so far |
| 1.4 | Write path (`createJournalEntry`) | ✅ | Flat ~6.4ms across volumes |
| 1.5 | IPC round-trip as the renderer sees it | ✅ | `bench-app.mjs` — 34ms p50 for `journal:get-all` at 5k |
| 1.6 | **Data export** (`user:export-data`) | ✅ | Queries every table and zips the result on the main process, so its cost is a freeze. Measured per volume in `bench-db.mjs`. |
| 1.7 | **Database growth on disk** | ✅ | 588 KB / 13.9 MB / 137 MB across the three volumes, plus the real profile's media totals. |

## 2. The AI pipeline

Every item here runs against local Ollama, which serves requests **serially**,
so latencies add rather than overlap. This was the largest gap in the inventory
and is now fully covered; it is also where the largest numbers live.

| # | What | Status | Why it matters |
| --- | --- | --- | --- |
| 2.1 | **Journal enrichment end-to-end** | ✅ **6.85s/entry** | `journal:created` triggers metadata generation, a *second* call for the summary, and an embedding — three serialized model calls per entry ([PERFORMANCE.md §3.1](../PERFORMANCE.md)). Measure wall-clock from create until `ai_metadata_status` and `ai_summary_status` both settle. **This is the flagship AI feature and its latency is entirely unknown.** |
| 2.2 | **Bulk sync / backfill throughput** | ✅ **8.5 min at 5k** | The worker sweeps every unsynced entry on startup (`qdrantWorker.js:546`). At 5,000 entries, an embedding costing 200ms means ~17 minutes of continuous background work — during which §1.3 says every foreground read stalls. **Highest-consequence unmeasured number in the app.** |
| 2.3 | **Embedding latency + throughput** | ✅ 9.75/sec | `generateEmbedding` (nomic-embed-text). Measure per-call latency vs input length, and sustained embeddings/sec. Feeds directly into 2.2. |
| 2.4 | **Chat RAG end-to-end** | ✅ **14.06s p50** | Query planning 43.8%, answer generation 57.9%, embedding 0.2%, vector search 0%. **Retrieval is free; the two generations are the entire cost.** |
| 2.5 | **Time to first token** (streaming chat) | ✅ 410ms p50 | `streamOllamaPrompt`. TTFT is what a user perceives as responsiveness; total generation time is nearly irrelevant by comparison. Report TTFT and tokens/sec, not wall-clock. |
| 2.6 | **`parseAIWithRetries` retry rate** | ✅ 5/5 parsed | The feared retry multiplication does not occur with JSON mode on llama3.2. A negative result worth keeping. |
| 2.7 | **Cold vs warm model** | ✅ 6.40s vs 224ms | The first generation after launch pays model load into RAM. Every benchmark above must report both, or the numbers are meaningless. |
| 2.8 | **Ghost-text suggestion latency** | ✅ 448ms p50 | `generateSuggestion(prompt, maxTokens: 20)` fires while the user types in the journal editor. Its usability budget is a few hundred milliseconds; anything slower is worse than absent. Most latency-sensitive AI path in the app. |
| 2.9 | **`execSync("ollama list")` block** | ✅ | Warm-daemon cost recorded in `bench-ai.mjs`; the whole main process is unresponsive for that duration. A cold daemon is strictly worse. |

## 3. Vector search (Qdrant)

| # | What | Status | Notes |
| --- | --- | --- | --- |
| 3.1 | **`SemanticSearch` latency vs collection size** | ✅ flat, 1.2× over 333× data | Same 150/5k/50k treatment as SQLite. Vector search should stay roughly flat — worth *proving*, since a flat result is a genuine architectural win to point at. |
| 3.2 | **Qdrant process startup time** | ✅ 494ms standalone, 882ms in-app | Spawned during app boot with free-port allocation; a direct contributor to cold start (§4.1). |
| 3.3 | **Qdrant memory footprint** | ✅ 60→386 MB | Resident set vs vector count. Relevant to the "runs entirely on your laptop" claim. |
| 3.4 | **Search quality** | ✅ **precision@1 0.467** | recall@5 0.767, MRR 0.644 over an 18-entry labelled corpus. The top hit is wrong more than half the time — see [FINDINGS.md](FINDINGS.md). |

## 4. Application lifecycle

| # | What | Status | Notes |
| --- | --- | --- | --- |
| 4.1 | **Cold start, step by step** | ✅ 1.34s, Qdrant is 2/3 | `main.js:112` — splash → DB init → Ollama embedding setup → Qdrant spawn → IPC → worker → visible window. Instrument each step; Qdrant spawn is the likely long pole. The number a user forms their first impression from. |
| 4.2 | **First-run setup** | ❌ | A 274 MB model pull — bandwidth-bound, so it measures the network rather than the code. The code half of first run *is* covered. [Why not automated](#42--first-run-model-download). |
| 4.3 | **Memory over a session** | ✅ | Process-tree RSS sampled across three passes over five routes. No growth observed at 5k entries; the ~580 MB baseline is the notable figure. |
| 4.4 | **Renderer frame rate on the journal list** | ✅ **12% frames dropped** | 96 of 787 frames over 16.7ms while scrolling, p95 22ms, 3,867 DOM nodes. Confirms [PERFORMANCE.md §4.1](../PERFORMANCE.md). |
| 4.5 | **Time to interactive after login** | ✅ 542ms | Time until the dashboard's rendered text stops changing, at 5,000 entries. |

## 5. Speech-to-text (Whisper.cpp)

| # | What | Status | Notes |
| --- | --- | --- | --- |
| 5.1 | **Transcription real-time factor** | ✅ RTF 0.11 | RTF = processing time ÷ audio duration, on a fixed sample with `ggml-tiny.en`. Below 1.0 is faster than real time. The standard, portable STT metric — quote RTF, never raw seconds. |
| 5.2 | **Live transcription lag** | ❌ | Needs audio played into the microphone via a virtual audio device. Already bounded by 5.1 and 5.3. [Why not automated](#52--live-transcription-lag). |
| 5.3 | **Process spawn overhead** | ✅ 1.40s fixed | Each transcription spawns a fresh binary. Fixed cost per use, worth knowing before optimising the model. |
| 5.4 | **ffmpeg WebM→WAV conversion** | ✅ 92ms | Runs on every voice note before transcription ([media.js:85](../../electron/methods/media.js#L85)); pure overhead on the critical path. |

## 6. Packaging

| # | What | Status | Notes |
| --- | --- | --- | --- |
| 6.1 | Installer + unpacked size, resource breakdown | ✅ | 248.3 MB installer, of which 73.5 MB is macOS binaries |
| 6.2 | **Renderer bundle composition** | ✅ **zxcvbn is 42%** | 1.9 MB of JavaScript, of which zxcvbn alone is 800 KB. Attributed by decoding sourcemaps — no new build dependency. |
| 6.3 | **Install / first-launch time** | ❌ | Installing and uninstalling on every run, dominated by antivirus and disk state. [Why not automated](#63--installer-run-time). |

---

## Deliberately not automated

These three stay ❌ on purpose. They are recorded here so that "not covered"
never reads as "overlooked".

### 5.2 — Live transcription lag

Measuring the delay between speech and text appearing requires audio played into
the microphone input, which means a virtual audio device (VB-Cable or
equivalent) configured on the machine. That setup is machine-specific, breaks on
any audio-stack change, and cannot run in CI.

**Instead:** the number is already bounded from both ends by measurements that
do run — a fixed 1.40s spawn-and-model-load cost (5.3) and an RTF of 0.11 (5.1).
If a precise figure is ever needed, take it once with a stopwatch and record it
here with the date and the hardware.

### 4.2 — First-run model download

The 274 MB embedding-model pull is bandwidth-bound. Timing it measures the
network, not the code, and doing so repeatedly means deleting and re-pulling a
model on every run.

**Instead:** record the model size as a constant and state the total as a
function of connection speed. The *code* half of first run — creating an empty
database, creating the Qdrant collection, first paint with no data — is covered:
`bench-app.mjs` seeds its own profile and can be pointed at an empty one.

### 6.3 — Installer run time

`MindSage Setup 1.0.0.exe /S` is scriptable, but running it repeatedly installs
and uninstalls the application on the developer's machine, and the result is
dominated by antivirus scanning and disk state rather than anything in the
repository.

**Instead:** measure it once in a clean VM when preparing a release, and record
the figure alongside the installer size in the disk-footprint section.

---

## Recommended order

Ranked by user-perceived impact per unit of effort:

1. **2.1 + 2.2 — journal enrichment and bulk sync throughput.** The AI pipeline
   is the product's headline feature and is completely unmeasured. 2.2 in
   particular could be an hours-long background job that nobody has timed, and
   it compounds with the contention stalls already measured in §1.3.
2. **4.1 — cold start, broken down per step.** Cheap to instrument, and first
   impressions are formed here.
3. **2.5 + 2.8 — time to first token, and ghost-text latency.** The two places
   where a user is actively waiting on a model.
4. **5.1 — Whisper RTF.** One fixed audio file, one portable number.
5. **3.1 — vector search vs collection size.** Likely to come out flat, which
   makes it worth having on record.
6. **1.6 — export.** Easy, headless, and a plausible multi-minute freeze.

## Methodology notes for the AI benchmarks

These cannot be measured the way SQLite was, and pretending otherwise would
produce numbers that do not survive scrutiny.

- **Pin the model and record it.** Latency is meaningless without the model tag,
  quantisation, and whether the GPU was used. Every AI report records the tags it
  ran with for exactly this reason.
- **Model choice is the largest lever on every AI number here** — larger than any
  code change in the ledger. The baseline used `llama3.2:latest` and
  `nomic-embed-text:v1.5` because those are the app's own fallbacks
  ([ollama.js:252](../../electron/methods/ollama.js#L252)), not because they were
  chosen deliberately. `bench-ai.mjs`, `bench-rag.mjs` and `bench-quality.mjs`
  all accept `--chat-model` and `--embed-model` so alternatives can be compared
  rather than argued about.
- **Report cold and warm separately.** Never average across them.
- **Use tokens/sec and RTF, not raw seconds**, wherever a normalised metric
  exists. Raw seconds do not transfer between machines; ratios mostly do.
- **Fix the prompt set.** A committed set of ~20 representative journal entries
  and chat queries, so runs are comparable over time.
- **Expect high variance.** Local inference on a laptop is subject to thermal
  throttling and background load. More runs, and report p50 and p95 — a single
  measurement of a model call is worthless.
- **These numbers are hardware-bound.** They describe this laptop, not the
  software's quality. Improvements must be quoted as before/after on the *same*
  machine, which is exactly what the existing harness already enforces.
