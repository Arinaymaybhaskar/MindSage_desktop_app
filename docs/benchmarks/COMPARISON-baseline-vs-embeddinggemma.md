# MindSage — Benchmark comparison

**Before:** `baseline` (2026-08-25T16:45:45.667Z)
**After:** `embeddinggemma` (2026-08-26T18:44:45.719Z)

Both runs are from `Intel(R) Core(TM) i5-9300H CPU @ 2.40GHz`, 8 cores. 

| Model | Before | After | Held fixed? |
| --- | --- | --- | --- |
| Chat | `llama3.2:latest` | - | not measured both sides |
| Embedding | `nomic-embed-text:v1.5` | `embeddinggemma` | **changed** |

_A model changed between these runs. Every AI, RAG and retrieval-quality figure below reflects that swap as well as any code change._

## Retrieval quality

Corpus of 18 entries, 15 queries, k=5. Higher is better.

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| `precision@1` | 0.467 | 0.733 | **+57%** |
| `recall@5` | 0.767 | 0.933 | **+22%** |
| `mrr` | 0.644 | 0.867 | **+35%** |

_Embedding model differs: `nomic-embed-text:v1.5` → `embeddinggemma`._

## Not compared

No delta for `db`, `ai`, `vector`, `rag`, `app`, `whisper`, `startup`, `bundle` — the stage is
absent or skipped on at least one side. Re-run both with the same
`--stages` set if the change could have moved it.
