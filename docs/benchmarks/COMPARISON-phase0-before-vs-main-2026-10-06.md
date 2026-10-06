# MindSage — Benchmark comparison

**Before:** `phase0-before` (2026-08-30T00:35:33.637Z, `1c21eb0e`)
**After:** `main-2026-10-06` (2026-10-06T06:42:50.180Z, `6f219b99` +uncommitted)

> **These runs are from different machines. Do not quote any ratio below.**
> Before: Intel(R) Core(TM) i5-9300H CPU @ 2.40GHz (8 cores).
> After: Intel(R) Core(TM) i5-9300H CPU @ 2.40GHz (8 cores).

> ## ⚠ 8 measurements got worse
>
> | Section | Measurement | Change |
> | --- | --- | --- |
> | Database | `write.create` | **12.7× slower** |
> | Database | `dashboard.stats` | **1.7× slower** |
> | Database | `gallery.random` | **1.7× slower** |
> | Database | `gallery.top` | **1.3× slower** |
> | Database | `write.create` | **1.3× slower** |
> | Database | `entry.byId` | **1.2× slower** |
> | Database | `entry.byId` | **1.2× slower** |
> | Database | `write.create` | **1.2× slower** |
>
> A win elsewhere does not cancel these. Decide deliberately whether each is
> an acceptable trade, and record the decision in the optimisation log.

| Model | Before | After | Held fixed? |
| --- | --- | --- | --- |
| Chat | - | `llama3.2:latest` | not measured both sides |
| Embedding | - | `nomic-embed-text:v1.5` | not measured both sides |

## Database

|  | Before | After |
| --- | --- | --- |
| `journal_mode` | `delete` | `delete` |
| `synchronous` | `2` | `2` |
| Full table scans | 41 | 41 |

### 150 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 1.51ms | 0.73ms | **2.1× faster** |
| `list.deepPage` | 1.66ms | 1.14ms | **1.5× faster** |
| `list.dateFiltered` | 0.94ms | 0.62ms | **1.5× faster** |
| `entry.byId` | 0.22ms | 0.17ms | **1.4× faster** |
| `dashboard.recent` | 0.62ms | 0.52ms | **1.2× faster** |
| `dashboard.stats` | 3.75ms | 6.22ms | 1.7× slower |
| `dashboard.data` | 0.75ms | 0.79ms | unchanged |
| `dashboard.monthlyScores` | 0.20ms | 0.19ms | unchanged |
| `dashboard.allTimeScores` | 0.31ms | 0.30ms | unchanged |
| `gallery.top` | 0.13ms | 0.17ms | 1.3× slower |
| `gallery.random` | 0.77ms | 1.29ms | 1.7× slower |
| `gallery.all` | 0.24ms | 0.16ms | **1.6× faster** |
| `write.create` | 6.11ms | 7.73ms | 1.3× slower |
| `export.everything` | 113ms | 94ms | **1.2× faster** |
| `contention.listWhileWorkerWrites` | 266ms | 204ms | **1.3× faster** |

### 5,000 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 17ms | 9.10ms | **1.9× faster** |
| `list.deepPage` | 22ms | 16ms | **1.4× faster** |
| `list.dateFiltered` | 2.74ms | 2.29ms | **1.2× faster** |
| `entry.byId` | 0.13ms | 0.15ms | 1.2× slower |
| `dashboard.recent` | 15ms | 9.14ms | **1.6× faster** |
| `dashboard.stats` | 90ms | 69ms | **1.3× faster** |
| `dashboard.data` | 9.99ms | 4.97ms | **2.0× faster** |
| `dashboard.monthlyScores` | 2.37ms | 1.17ms | **2.0× faster** |
| `dashboard.allTimeScores` | 9.10ms | 6.49ms | **1.4× faster** |
| `gallery.top` | 2.23ms | 1.08ms | **2.1× faster** |
| `gallery.random` | 13ms | 5.79ms | **2.2× faster** |
| `gallery.all` | 5.35ms | 2.34ms | **2.3× faster** |
| `write.create` | 6.81ms | 86ms | 12.7× slower |
| `export.everything` | 1.57s | 1.41s | **1.1× faster** |
| `contention.listWhileWorkerWrites` | 738ms | 253ms | **2.9× faster** |

### 50,000 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 282ms | 244ms | **1.2× faster** |
| `list.deepPage` | 518ms | 260ms | **2.0× faster** |
| `list.dateFiltered` | 311ms | 151ms | **2.1× faster** |
| `entry.byId` | 0.13ms | 0.16ms | 1.2× slower |
| `dashboard.recent` | 251ms | 246ms | unchanged |
| `dashboard.stats` | 1.67s | 1.63s | unchanged |
| `dashboard.data` | 615ms | 661ms | unchanged |
| `dashboard.monthlyScores` | 150ms | 145ms | unchanged |
| `dashboard.allTimeScores` | 219ms | 214ms | unchanged |
| `gallery.top` | 154ms | 144ms | unchanged |
| `gallery.random` | 1.00s | 993ms | unchanged |
| `gallery.all` | 165ms | 154ms | unchanged |
| `write.create` | 6.66ms | 7.83ms | 1.2× slower |
| `export.everything` | 16.35s | 16.44s | unchanged |
| `contention.listWhileWorkerWrites` | 570ms | 471ms | **1.2× faster** |

## Not compared

No delta for `ai`, `vector`, `rag`, `app`, `whisper`, `startup`, `quality`, `bundle` — the stage is
absent or skipped on at least one side. Re-run both with the same
`--stages` set if the change could have moved it.
