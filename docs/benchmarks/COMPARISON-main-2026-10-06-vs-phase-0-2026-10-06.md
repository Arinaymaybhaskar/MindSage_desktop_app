# MindSage — Benchmark comparison

**Before:** `main-2026-10-06` (2026-10-06T06:42:50.180Z, `6f219b99` +uncommitted)
**After:** `phase-0-2026-10-06` (2026-10-06T08:39:27.588Z, `a6797924` +uncommitted)

Both runs are from `Intel(R) Core(TM) i5-9300H CPU @ 2.40GHz`, 8 cores. 

> ## ⚠ 13 measurements got worse
>
> | Section | Measurement | Change |
> | --- | --- | --- |
> | Cold start | Splash window shown | **2.4× slower** |
> | Database | `gallery.all` | **2.1× slower** |
> | Cold start | Qdrant started | **2× slower** |
> | Database | `gallery.random` | **1.9× slower** |
> | Application layer | `media.getThumbnail` | **1.8× slower** |
> | Cold start | IPC handlers, event bus, and worker initialized | **1.8× slower** |
> | Database | `dashboard.allTimeScores` | **1.7× slower** |
> | Database | `contention.listWhileWorkerWrites` | **1.5× slower** |
> | Cold start | Running OllamaEmbeddingModelSetup | **1.5× slower** |
> | AI pipeline | `chat.totalGeneration` | **1.3× slower** |
> | Database | `entry.byId` | **1.1× slower** |
> | Database | `contention.listWhileWorkerWrites` | **1.1× slower** |
> | Database | `gallery.top` | **1.1× slower** |
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
| `journal_mode` | `delete` | `delete` |
| `synchronous` | `2` | `2` |
| Full table scans | 41 | 41 |

### 150 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 0.73ms | 0.76ms | unchanged |
| `list.deepPage` | 1.14ms | 1.11ms | unchanged |
| `list.dateFiltered` | 0.62ms | 0.62ms | unchanged |
| `entry.byId` | 0.17ms | 0.16ms | unchanged |
| `dashboard.recent` | 0.52ms | 0.45ms | **1.2× faster** |
| `dashboard.stats` | 6.22ms | 3.99ms | **1.6× faster** |
| `dashboard.data` | 0.79ms | 0.77ms | unchanged |
| `dashboard.monthlyScores` | 0.19ms | 0.20ms | unchanged |
| `dashboard.allTimeScores` | 0.30ms | 0.29ms | unchanged |
| `gallery.top` | 0.17ms | 0.15ms | **1.1× faster** |
| `gallery.random` | 1.29ms | 2.44ms | 1.9× slower |
| `gallery.all` | 0.16ms | 0.34ms | 2.1× slower |
| `write.create` | 7.73ms | 8.35ms | unchanged |
| `export.everything` | 94ms | 101ms | unchanged |
| `contention.listWhileWorkerWrites` | 204ms | 311ms | 1.5× slower |

### 5,000 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 9.10ms | 9.35ms | unchanged |
| `list.deepPage` | 16ms | 16ms | unchanged |
| `list.dateFiltered` | 2.29ms | 2.05ms | **1.1× faster** |
| `entry.byId` | 0.15ms | 0.18ms | 1.1× slower |
| `dashboard.recent` | 9.14ms | 8.74ms | unchanged |
| `dashboard.stats` | 69ms | 63ms | unchanged |
| `dashboard.data` | 4.97ms | 5.09ms | unchanged |
| `dashboard.monthlyScores` | 1.17ms | 1.03ms | **1.1× faster** |
| `dashboard.allTimeScores` | 6.49ms | 6.71ms | unchanged |
| `gallery.top` | 1.08ms | 0.92ms | **1.2× faster** |
| `gallery.random` | 5.79ms | 5.62ms | unchanged |
| `gallery.all` | 2.34ms | 2.45ms | unchanged |
| `write.create` | 86ms | 7.75ms | **11.2× faster** |
| `export.everything` | 1.41s | 1.37s | unchanged |
| `contention.listWhileWorkerWrites` | 253ms | 281ms | 1.1× slower |

