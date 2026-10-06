# MindSage — Benchmark comparison

**Before:** `phase-0-2026-10-06` (2026-10-06T08:39:27.588Z, `a6797924` +uncommitted)
**After:** `phase-1-2026-10-06` (2026-10-06T11:45:33.690Z, `46d6657c` +uncommitted)

Both runs are from `Intel(R) Core(TM) i5-9300H CPU @ 2.40GHz`, 8 cores. 

> ## ⚠ 11 measurements got worse
>
> | Section | Measurement | Change |
> | --- | --- | --- |
> | Chat RAG | `rag.2.embedding` | **44.1× slower** |
> | Vector search | `search.at150` | **2.8× slower** |
> | Cold start | Initializing localDB | **2× slower** |
> | Database | `gallery.random` | **1.6× slower** |
> | Application layer | `media.getImage` | **1.6× slower** |
> | Database | `gallery.random` | **1.3× slower** |
> | AI pipeline | `enrich.metadata.medium` | **1.2× slower** |
> | Chat RAG | `rag.total` | **1.2× slower** |
> | Cold start | Splash window shown | **1.2× slower** |
> | Database | `gallery.all` | **1.1× slower** |
> | Speech-to-text | `ffmpeg.conversion` | **1.1× slower** |
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
| `journal_mode` | `delete` | `wal` |
| `synchronous` | `2` | `1` |
| Full table scans | 41 | 12 |

### 150 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 0.76ms | 0.30ms | **2.5× faster** |
| `list.deepPage` | 1.11ms | 0.32ms | **3.4× faster** |
| `list.dateFiltered` | 0.62ms | 0.32ms | **2.0× faster** |
| `entry.byId` | 0.16ms | 0.10ms | **1.6× faster** |
| `dashboard.recent` | 0.45ms | 0.11ms | **4.1× faster** |
| `dashboard.stats` | 3.99ms | 2.29ms | **1.7× faster** |
| `dashboard.data` | 0.77ms | 0.41ms | **1.9× faster** |
| `dashboard.monthlyScores` | 0.20ms | 0.13ms | **1.6× faster** |
| `dashboard.allTimeScores` | 0.29ms | 0.26ms | **1.1× faster** |
| `gallery.top` | 0.15ms | 0.06ms | **2.6× faster** |
| `gallery.random` | 2.44ms | 0.31ms | **8.0× faster** |
| `gallery.all` | 0.34ms | 0.11ms | **3.1× faster** |
| `write.create` | 8.35ms | 0.41ms | **20.3× faster** |
| `export.everything` | 101ms | 94ms | unchanged |
| `contention.listWhileWorkerWrites` | 311ms | 0.32ms | **968.1× faster** |

### 5,000 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 9.35ms | 0.27ms | **34.9× faster** |
| `list.deepPage` | 16ms | 0.31ms | **52.4× faster** |
| `list.dateFiltered` | 2.05ms | 0.32ms | **6.5× faster** |
| `entry.byId` | 0.18ms | 0.09ms | **2.0× faster** |
| `dashboard.recent` | 8.74ms | 0.11ms | **78.7× faster** |
| `dashboard.stats` | 63ms | 59ms | unchanged |
| `dashboard.data` | 5.09ms | 2.99ms | **1.7× faster** |
| `dashboard.monthlyScores` | 1.03ms | 0.13ms | **8.0× faster** |
| `dashboard.allTimeScores` | 6.71ms | 7.19ms | unchanged |
| `gallery.top` | 0.92ms | 0.04ms | **21.8× faster** |
| `gallery.random` | 5.62ms | 8.73ms | 1.6× slower |
| `gallery.all` | 2.45ms | 2.78ms | 1.1× slower |
| `write.create` | 7.75ms | 0.38ms | **20.7× faster** |
| `export.everything` | 1.37s | 1.41s | unchanged |
| `contention.listWhileWorkerWrites` | 281ms | 0.36ms | **783.1× faster** |

### 50,000 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 246ms | 0.28ms | **867.8× faster** |
| `list.deepPage` | 259ms | 0.33ms | **798.4× faster** |
| `list.dateFiltered` | 153ms | 0.31ms | **487.1× faster** |
| `entry.byId` | 0.16ms | 0.11ms | **1.5× faster** |
| `dashboard.recent` | 258ms | 0.12ms | **2150.9× faster** |
| `dashboard.stats` | 1.63s | 891ms | **1.8× faster** |
| `dashboard.data` | 603ms | 166ms | **3.6× faster** |
| `dashboard.monthlyScores` | 145ms | 0.15ms | **945.5× faster** |
| `dashboard.allTimeScores` | 362ms | 225ms | **1.6× faster** |
| `gallery.top` | 161ms | 0.05ms | **3415.4× faster** |
| `gallery.random` | 953ms | 1.25s | 1.3× slower |
| `gallery.all` | 156ms | 170ms | unchanged |
| `write.create` | 6.76ms | 0.41ms | **16.6× faster** |
| `export.everything` | 15.99s | 14.17s | **1.1× faster** |
| `contention.listWhileWorkerWrites` | 436ms | 0.37ms | **1188.3× faster** |

