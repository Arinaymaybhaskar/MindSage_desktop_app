# MindSage — Benchmark comparison

**Before:** `phase0-after` (2026-08-30T00:40:14.053Z, `137c97e8` +uncommitted)
**After:** `phase0-after-2` (2026-08-30T00:45:36.755Z, `137c97e8` +uncommitted)

Both runs are from `Intel(R) Core(TM) i5-9300H CPU @ 2.40GHz`, 8 cores. 

> ## ⚠ 12 measurements got worse
>
> | Section | Measurement | Change |
> | --- | --- | --- |
> | Database | `write.create` | **13.2× slower** |
> | Database | `contention.listWhileWorkerWrites` | **5.2× slower** |
> | Database | `dashboard.recent` | **2.2× slower** |
> | Database | `contention.listWhileWorkerWrites` | **2.1× slower** |
> | Database | `gallery.top` | **1.5× slower** |
> | Database | `gallery.random` | **1.5× slower** |
> | Database | `dashboard.monthlyScores` | **1.4× slower** |
> | Database | `dashboard.stats` | **1.3× slower** |
> | Database | `dashboard.allTimeScores` | **1.3× slower** |
> | Database | `gallery.random` | **1.3× slower** |
> | Database | `export.everything` | **1.2× slower** |
> | Database | `dashboard.data` | **1.1× slower** |
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
| `list.page1` | 0.80ms | 0.71ms | **1.1× faster** |
| `list.deepPage` | 1.86ms | 1.25ms | **1.5× faster** |
| `list.dateFiltered` | 0.65ms | 0.65ms | unchanged |
| `entry.byId` | 0.20ms | 0.15ms | **1.3× faster** |
| `dashboard.recent` | 0.50ms | 0.43ms | **1.2× faster** |
| `dashboard.stats` | 2.89ms | 3.68ms | 1.3× slower |
| `dashboard.data` | 0.65ms | 0.74ms | 1.1× slower |
| `dashboard.monthlyScores` | 0.21ms | 0.29ms | 1.4× slower |
| `dashboard.allTimeScores` | 0.28ms | 0.36ms | 1.3× slower |
| `gallery.top` | 0.13ms | 0.19ms | 1.5× slower |
| `gallery.random` | 0.72ms | 1.08ms | 1.5× slower |
| `gallery.all` | 0.16ms | 0.15ms | unchanged |
| `write.create` | 6.84ms | 7.10ms | unchanged |
| `export.everything` | 98ms | 104ms | unchanged |
| `contention.listWhileWorkerWrites` | 313ms | 297ms | unchanged |

### 5,000 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 11ms | 11ms | unchanged |
| `list.deepPage` | 17ms | 18ms | unchanged |
| `list.dateFiltered` | 2.55ms | 2.65ms | unchanged |
| `entry.byId` | 0.14ms | 0.14ms | unchanged |
| `dashboard.recent` | 9.55ms | 21ms | 2.2× slower |
| `dashboard.stats` | 70ms | 73ms | unchanged |
| `dashboard.data` | 6.77ms | 7.36ms | unchanged |
| `dashboard.monthlyScores` | 1.88ms | 1.19ms | **1.6× faster** |
| `dashboard.allTimeScores` | 6.70ms | 7.23ms | unchanged |
| `gallery.top` | 2.07ms | 1.18ms | **1.8× faster** |
| `gallery.random` | 7.69ms | 9.78ms | 1.3× slower |
| `gallery.all` | 2.51ms | 2.58ms | unchanged |
| `write.create` | 6.70ms | 88ms | 13.2× slower |
| `export.everything` | 1.41s | 1.69s | 1.2× slower |
| `contention.listWhileWorkerWrites` | 299ms | 1.56s | 5.2× slower |

### 50,000 entries

| Scenario | before p95 | after p95 | Change |
| --- | --- | --- | --- |
| `list.page1` | 264ms | 258ms | unchanged |
| `list.deepPage` | 276ms | 266ms | unchanged |
| `list.dateFiltered` | 159ms | 161ms | unchanged |
| `entry.byId` | 0.14ms | 0.15ms | unchanged |
| `dashboard.recent` | 248ms | 247ms | unchanged |
| `dashboard.stats` | 2.07s | 1.61s | **1.3× faster** |
| `dashboard.data` | 857ms | 609ms | **1.4× faster** |
| `dashboard.monthlyScores` | 214ms | 146ms | **1.5× faster** |
| `dashboard.allTimeScores` | 297ms | 213ms | **1.4× faster** |
| `gallery.top` | 186ms | 151ms | **1.2× faster** |
| `gallery.random` | 1.09s | 939ms | **1.2× faster** |
| `gallery.all` | 173ms | 171ms | unchanged |
| `write.create` | 14ms | 6.46ms | **2.2× faster** |
| `export.everything` | 19.55s | 14.79s | **1.3× faster** |
| `contention.listWhileWorkerWrites` | 1.12s | 2.38s | 2.1× slower |

## Not compared

No delta for `ai`, `vector`, `rag`, `app`, `whisper`, `startup`, `quality`, `bundle` — the stage is
absent or skipped on at least one side. Re-run both with the same
`--stages` set if the change could have moved it.
