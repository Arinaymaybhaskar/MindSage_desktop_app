# MindSage — Benchmark comparison

**Before:** `phase-1-2026-10-20` (2026-10-20T10:19:37.725Z, `359a3c29`)
**After:** `phase-2-2026-10-31` (2026-10-31T16:27:43.244Z, `abbf66eb`)

Both runs are from `Intel(R) Core(TM) i5-9300H CPU @ 2.40GHz`, 8 cores. 

> ## ⚠ 80 measurements got worse
>
> | Section | Measurement | Change |
> | --- | --- | --- |
> | Database | `gallery.top` | **11.6× slower** |
> | Database | `gallery.random` | **10.7× slower** |
> | Database | `dashboard.monthlyScores` | **10.6× slower** |
> | Database | `dashboard.monthlyScores` | **7.8× slower** |
> | Database | `list.deepPage` | **6.9× slower** |
> | AI pipeline | `embed.short` | **5.3× slower** |
> | Database | `list.dateFiltered` | **4.7× slower** |
> | Chat RAG | `rag.2.embedding` | **4.7× slower** |
> | Database | `list.dateFiltered` | **4.4× slower** |
> | Database | `list.page1` | **4.2× slower** |
> | Database | `gallery.all` | **4.1× slower** |
> | Database | `dashboard.recent` | **4.1× slower** |
> | Database | `gallery.all` | **3.9× slower** |
> | Database | `contention.listWhileWorkerWrites` | **3.9× slower** |
> | Database | `dashboard.allTimeScores` | **3.8× slower** |
> | Database | `list.deepPage` | **3.8× slower** |
> | Database | `contention.listWhileWorkerWrites` | **3.8× slower** |
> | Database | `gallery.random` | **3.6× slower** |
> | Database | `entry.byId` | **3.5× slower** |
> | Database | `contention.listWhileWorkerWrites` | **3.4× slower** |
> | Database | `dashboard.allTimeScores` | **3.4× slower** |
> | Chat RAG | `rag.4.answerGeneration` | **3.3× slower** |
> | Database | `list.deepPage` | **3.2× slower** |
> | Database | `dashboard.monthlyScores` | **3.2× slower** |
> | Database | `list.page1` | **3.2× slower** |
> | Database | `write.create` | **3.1× slower** |
> | Database | `dashboard.data` | **3.1× slower** |
> | Speech-to-text | `transcribe.long` | **3.1× slower** |
> | Speech-to-text | `transcribe.short` | **3× slower** |
> | Speech-to-text | `transcribe.medium` | **3× slower** |
> | Database | `dashboard.allTimeScores` | **2.9× slower** |
> | AI pipeline | `embed.medium` | **2.9× slower** |
> | Database | `dashboard.stats` | **2.8× slower** |
> | Database | `export.everything` | **2.7× slower** |
> | Database | `list.page1` | **2.6× slower** |
> | Database | `dashboard.data` | **2.6× slower** |
> | AI pipeline | `embed.title` | **2.5× slower** |
> | Chat RAG | `rag.total` | **2.5× slower** |
> | Speech-to-text | `ffmpeg.conversion` | **2.5× slower** |
> | Database | `entry.byId` | **2.4× slower** |
> | Database | `entry.byId` | **2.4× slower** |
> | Database | `write.create` | **2.4× slower** |
> | Database | `dashboard.recent` | **2.4× slower** |
> | Database | `gallery.all` | **2.4× slower** |
> | Database | `export.everything` | **2.4× slower** |
> | Chat RAG | `rag.3.vectorSearch` | **2.4× slower** |
> | Speech-to-text | `whisper.spawnAndModelLoad` | **2.4× slower** |
> | Vector search | `search.at50000` | **2.3× slower** |
> | Chat RAG | `rag.1.queryPlanning` | **2.3× slower** |
> | Application layer | `ipc.journal:get-recent` | **2.3× slower** |
> | Application layer | `ipc.goal:get-active-goals` | **2.3× slower** |
> | Application layer | `ipc.journal:get-all (50)` | **2.2× slower** |
> | Application layer | `ipc.journal:get-images (top)` | **2.2× slower** |
> | Database | `list.dateFiltered` | **2.1× slower** |
> | Database | `dashboard.stats` | **2.1× slower** |
> | Application layer | `ipc.journal:get-all (10)` | **2.1× slower** |
> | Application layer | `ipc.dashboard:get-stats` | **2.1× slower** |
> | Application layer | `render.journalListScroll` | **2.1× slower** |
> | Database | `dashboard.recent` | **2× slower** |
> | Database | `dashboard.stats` | **2× slower** |
> | Database | `dashboard.data` | **2× slower** |
> | Database | `gallery.random` | **2× slower** |
> | Vector search | `search.at5000` | **1.9× slower** |
> | Database | `gallery.top` | **1.8× slower** |
> | AI pipeline | `ghostText.suggestion` | **1.7× slower** |
> | Vector search | `search.at150` | **1.7× slower** |
> | AI pipeline | `embed.long` | **1.6× slower** |
> | Database | `write.create` | **1.5× slower** |
> | Application layer | `render.dashboardSettle` | **1.5× slower** |
> | AI pipeline | `enrich.metadata.medium` | **1.4× slower** |
> | AI pipeline | `chat.totalGeneration` | **1.4× slower** |
> | Application layer | `media.getImage` | **1.3× slower** |
> | Database | `export.everything` | **1.2× slower** |
> | AI pipeline | `enrich.metadata.short` | **1.2× slower** |
> | AI pipeline | `enrich.summary.medium` | **1.2× slower** |
> | AI pipeline | `enrich.summary.long` | **1.2× slower** |
> | AI pipeline | `enrich.endToEnd.medium` | **1.2× slower** |
> | AI pipeline | `enrich.metadata.long` | **1.1× slower** |
> | AI pipeline | `chat.timeToFirstToken` | **1.1× slower** |
> | Application layer | `ipc.dashboard:get-data` | **1.1× slower** |
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
| `list.page1` | 0.39ms | 1.01ms | 2.6× slower |
| `list.deepPage` | 0.40ms | 1.27ms | 3.2× slower |
| `list.dateFiltered` | 0.43ms | 0.89ms | 2.1× slower |
| `entry.byId` | 0.10ms | 0.24ms | 2.4× slower |
| `dashboard.recent` | 0.12ms | 0.24ms | 2.0× slower |
| `dashboard.stats` | 2.58ms | 5.22ms | 2.0× slower |
| `dashboard.data` | 0.43ms | 0.88ms | 2.0× slower |
| `dashboard.monthlyScores` | 0.13ms | 0.40ms | 3.2× slower |
| `dashboard.allTimeScores` | 0.28ms | 1.08ms | 3.8× slower |
| `gallery.top` | 0.05ms | 0.56ms | 11.6× slower |
| `gallery.random` | 0.30ms | 3.23ms | 10.7× slower |
| `gallery.all` | 0.11ms | 0.43ms | 4.1× slower |
| `write.create` | 0.53ms | 1.64ms | 3.1× slower |
| `export.everything` | 147ms | 170ms | 1.2× slower |
| `contention.listWhileWorkerWrites` | 0.44ms | 1.51ms | 3.4× slower |

