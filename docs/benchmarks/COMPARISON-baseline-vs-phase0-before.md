# MindSage — Benchmark comparison

**Before:** `baseline` (2026-08-25T16:45:45.667Z)
**After:** `phase0-before` (2026-10-06T06:42:50.180Z, `6f219b99` +uncommitted)

> **These runs are from different machines. Do not quote any ratio below.**
> Before: Intel(R) Core(TM) i5-9300H CPU @ 2.40GHz (8 cores).
> After: Intel(R) Core(TM) i5-9300H CPU @ 2.40GHz (8 cores).

> ## ⚠ 17 measurements got worse
>
> | Section | Measurement | Change |
> | --- | --- | --- |
> | Chat RAG | `rag.2.embedding` | **34.6× slower** |
> | Chat RAG | `rag.3.vectorSearch` | **23.7× slower** |
> | AI pipeline | `ghostText.suggestion` | **14.1× slower** |
> | Database | `write.create` | **13.3× slower** |
> | Cold start | Running OllamaEmbeddingModelSetup | **6.8× slower** |
> | Cold start | Starting Qdrant | **3.5× slower** |
> | Cold start | Renderer signaled visually ready | **3.5× slower** |
> | AI pipeline | `embed.title` | **2.2× slower** |
> | Database | `dashboard.stats` | **1.7× slower** |
> | Database | `gallery.random` | **1.3× slower** |
> | Database | `write.create` | **1.3× slower** |
> | Cold start | Main window created | **1.3× slower** |
> | Database | `contention.listWhileWorkerWrites` | **1.2× slower** |
> | Database | `write.create` | **1.2× slower** |
> | Vector search | `search.at50000` | **1.2× slower** |
> | Application layer | `media.getImage` | **1.2× slower** |
> | Database | `entry.byId` | **1.1× slower** |
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
| `list.page1` | 0.81ms | 0.73ms | **1.1× faster** |
| `list.deepPage` | 1.28ms | 1.14ms | **1.1× faster** |
| `list.dateFiltered` | 1.26ms | 0.62ms | **2.0× faster** |
| `entry.byId` | 0.16ms | 0.17ms | unchanged |
| `dashboard.recent` | 0.56ms | 0.52ms | unchanged |
| `dashboard.stats` | 3.56ms | 6.22ms | 1.7× slower |
| `dashboard.data` | 0.88ms | 0.79ms | **1.1× faster** |
| `dashboard.monthlyScores` | 0.21ms | 0.19ms | unchanged |
| `dashboard.allTimeScores` | 0.43ms | 0.30ms | **1.4× faster** |
| `gallery.top` | 0.19ms | 0.17ms | **1.1× faster** |
| `gallery.random` | 0.96ms | 1.29ms | 1.3× slower |
| `gallery.all` | 0.19ms | 0.16ms | **1.2× faster** |
| `write.create` | 5.99ms | 7.73ms | 1.3× slower |
| `contention.listWhileWorkerWrites` | 174ms | 204ms | 1.2× slower |

### 5,000 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 17ms | 9.10ms | **1.9× faster** |
| `list.deepPage` | 38ms | 16ms | **2.4× faster** |
| `list.dateFiltered` | 3.27ms | 2.29ms | **1.4× faster** |
| `entry.byId` | 0.60ms | 0.15ms | **3.9× faster** |
| `dashboard.recent` | 16ms | 9.14ms | **1.8× faster** |
| `dashboard.stats` | 88ms | 69ms | **1.3× faster** |
| `dashboard.data` | 7.51ms | 4.97ms | **1.5× faster** |
| `dashboard.monthlyScores` | 1.58ms | 1.17ms | **1.4× faster** |
| `dashboard.allTimeScores` | 10ms | 6.49ms | **1.6× faster** |
| `gallery.top` | 1.40ms | 1.08ms | **1.3× faster** |
| `gallery.random` | 7.31ms | 5.79ms | **1.3× faster** |
| `gallery.all` | 3.22ms | 2.34ms | **1.4× faster** |
| `write.create` | 6.51ms | 86ms | 13.3× slower |
| `contention.listWhileWorkerWrites` | 258ms | 253ms | unchanged |

### 50,000 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 586ms | 244ms | **2.4× faster** |
| `list.deepPage` | 334ms | 260ms | **1.3× faster** |
| `list.dateFiltered` | 186ms | 151ms | **1.2× faster** |
| `entry.byId` | 0.14ms | 0.16ms | 1.1× slower |
| `dashboard.recent` | 302ms | 246ms | **1.2× faster** |
| `dashboard.stats` | 2.02s | 1.63s | **1.2× faster** |
| `dashboard.data` | 742ms | 661ms | **1.1× faster** |
| `dashboard.monthlyScores` | 173ms | 145ms | **1.2× faster** |
| `dashboard.allTimeScores` | 248ms | 214ms | **1.2× faster** |
| `gallery.top` | 238ms | 144ms | **1.7× faster** |
| `gallery.random` | 1.07s | 993ms | unchanged |
| `gallery.all` | 267ms | 154ms | **1.7× faster** |
| `write.create` | 6.67ms | 7.83ms | 1.2× slower |
| `contention.listWhileWorkerWrites` | 651ms | 471ms | **1.4× faster** |