### 50,000 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 244ms | 246ms | unchanged |
| `list.deepPage` | 260ms | 259ms | unchanged |
| `list.dateFiltered` | 151ms | 153ms | unchanged |
| `entry.byId` | 0.16ms | 0.16ms | unchanged |
| `dashboard.recent` | 246ms | 258ms | unchanged |
| `dashboard.stats` | 1.63s | 1.63s | unchanged |
| `dashboard.data` | 661ms | 603ms | unchanged |
| `dashboard.monthlyScores` | 145ms | 145ms | unchanged |
| `dashboard.allTimeScores` | 214ms | 362ms | 1.7× slower |
| `gallery.top` | 144ms | 161ms | 1.1× slower |
| `gallery.random` | 993ms | 953ms | unchanged |
| `gallery.all` | 154ms | 156ms | unchanged |
| `write.create` | 7.83ms | 6.76ms | **1.2× faster** |
| `export.everything` | 16.44s | 15.99s | unchanged |
| `contention.listWhileWorkerWrites` | 471ms | 436ms | unchanged |

## AI pipeline

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `embed.title` | 54ms | 29ms | **1.9× faster** |
| `embed.short` | 71ms | 45ms | **1.6× faster** |
| `embed.medium` | 96ms | 95ms | unchanged |
| `embed.long` | 216ms | 215ms | unchanged |
| `enrich.metadata.short` | 3.88s | 3.74s | unchanged |
| `enrich.metadata.medium` | 3.09s | 2.80s | **1.1× faster** |
| `enrich.summary.medium` | 2.21s | 2.14s | unchanged |
| `enrich.metadata.long` | 6.16s | 5.35s | **1.2× faster** |
| `enrich.summary.long` | 3.11s | 3.39s | unchanged |
| `enrich.endToEnd.medium` | 6.69s | 7.01s | unchanged |
| `chat.timeToFirstToken` | 988ms | 1.03s | unchanged |
| `chat.totalGeneration` | 5.19s | 6.86s | 1.3× slower |
| `ghostText.suggestion` | 9.42s | 565ms | **16.7× faster** |

## Vector search

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `search.at150` | 7.65ms | 3.31ms | **2.3× faster** |
| `search.at5000` | 2.28ms | 2.25ms | unchanged |
| `search.at50000` | 7.62ms | 5.74ms | **1.3× faster** |

## Chat RAG

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `rag.1.queryPlanning` | 4.82s | 5.34s | unchanged |
| `rag.2.embedding` | 2.26s | 55ms | **41.3× faster** |
| `rag.3.vectorSearch` | 837ms | 18ms | **46.0× faster** |
| `rag.4.answerGeneration` | 7.77s | 7.72s | unchanged |
| `rag.total` | 14.04s | 11.97s | **1.2× faster** |

## Application layer

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `ipc.journal:get-all (10)` | 11ms | 11ms | unchanged |
| `ipc.journal:get-all (50)` | 12ms | 12ms | unchanged |
| `ipc.journal:get-recent` | 9.50ms | 9.90ms | unchanged |
| `ipc.journal:get-images (top)` | 2.50ms | 1.50ms | **1.7× faster** |
| `ipc.dashboard:get-data` | 8.00ms | 6.50ms | **1.2× faster** |
| `ipc.dashboard:get-stats` | 67ms | 66ms | unchanged |
| `ipc.goal:get-active-goals` | 0.40ms | 0.40ms | unchanged |
| `media.getImage` | 1.60ms | 0.90ms | **1.8× faster** |
| `media.getThumbnail` | 0.90ms | 1.60ms | 1.8× slower |
| `render.dashboardSettle` | 464ms | 498ms | unchanged |
| `render.journalListScroll` | 9.50ms | 9.30ms | unchanged |

## Speech-to-text

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `transcribe.short` | 1.63s | 1.60s | unchanged |
| `transcribe.medium` | 6.31s | 6.47s | unchanged |
| `transcribe.long` | 18.12s | 18.45s | unchanged |
| `ffmpeg.conversion` | 303ms | 265ms | **1.1× faster** |
| `whisper.spawnAndModelLoad` | 1.31s | 1.30s | unchanged |

## Cold start

| Step | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| **Total to visible window** | 1.58s | 1.35s | **1.2× faster** |
| Splash window shown | 109ms | 263ms | 2.4× slower |
| Main window created | 25ms | 26ms | unchanged |
| Initializing localDB | 1.00ms | 1.00ms | unchanged |
| Running OllamaEmbeddingModelSetup | 300ms | 437ms | 1.5× slower |
| Starting Qdrant | 91ms | 36ms | **2.5× faster** |
| Qdrant started | 434ms | 847ms | 2.0× slower |
| IPC handlers, event bus, and worker initialized | 5.00ms | 9.00ms | 1.8× slower |
| Sent services-ready to renderer | 1.00ms | 1.00ms | unchanged |
| Renderer signaled visually ready | 1.10s | 677ms | **1.6× faster** |

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
| JavaScript (gzipped) | 713.4 KB | 711.5 KB | unchanged |

All eleven stages compared.
