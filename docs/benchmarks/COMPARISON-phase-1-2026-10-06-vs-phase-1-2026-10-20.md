# MindSage — Benchmark comparison

**Before:** `phase-1-2026-10-06` (2026-10-06T11:45:33.690Z, `46d6657c` +uncommitted)
**After:** `phase-1-2026-10-20` (2026-10-20T10:19:37.725Z, `359a3c29`)

Both runs are from `Intel(R) Core(TM) i5-9300H CPU @ 2.40GHz`, 8 cores. 

> ## ⚠ 37 measurements got worse
>
> | Section | Measurement | Change |
> | --- | --- | --- |
> | Vector search | `search.at50000` | **35.7× slower** |
> | Speech-to-text | `ffmpeg.conversion` | **10× slower** |
> | Vector search | `search.at5000` | **9.7× slower** |
> | Application layer | `media.getThumbnail` | **2.9× slower** |
> | AI pipeline | `embed.title` | **2.8× slower** |
> | Database | `gallery.top` | **1.8× slower** |
> | Database | `gallery.top` | **1.7× slower** |
> | Database | `dashboard.recent` | **1.7× slower** |
> | Database | `export.everything` | **1.6× slower** |
> | Database | `list.deepPage` | **1.6× slower** |
> | Application layer | `ipc.dashboard:get-data` | **1.6× slower** |
> | Database | `dashboard.stats` | **1.5× slower** |
> | Application layer | `ipc.journal:get-all (50)` | **1.5× slower** |
> | Database | `list.dateFiltered` | **1.4× slower** |
> | Database | `contention.listWhileWorkerWrites` | **1.4× slower** |
> | Database | `list.page1` | **1.4× slower** |
> | Database | `entry.byId` | **1.4× slower** |
> | Database | `list.page1` | **1.3× slower** |
> | Database | `write.create` | **1.3× slower** |
> | Database | `list.deepPage` | **1.3× slower** |
> | Database | `list.dateFiltered` | **1.3× slower** |
> | AI pipeline | `chat.timeToFirstToken` | **1.3× slower** |
> | Application layer | `ipc.journal:get-recent` | **1.3× slower** |
> | Application layer | `ipc.journal:get-images (top)` | **1.3× slower** |
> | Application layer | `ipc.dashboard:get-stats` | **1.3× slower** |
> | Database | `list.deepPage` | **1.2× slower** |
> | Database | `contention.listWhileWorkerWrites` | **1.2× slower** |
> | AI pipeline | `ghostText.suggestion` | **1.2× slower** |
> | Database | `dashboard.stats` | **1.1× slower** |
> | Database | `dashboard.allTimeScores` | **1.1× slower** |
> | Database | `list.dateFiltered` | **1.1× slower** |
> | Database | `dashboard.stats` | **1.1× slower** |
> | Database | `contention.listWhileWorkerWrites` | **1.1× slower** |
> | Database | `list.page1` | **1.1× slower** |
> | Database | `entry.byId` | **1.1× slower** |
> | AI pipeline | `enrich.metadata.medium` | **1.1× slower** |
> | Application layer | `render.journalListScroll` | **1.1× slower** |
>
> A win elsewhere does not cancel these. Decide deliberately whether each is
> an acceptable trade, and record the decision in the optimisation log.

| Model | Before | After | Held fixed? |
| --- | --- | --- | --- |
| Chat | `llama3.2:latest` | `llama3.2:latest` | same |
| Embedding | `nomic-embed-text:v1.5` | `nomic-embed-text:v1.5` | same |

## Database

|  | Before | After |
| --- | --- | --- |
| `journal_mode` | `wal` | `wal` |
| `synchronous` | `1` | `1` |
| Full table scans | 12 | 12 |

### 150 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 0.30ms | 0.39ms | 1.3× slower |
| `list.deepPage` | 0.32ms | 0.40ms | 1.2× slower |
| `list.dateFiltered` | 0.32ms | 0.43ms | 1.4× slower |
| `entry.byId` | 0.10ms | 0.10ms | unchanged |
| `dashboard.recent` | 0.11ms | 0.12ms | unchanged |
| `dashboard.stats` | 2.29ms | 2.58ms | 1.1× slower |
| `dashboard.data` | 0.41ms | 0.43ms | unchanged |
| `dashboard.monthlyScores` | 0.13ms | 0.13ms | unchanged |
| `dashboard.allTimeScores` | 0.26ms | 0.28ms | 1.1× slower |
| `gallery.top` | 0.06ms | 0.05ms | **1.2× faster** |
| `gallery.random` | 0.31ms | 0.30ms | unchanged |
| `gallery.all` | 0.11ms | 0.11ms | unchanged |
| `write.create` | 0.41ms | 0.53ms | 1.3× slower |
| `export.everything` | 94ms | 147ms | 1.6× slower |
| `contention.listWhileWorkerWrites` | 0.32ms | 0.44ms | 1.4× slower |

### 5,000 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 0.27ms | 0.37ms | 1.4× slower |
| `list.deepPage` | 0.31ms | 0.41ms | 1.3× slower |
| `list.dateFiltered` | 0.32ms | 0.36ms | 1.1× slower |
| `entry.byId` | 0.09ms | 0.12ms | 1.4× slower |
| `dashboard.recent` | 0.11ms | 0.12ms | unchanged |
| `dashboard.stats` | 59ms | 66ms | 1.1× slower |
| `dashboard.data` | 2.99ms | 2.62ms | **1.1× faster** |
| `dashboard.monthlyScores` | 0.13ms | 0.12ms | unchanged |
| `dashboard.allTimeScores` | 7.19ms | 7.63ms | unchanged |
| `gallery.top` | 0.04ms | 0.07ms | 1.7× slower |
| `gallery.random` | 8.73ms | 8.89ms | unchanged |
| `gallery.all` | 2.78ms | 2.55ms | unchanged |
| `write.create` | 0.38ms | 0.39ms | unchanged |
| `export.everything` | 1.41s | 1.41s | unchanged |
| `contention.listWhileWorkerWrites` | 0.36ms | 0.40ms | 1.1× slower |