### 5,000 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 0.37ms | 1.55ms | 4.2× slower |
| `list.deepPage` | 0.41ms | 1.55ms | 3.8× slower |
| `list.dateFiltered` | 0.36ms | 1.68ms | 4.7× slower |
| `entry.byId` | 0.12ms | 0.28ms | 2.4× slower |
| `dashboard.recent` | 0.12ms | 0.50ms | 4.1× slower |
| `dashboard.stats` | 66ms | 185ms | 2.8× slower |
| `dashboard.data` | 2.62ms | 8.12ms | 3.1× slower |
| `dashboard.monthlyScores` | 0.12ms | 0.94ms | 7.8× slower |
| `dashboard.allTimeScores` | 7.63ms | 26ms | 3.4× slower |
| `gallery.top` | 0.07ms | 0.05ms | **1.4× faster** |
| `gallery.random` | 8.89ms | 32ms | 3.6× slower |
| `gallery.all` | 2.55ms | 9.86ms | 3.9× slower |
| `write.create` | 0.39ms | 0.91ms | 2.4× slower |
| `export.everything` | 1.41s | 3.84s | 2.7× slower |
| `contention.listWhileWorkerWrites` | 0.40ms | 1.59ms | 3.9× slower |

### 50,000 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 0.32ms | 1.05ms | 3.2× slower |
| `list.deepPage` | 0.51ms | 3.50ms | 6.9× slower |
| `list.dateFiltered` | 0.41ms | 1.83ms | 4.4× slower |
| `entry.byId` | 0.12ms | 0.44ms | 3.5× slower |
| `dashboard.recent` | 0.20ms | 0.48ms | 2.4× slower |
| `dashboard.stats` | 1.34s | 2.86s | 2.1× slower |
| `dashboard.data` | 170ms | 433ms | 2.6× slower |
| `dashboard.monthlyScores` | 0.13ms | 1.35ms | 10.6× slower |
| `dashboard.allTimeScores` | 226ms | 662ms | 2.9× slower |
| `gallery.top` | 0.09ms | 0.16ms | 1.8× slower |
| `gallery.random` | 1.11s | 2.23s | 2.0× slower |
| `gallery.all` | 184ms | 435ms | 2.4× slower |
| `write.create` | 0.37ms | 0.57ms | 1.5× slower |
| `export.everything` | 14.63s | 34.83s | 2.4× slower |
| `contention.listWhileWorkerWrites` | 0.44ms | 1.67ms | 3.8× slower |

