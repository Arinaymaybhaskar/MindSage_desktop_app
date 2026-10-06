# MindSage — Documentation

Reference documents for the MindSage desktop app. Orientation docs stay at the repo root ([README.md](../README.md), [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md)); everything analytical lives here.

## Start here

| Document | What it is |
| --- | --- |
| [MASTER_TODO.md](MASTER_TODO.md) | **The queue.** Every actionable item from every document below, deduplicated and merged into one order of execution. Start here to decide what to work on. |
| [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) | **The argument.** Everything between the current code and a shippable product, grouped by severity, with a verified-state table. Read it for *why* an item matters; read MASTER_TODO for *when*. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | **The reasoning.** Why each significant technical choice was made, the trade-offs accepted, and what would change at a different scale. Read it before proposing a replacement for any of them. |

## Audits and reviews

| Document | Reviewed | What it covers |
| --- | --- | --- |
| [AUTH_REVIEW.md](AUTH_REVIEW.md) | 2026-08-24 | The full auth path — unverified tokens, broken `logout()`, the inert biometric toggle, unencrypted data at rest. |
| [CODEBASE_STRUCTURE_AUDIT.md](CODEBASE_STRUCTURE_AUDIT.md) | 2026-08-25 | **Closed 2026-08-28.** Folder layout, file placement, dead code, packaging hygiene. Six of its eight priorities shipped, naming was declined, and binaries in git history remain. Kept for its record of which findings did not survive verification. |
| [NETWORK_AUDIT.md](NETWORK_AUDIT.md) | 2026-08-24 | Every outbound network path. Verdict: not fully offline — the auto-updater fires unprompted. |
| [ONLINE_MODE_REMOVAL.md](ONLINE_MODE_REMOVAL.md) | 2026-08-24 | **Executed 2026-08-28.** Judged deleting `src/server/` and online mode safe, and it was. Kept for the reasoning; the one departure is that forgot-password was rewritten rather than removed. |
| [PERFORMANCE.md](PERFORMANCE.md) | 2026-08-11 | What actually slows the app down: missing WAL mode, missing `journal_entries` indexes, media re-encoding. |
| [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) | 2026-07-15 | The original debt catalog. **Partly stale** — check against PRODUCTION_READINESS §0. |

## Plans and designs

| Document | Status | What it proposes |
| --- | --- | --- |
| [OFFLINE_AUTH_DESIGN.md](OFFLINE_AUTH_DESIGN.md) | Proposal | An encrypted-vault login flow for a fully offline app, and how password recovery works without a server. |
| [MAC_RELEASE_PLAN.md](MAC_RELEASE_PLAN.md) | Plan | What it takes to ship on macOS: mac Whisper binaries, arm64 Qdrant, signing and notarisation, CI matrix. |
| [BUNDLE_SIZE_PLAN.md](BUNDLE_SIZE_PLAN.md) | Plan | Why the installer is 236 MB and the app 777 MB, and how to get to ~80 MB / ~320 MB. |

## Working docs

| Document | What it is |
| --- | --- |
| [benchmarks/](benchmarks/README.md) | The measurement harness (`npm run bench`) and recorded results. PERFORMANCE.md states what *should* be slow; this measures what *is*. [OPTIMIZATION_LOG.md](benchmarks/OPTIMIZATION_LOG.md) tracks each issue from measured before to measured after. |
| [TODO.md](TODO.md) | Checkable task list derived from TECHNICAL_DEBT.md, with per-branch review findings. |
| [COLOR_SYSTEM_README.md](COLOR_SYSTEM_README.md) | Theming system: presets, CSS variables, and the `ColorThemeContext` API. |

---

**Note on staleness.** TECHNICAL_DEBT.md (2026-07-15) and TODO.md (2026-08-12) predate the tooling work that has since landed — CI, Vitest, Prettier, husky, and the `lint`/`typecheck`/`format`/`test` scripts all exist now. [PRODUCTION_READINESS.md §0](PRODUCTION_READINESS.md) carries a verified table of what is actually true today; trust it over the older documents where they disagree.
