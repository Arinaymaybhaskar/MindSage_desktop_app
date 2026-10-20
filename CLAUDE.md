# CLAUDE.md

MindSage: Electron + React + TypeScript desktop journaling app, offline-first. Journal data lives in a local better-sqlite3 DB; Ollama and Whisper.cpp run locally.
Search is sqlite-vec in the same database file. Work is tracked in Jira project KAN.
This file is an index: detail lives in `docs/agent/`, read on demand.

## Who are you?

- **If you are the ORCHESTRATING session:** read [docs/agent/orchestrator.md](docs/agent/orchestrator.md) before doing anything else and follow it.
- **If you are a SUBAGENT:** your brief names the docs you need. Read only those plus this file, and do not read other docs/agent files unless the brief says so.

## Hard rules (never skip)

- Schema changes only in `electron/db/migrations.js`; never edit a shipped migration. -> [architecture.md](docs/agent/architecture.md)
- Every query that reads entries or goals filters `is_deleted = 0`. -> [trash-and-deletion.md](docs/agent/trash-and-deletion.md)
- The session lives in the main process; IPC channels take no token and no user id from the renderer. -> [security-and-session.md](docs/agent/security-and-session.md)
- The password does not encrypt anything; write no copy that implies it does. -> [security-and-session.md](docs/agent/security-and-session.md)
- No `console` in the main process: use `electron/log.js`, and never log entry or chat text. -> [logging.md](docs/agent/logging.md)
- The renderer never imports Node APIs; every backend call goes through `src/api/*Service`. -> [architecture.md](docs/agent/architecture.md)
- IPC handlers register before the window exists; nothing may depend on search being up. -> [architecture.md](docs/agent/architecture.md)
- New handlers that create or edit entries, goals or progress logs emit the matching event. -> [search-index.md](docs/agent/search-index.md)
- Write the smallest complete change. -> [ponytail.md](docs/agent/ponytail.md)
- Reports, owner messages and Jira comments: answer first, no ceremony. -> [terse-output.md](docs/agent/terse-output.md)
- `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm test` must stay clean. -> [tooling-and-tests.md](docs/agent/tooling-and-tests.md)
- Commits are Conventional Commits ending with `Refs: KAN-nn`, no Co-Authored-By or Claude-Session trailers, never `--no-verify`. -> [workflow.md](docs/agent/workflow.md)
- Flow is ticket branch -> phase branch -> dev -> main; never push or edit directly on `main`, `dev` or `phase/*`. -> [workflow.md](docs/agent/workflow.md)
- Run `git fetch origin` before starting work, and before every merge or push. -> [workflow.md](docs/agent/workflow.md)

## If you are working on X, read Y

| Working on | Read |
|---|---|
| Orchestrating: delegation, model and effort choice, testing loop, Jira statuses, briefs | [docs/agent/orchestrator.md](docs/agent/orchestrator.md) |
| Writing or changing code | [docs/agent/ponytail.md](docs/agent/ponytail.md) |
| Writing any report, owner message or Jira comment | [docs/agent/terse-output.md](docs/agent/terse-output.md) |
| Branches, commits, PRs, bugs found along the way, hooks that block you | [docs/agent/workflow.md](docs/agent/workflow.md) |
| Layers, request flow, startup order, migrations, typed IPC bridge, renderer conventions | [docs/agent/architecture.md](docs/agent/architecture.md) |
| Commands, tests, db tests, e2e, CI, lint and format, benchmarks, demo data | [docs/agent/tooling-and-tests.md](docs/agent/tooling-and-tests.md) |
| Testing the real app: fake Ollama, launcher, scanner, process rules (testers) | [docs/agent/qa-kit.md](docs/agent/qa-kit.md) |
| Search, the indexer, embeddings, `vec_entries`, `search_index` | [docs/agent/search-index.md](docs/agent/search-index.md) |
| Trash, purge, backups, deleting a profile | [docs/agent/trash-and-deletion.md](docs/agent/trash-and-deletion.md) |
| Sign-in, session, CSP, window sandbox, `windowGuard`, Windows uninstaller | [docs/agent/security-and-session.md](docs/agent/security-and-session.md) |
| Logging | [docs/agent/logging.md](docs/agent/logging.md) |
| Import/export, updates, support lines, env flags, native binaries, packaging | [docs/agent/features.md](docs/agent/features.md) |
| Why a technical choice was made, what is verified true today | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) (§0 is a verified-state table: trust it over older docs) |
| Known debt: consult before introducing a new pattern (both partly stale) | [docs/TECHNICAL_DEBT.md](docs/TECHNICAL_DEBT.md), [docs/TODO.md](docs/TODO.md) |
| Audits | [AUTH_REVIEW](docs/AUTH_REVIEW.md), [CODEBASE_STRUCTURE_AUDIT](docs/CODEBASE_STRUCTURE_AUDIT.md), [NETWORK_AUDIT](docs/NETWORK_AUDIT.md), [ONLINE_MODE_REMOVAL](docs/ONLINE_MODE_REMOVAL.md), [PERFORMANCE](docs/PERFORMANCE.md) |
| Plans | [OFFLINE_AUTH_DESIGN](docs/OFFLINE_AUTH_DESIGN.md), [MAC_RELEASE_PLAN](docs/MAC_RELEASE_PLAN.md), [BUNDLE_SIZE_PLAN](docs/BUNDLE_SIZE_PLAN.md) |
| Index of all docs | [docs/README.md](docs/README.md) |
| Benchmarks | [docs/benchmarks/README.md](docs/benchmarks/README.md) |
| Theming and colours | [docs/COLOR_SYSTEM_README.md](docs/COLOR_SYSTEM_README.md) |
| UI patterns | [designPatterns.json](designPatterns.json) |
| Per-directory map, packaging caveats, toolchain quirks | [AGENTS.md](AGENTS.md) (where it disagrees with this file or `docs/agent/`, those win) |
| Features, platforms, workflow diagrams | [README.md](README.md) |

The work queue is Jira (project KAN, one release per phase); `docs/MASTER_TODO.md` was removed, `git log -- docs/MASTER_TODO.md` has its history.