## AI pipeline

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `embed.title` | 78ms | 192ms | 2.5× slower |
| `embed.short` | 45ms | 236ms | 5.3× slower |
| `embed.medium` | 96ms | 275ms | 2.9× slower |
| `embed.long` | 215ms | 352ms | 1.6× slower |
| `enrich.metadata.short` | 3.85s | 4.75s | 1.2× slower |
| `enrich.metadata.medium` | 3.67s | 5.03s | 1.4× slower |
| `enrich.summary.medium` | 2.28s | 2.64s | 1.2× slower |
| `enrich.metadata.long` | 5.85s | 6.60s | 1.1× slower |
| `enrich.summary.long` | 3.19s | 3.69s | 1.2× slower |
| `enrich.endToEnd.medium` | 8.12s | 9.70s | 1.2× slower |
| `chat.timeToFirstToken` | 1.25s | 1.42s | 1.1× slower |
| `chat.totalGeneration` | 5.79s | 8.17s | 1.4× slower |
| `ghostText.suggestion` | 695ms | 1.17s | 1.7× slower |

## Vector search

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `search.at150` | 1.82ms | 3.16ms | 1.7× slower |
| `search.at5000` | 23ms | 44ms | 1.9× slower |
| `search.at50000` | 192ms | 440ms | 2.3× slower |

## Chat RAG

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `rag.1.queryPlanning` | 5.72s | 13.31s | 2.3× slower |
| `rag.2.embedding` | 52ms | 245ms | 4.7× slower |
| `rag.3.vectorSearch` | 1.37ms | 3.34ms | 2.4× slower |
| `rag.4.answerGeneration` | 6.80s | 22.35s | 3.3× slower |
| `rag.total` | 11.35s | 28.41s | 2.5× slower |

## Application layer

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `ipc.journal:get-all (10)` | 1.30ms | 2.70ms | 2.1× slower |
| `ipc.journal:get-all (50)` | 3.40ms | 7.50ms | 2.2× slower |
| `ipc.journal:get-recent` | 0.80ms | 1.80ms | 2.3× slower |
| `ipc.journal:get-images (top)` | 0.50ms | 1.10ms | 2.2× slower |
| `ipc.dashboard:get-data` | 5.20ms | 5.80ms | 1.1× slower |
| `ipc.dashboard:get-stats` | 79ms | 168ms | 2.1× slower |
| `ipc.goal:get-active-goals` | 0.40ms | 0.90ms | 2.3× slower |
| `media.getImage` | 1.50ms | 1.90ms | 1.3× slower |
| `media.getThumbnail` | 2.60ms | 1.70ms | **1.5× faster** |
| `render.dashboardSettle` | 431ms | 667ms | 1.5× slower |
| `render.journalListScroll` | 11ms | 23ms | 2.1× slower |

## Speech-to-text

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `transcribe.short` | 1.73s | 5.25s | 3.0× slower |
| `transcribe.medium` | 6.46s | 19.68s | 3.0× slower |
| `transcribe.long` | 18.88s | 57.81s | 3.1× slower |
| `ffmpeg.conversion` | 2.97s | 7.43s | 2.5× slower |
| `whisper.spawnAndModelLoad` | 1.28s | 3.06s | 2.4× slower |

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
| Total JavaScript | 1.9 MB | 1.9 MB | unchanged |
| JavaScript (gzipped) | 740.5 KB | 749.9 KB | unchanged |
| `src/components` | 224.0 KB | 246.3 KB | +22.3 KB |

## Not compared

No delta for `startup` — the stage is
absent or skipped on at least one side. Re-run both with the same
`--stages` set if the change could have moved it.