## AI pipeline

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `embed.title` | 24ms | 54ms | 2.2× slower |
| `embed.short` | 109ms | 71ms | **1.5× faster** |
| `embed.medium` | 108ms | 96ms | **1.1× faster** |
| `embed.long` | 226ms | 216ms | unchanged |
| `enrich.metadata.short` | 4.94s | 3.88s | **1.3× faster** |
| `enrich.metadata.medium` | 3.45s | 3.09s | **1.1× faster** |
| `enrich.summary.medium` | 2.40s | 2.21s | unchanged |
| `enrich.metadata.long` | 5.79s | 6.16s | unchanged |
| `enrich.summary.long` | 3.38s | 3.11s | unchanged |
| `enrich.endToEnd.medium` | 7.03s | 6.69s | unchanged |
| `chat.timeToFirstToken` | 993ms | 988ms | unchanged |
| `chat.totalGeneration` | 5.60s | 5.19s | unchanged |
| `ghostText.suggestion` | 670ms | 9.42s | 14.1× slower |

## Vector search

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `search.at150` | 12ms | 7.65ms | **1.6× faster** |
| `search.at5000` | 3.63ms | 2.28ms | **1.6× faster** |
| `search.at50000` | 6.10ms | 7.62ms | 1.2× slower |

## Chat RAG

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `rag.1.queryPlanning` | 17.24s | 4.82s | **3.6× faster** |
| `rag.2.embedding` | 65ms | 2.26s | 34.6× slower |
| `rag.3.vectorSearch` | 35ms | 837ms | 23.7× slower |
| `rag.4.answerGeneration` | 11.88s | 7.77s | **1.5× faster** |
| `rag.total` | 24.63s | 14.04s | **1.8× faster** |

## Application layer

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `ipc.journal:get-all (10)` | 29ms | 11ms | **2.8× faster** |
| `ipc.journal:get-all (50)` | 31ms | 12ms | **2.6× faster** |
| `ipc.journal:get-recent` | 24ms | 9.50ms | **2.5× faster** |
| `ipc.journal:get-images (top)` | 3.90ms | 2.50ms | **1.6× faster** |
| `ipc.dashboard:get-data` | 20ms | 8.00ms | **2.5× faster** |
| `ipc.dashboard:get-stats` | 108ms | 67ms | **1.6× faster** |
| `ipc.goal:get-active-goals` | 0.50ms | 0.40ms | **1.3× faster** |
| `media.getImage` | 1.30ms | 1.60ms | 1.2× slower |
| `media.getThumbnail` | 1.80ms | 0.90ms | **2.0× faster** |
| `render.dashboardSettle` | 459ms | 464ms | unchanged |
| `render.journalListScroll` | 11ms | 9.50ms | **1.2× faster** |

## Speech-to-text

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `transcribe.short` | 1.77s | 1.63s | unchanged |
| `transcribe.medium` | 7.25s | 6.31s | **1.1× faster** |
| `transcribe.long` | 24.77s | 18.12s | **1.4× faster** |
| `ffmpeg.conversion` | 3.68s | 303ms | **12.2× faster** |
| `whisper.spawnAndModelLoad` | 1.53s | 1.31s | **1.2× faster** |

## Cold start

| Step | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| **Total to visible window** | 1.99s | 1.58s | **1.3× faster** |
| Splash window shown | 233ms | 109ms | **2.1× faster** |
| Main window created | 20ms | 25ms | 1.3× slower |
| Initializing localDB | 1.00ms | 1.00ms | unchanged |
| Running OllamaEmbeddingModelSetup | 44ms | 300ms | 6.8× slower |
| Starting Qdrant | 26ms | 91ms | 3.5× slower |
| Qdrant started | 1.39s | 434ms | **3.2× faster** |
| IPC handlers, event bus, and worker initialized | 13ms | 5.00ms | **2.6× faster** |
| Sent services-ready to renderer | 1.00ms | 1.00ms | unchanged |
| Renderer signaled visually ready | 315ms | 1.10s | 3.5× slower |

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
| Total JavaScript | 1.9 MB | 1.8 MB | **−41.6 KB** |
| JavaScript (gzipped) | 728.1 KB | 713.4 KB | **−14.7 KB** |
| `src/components` | 170.0 KB | 180.2 KB | +10.2 KB |
| `src/pages` | 133.1 KB | 121.3 KB | **−11.9 KB** |
| `axios` | 34.9 KB | 0 B | - |

All eleven stages compared.
