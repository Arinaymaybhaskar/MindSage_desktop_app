# MindSage — Benchmark comparison

**Before:** `phase0-before` (2026-08-30T00:35:33.637Z, `1c21eb0e`)
**After:** `phase0-after` (2026-08-30T00:40:14.053Z, `137c97e8` +uncommitted)

Both runs are from `Intel(R) Core(TM) i5-9300H CPU @ 2.40GHz`, 8 cores. 

> ## ⚠ 12 measurements got worse
>
> | Section | Measurement | Change |
> | --- | --- | --- |
> | Database | `write.create` | **2.1× slower** |
> | Database | `contention.listWhileWorkerWrites` | **2× slower** |
> | Database | `dashboard.data` | **1.4× slower** |
> | Database | `dashboard.monthlyScores` | **1.4× slower** |
> | Database | `dashboard.allTimeScores` | **1.4× slower** |
> | Database | `contention.listWhileWorkerWrites` | **1.2× slower** |
> | Database | `entry.byId` | **1.2× slower** |
> | Database | `dashboard.stats` | **1.2× slower** |
> | Database | `gallery.top` | **1.2× slower** |
> | Database | `export.everything` | **1.2× slower** |
> | Database | `list.deepPage` | **1.1× slower** |
> | Database | `write.create` | **1.1× slower** |
>
> A win elsewhere does not cancel these. Decide deliberately whether each is
> an acceptable trade, and record the decision in the optimisation log.


## Database

|  | Before | After |
| --- | --- | --- |
| `journal_mode` | `delete` | `delete` |
| `synchronous` | `2` | `2` |
| Full table scans | 41 | 41 |

### 150 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 1.51ms | 0.80ms | **1.9× faster** |
| `list.deepPage` | 1.66ms | 1.86ms | 1.1× slower |
| `list.dateFiltered` | 0.94ms | 0.65ms | **1.4× faster** |
| `entry.byId` | 0.22ms | 0.20ms | **1.1× faster** |
| `dashboard.recent` | 0.62ms | 0.50ms | **1.2× faster** |
| `dashboard.stats` | 3.75ms | 2.89ms | **1.3× faster** |
| `dashboard.data` | 0.75ms | 0.65ms | **1.2× faster** |
| `dashboard.monthlyScores` | 0.20ms | 0.21ms | unchanged |
| `dashboard.allTimeScores` | 0.31ms | 0.28ms | **1.1× faster** |
| `gallery.top` | 0.13ms | 0.13ms | unchanged |
| `gallery.random` | 0.77ms | 0.72ms | unchanged |
| `gallery.all` | 0.24ms | 0.16ms | **1.6× faster** |
| `write.create` | 6.11ms | 6.84ms | 1.1× slower |
| `export.everything` | 113ms | 98ms | **1.2× faster** |
| `contention.listWhileWorkerWrites` | 266ms | 313ms | 1.2× slower |

### 5,000 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 17ms | 11ms | **1.5× faster** |
| `list.deepPage` | 22ms | 17ms | **1.3× faster** |
| `list.dateFiltered` | 2.74ms | 2.55ms | unchanged |
| `entry.byId` | 0.13ms | 0.14ms | 1.2× slower |
| `dashboard.recent` | 15ms | 9.55ms | **1.6× faster** |
| `dashboard.stats` | 90ms | 70ms | **1.3× faster** |
| `dashboard.data` | 9.99ms | 6.77ms | **1.5× faster** |
| `dashboard.monthlyScores` | 2.37ms | 1.88ms | **1.3× faster** |
| `dashboard.allTimeScores` | 9.10ms | 6.70ms | **1.4× faster** |
| `gallery.top` | 2.23ms | 2.07ms | unchanged |
| `gallery.random` | 13ms | 7.69ms | **1.7× faster** |
| `gallery.all` | 5.35ms | 2.51ms | **2.1× faster** |
| `write.create` | 6.81ms | 6.70ms | unchanged |
| `export.everything` | 1.57s | 1.41s | **1.1× faster** |
| `contention.listWhileWorkerWrites` | 738ms | 299ms | **2.5× faster** |

### 50,000 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 282ms | 264ms | unchanged |
| `list.deepPage` | 518ms | 276ms | **1.9× faster** |
| `list.dateFiltered` | 311ms | 159ms | **2.0× faster** |
| `entry.byId` | 0.13ms | 0.14ms | unchanged |
| `dashboard.recent` | 251ms | 248ms | unchanged |
| `dashboard.stats` | 1.67s | 2.07s | 1.2× slower |
| `dashboard.data` | 615ms | 857ms | 1.4× slower |
| `dashboard.monthlyScores` | 150ms | 214ms | 1.4× slower |
| `dashboard.allTimeScores` | 219ms | 297ms | 1.4× slower |
| `gallery.top` | 154ms | 186ms | 1.2× slower |
| `gallery.random` | 1.00s | 1.09s | unchanged |
| `gallery.all` | 165ms | 173ms | unchanged |
| `write.create` | 6.66ms | 14ms | 2.1× slower |
| `export.everything` | 16.35s | 19.55s | 1.2× slower |
| `contention.listWhileWorkerWrites` | 570ms | 1.12s | 2.0× slower |

## Not compared

No delta for `ai`, `vector`, `rag`, `app`, `whisper`, `startup`, `quality`, `bundle` — the stage is
absent or skipped on at least one side. Re-run both with the same
`--stages` set if the change could have moved it.