### 50,000 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 0.28ms | 0.32ms | 1.1× slower |
| `list.deepPage` | 0.33ms | 0.51ms | 1.6× slower |
| `list.dateFiltered` | 0.31ms | 0.41ms | 1.3× slower |
| `entry.byId` | 0.11ms | 0.12ms | 1.1× slower |
| `dashboard.recent` | 0.12ms | 0.20ms | 1.7× slower |
| `dashboard.stats` | 891ms | 1.34s | 1.5× slower |
| `dashboard.data` | 166ms | 170ms | unchanged |
| `dashboard.monthlyScores` | 0.15ms | 0.13ms | **1.2× faster** |
| `dashboard.allTimeScores` | 225ms | 226ms | unchanged |
| `gallery.top` | 0.05ms | 0.09ms | 1.8× slower |
| `gallery.random` | 1.25s | 1.11s | **1.1× faster** |
| `gallery.all` | 170ms | 184ms | unchanged |
| `write.create` | 0.41ms | 0.37ms | unchanged |
| `export.everything` | 14.17s | 14.63s | unchanged |
| `contention.listWhileWorkerWrites` | 0.37ms | 0.44ms | 1.2× slower |

## AI pipeline

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `embed.title` | 27ms | 78ms | 2.8× slower |
| `embed.short` | 45ms | 45ms | unchanged |
| `embed.medium` | 96ms | 96ms | unchanged |
| `embed.long` | 215ms | 215ms | unchanged |
| `enrich.metadata.short` | 3.90s | 3.85s | unchanged |
| `enrich.metadata.medium` | 3.27s | 3.67s | 1.1× slower |
| `enrich.summary.medium` | 2.29s | 2.28s | unchanged |
| `enrich.metadata.long` | 5.68s | 5.85s | unchanged |
| `enrich.summary.long` | 3.18s | 3.19s | unchanged |
| `enrich.endToEnd.medium` | 7.38s | 8.12s | unchanged |
| `chat.timeToFirstToken` | 961ms | 1.25s | 1.3× slower |
| `chat.totalGeneration` | 5.59s | 5.79s | unchanged |
| `ghostText.suggestion` | 560ms | 695ms | 1.2× slower |

## Vector search

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `search.at150` | 9.31ms | 1.82ms | **5.1× faster** |
| `search.at5000` | 2.41ms | 23ms | 9.7× slower |
| `search.at50000` | 5.37ms | 192ms | 35.7× slower |

## Chat RAG

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `rag.1.queryPlanning` | 5.84s | 5.72s | unchanged |
| `rag.2.embedding` | 2.41s | 52ms | **46.1× faster** |
| `rag.3.vectorSearch` | 18ms | 1.37ms | **13.4× faster** |
| `rag.4.answerGeneration` | 7.75s | 6.80s | **1.1× faster** |
| `rag.total` | 14.37s | 11.35s | **1.3× faster** |

## Application layer

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `ipc.journal:get-all (10)` | 1.50ms | 1.30ms | **1.2× faster** |
| `ipc.journal:get-all (50)` | 2.30ms | 3.40ms | 1.5× slower |
| `ipc.journal:get-recent` | 0.60ms | 0.80ms | 1.3× slower |
| `ipc.journal:get-images (top)` | 0.40ms | 0.50ms | 1.3× slower |
| `ipc.dashboard:get-data` | 3.20ms | 5.20ms | 1.6× slower |
| `ipc.dashboard:get-stats` | 60ms | 79ms | 1.3× slower |
| `ipc.goal:get-active-goals` | 0.40ms | 0.40ms | unchanged |
| `media.getImage` | 1.40ms | 1.50ms | unchanged |
| `media.getThumbnail` | 0.90ms | 2.60ms | 2.9× slower |
| `render.dashboardSettle` | 488ms | 431ms | **1.1× faster** |
| `render.journalListScroll` | 9.60ms | 11ms | 1.1× slower |

## Speech-to-text

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `transcribe.short` | 1.66s | 1.73s | unchanged |
| `transcribe.medium` | 6.29s | 6.46s | unchanged |
| `transcribe.long` | 18.69s | 18.88s | unchanged |
| `ffmpeg.conversion` | 296ms | 2.97s | 10.0× slower |
| `whisper.spawnAndModelLoad` | 1.16s | 1.28s | unchanged |

## Retrieval quality

Corpus of 18 entries, 15 queries, k=5. Higher is better.

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| `precision@1` | 0.467 | 0.467 | unchanged |
| `recall@5` | 0.767 | 0.767 | unchanged |
| `mrr` | 0.644 | 0.644 | unchanged |

## Renderer bundle

|  | Before | After | Change |
| --- | --- | --- | --- |
| Total JavaScript | 1.8 MB | 1.9 MB | +84.6 KB |
| JavaScript (gzipped) | 712.1 KB | 740.5 KB | +28.4 KB |
| `src/components` | 186.9 KB | 224.0 KB | +37.1 KB |
| `qrcode-generator` | 0 B | 21.4 KB | - |

## Not compared

No delta for `startup` — the stage is
absent or skipped on at least one side. Re-run both with the same
`--stages` set if the change could have moved it.
