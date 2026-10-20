# MindSage handoff (2026-10-20)

You are the ORCHESTRATOR. Read CLAUDE.md, then docs/agent/orchestrator.md, docs/agent/terse-output.md. Tell the owner at most 2-3 lines, only when asked or when blocked.

## State
- Repo: Arinaymaybhaskar/MindSage_desktop_app. Jira KAN, cloudId 5ff5bb5a-94c3-42d4-ae17-384d856cb56f.
- Flow: ticket branch -> phase/p1-make-the-promise-true (tip a7d70ff) -> dev (cut from main) -> main. `git fetch origin` first.
- P1 code is DONE and merged on the phase branch. Tip checks green (typecheck, lint, format, 438 unit, 107 db, e2e skip-AI).
- Ready for release (agent-tested in real app): KAN-50, 51, 52, 53, 58, 59, 61, 62, 88, 170, 335, 336, 338, 339, 340 (provisional: no packaged build), 341, 343, 359, and bugs 366-380.
- Still Ready for testing, need hardware (owner): KAN-54, 55, 56, 57, 60, 63, 192, 337, 344. Steps: docs/P1_OWNER_TEST.md.
- Open owner decisions: p95 at 50k vectors is 109-113 ms on the sandbox vs 100 ms target (int8 measured 73 ms p50, quality unmeasured); KAN-368 criterion 2 met as "reuse harmless"; copy-fallback selects a hidden span (no visible highlight).

## Next
1. Owner: hardware tests, `npm run bench:phase -- 1` (needs Ollama), then PR phase -> dev (owner protects dev: no direct pushes, Typecheck & Lint required).
2. Rebase/merge the People section (branch claude/gallant-clarke-oj1y1t); its migration number must be 9 or higher (migrations 7, 8 exist; KAN-368 added none).
3. Delete stale remote branches by hand: fix/KAN-378-kill-probes-on-quit, fix/KAN-379-editor-save-race (remote delete fails here).
4. Known unfiled: nothing. Housekeeping: main checkout is parked on fix/KAN-370-search-unavailable-reporting; use own worktrees.

## Rules that bit us
- Hooks block edits and pushes on main/dev/phase/*: work on ticket branches in OWN worktrees; shared checkout is a hazard. Stage by explicit path.
- Testers: sonnet/high, one per area, use scripts/qa (docs/agent/qa-kit.md). Never pkill; pid files. Port 11434: probe before use.
- Retest loop: fix -> Ready for testing -> separate tester -> Ready for release. Failures: Failed Testing + bug (labels release-p1, found-in-phase-1, phase-1-closeout; fixVersion set in a separate edit; link via discover).
- Rate limits hit mid-run: resume agents with SendMessage after reset.
- Cost: `node scripts/token-report.mjs`. Per-agent floor ~100k; fewer agents beats cheaper agents. Do tiny edits inline.