## AI pipeline

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `embed.title` | 29ms | 27ms | unchanged |
| `embed.short` | 45ms | 45ms | unchanged |
| `embed.medium` | 95ms | 96ms | unchanged |
| `embed.long` | 215ms | 215ms | unchanged |
| `enrich.metadata.short` | 3.74s | 3.90s | unchanged |
| `enrich.metadata.medium` | 2.80s | 3.27s | 1.2× slower |
| `enrich.summary.medium` | 2.14s | 2.29s | unchanged |
| `enrich.metadata.long` | 5.35s | 5.68s | unchanged |
| `enrich.summary.long` | 3.39s | 3.18s | unchanged |
| `enrich.endToEnd.medium` | 7.01s | 7.38s | unchanged |
| `chat.timeToFirstToken` | 1.03s | 961ms | unchanged |
| `chat.totalGeneration` | 6.86s | 5.59s | **1.2× faster** |
| `ghostText.suggestion` | 565ms | 560ms | unchanged |

## Vector search

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `search.at150` | 3.31ms | 9.31ms | 2.8× slower |
| `search.at5000` | 2.25ms | 2.41ms | unchanged |
| `search.at50000` | 5.74ms | 5.37ms | unchanged |

## Chat RAG

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `rag.1.queryPlanning` | 5.34s | 5.84s | unchanged |
| `rag.2.embedding` | 55ms | 2.41s | 44.1× slower |
| `rag.3.vectorSearch` | 18ms | 18ms | unchanged |
| `rag.4.answerGeneration` | 7.72s | 7.75s | unchanged |
| `rag.total` | 11.97s | 14.37s | 1.2× slower |

## Application layer

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `ipc.journal:get-all (10)` | 11ms | 1.50ms | **7.4× faster** |
| `ipc.journal:get-all (50)` | 12ms | 2.30ms | **5.0× faster** |
| `ipc.journal:get-recent` | 9.90ms | 0.60ms | **16.5× faster** |
| `ipc.journal:get-images (top)` | 1.50ms | 0.40ms | **3.8× faster** |
| `ipc.dashboard:get-data` | 6.50ms | 3.20ms | **2.0× faster** |
| `ipc.dashboard:get-stats` | 66ms | 60ms | **1.1× faster** |
| `ipc.goal:get-active-goals` | 0.40ms | 0.40ms | unchanged |
| `media.getImage` | 0.90ms | 1.40ms | 1.6× slower |
| `media.getThumbnail` | 1.60ms | 0.90ms | **1.8× faster** |
| `render.dashboardSettle` | 498ms | 488ms | unchanged |
| `render.journalListScroll` | 9.30ms | 9.60ms | unchanged |

## Speech-to-text

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `transcribe.short` | 1.60s | 1.66s | unchanged |
| `transcribe.medium` | 6.47s | 6.29s | unchanged |
| `transcribe.long` | 18.45s | 18.69s | unchanged |
| `ffmpeg.conversion` | 265ms | 296ms | 1.1× slower |
| `whisper.spawnAndModelLoad` | 1.30s | 1.16s | **1.1× faster** |

## Cold start

| Step | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| **Total to visible window** | 1.35s | 1.43s | unchanged |
| Splash window shown | 263ms | 313ms | 1.2× slower |
| Main window created | 26ms | 23ms | **1.1× faster** |
| Initializing localDB | 1.00ms | 2.00ms | 2.0× slower |
| Running OllamaEmbeddingModelSetup | 437ms | 36ms | **12.1× faster** |
| Starting Qdrant | 36ms | 38ms | unchanged |
| Qdrant started | 847ms | 843ms | unchanged |
| IPC handlers, event bus, and worker initialized | 9.00ms | 8.00ms | **1.1× faster** |
| Renderer signaled visually ready | 677ms | 547ms | **1.2× faster** |

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
| Total JavaScript | 1.8 MB | 1.8 MB | unchanged |
| JavaScript (gzipped) | 711.5 KB | 712.1 KB | unchanged |

All eleven stages compared.
