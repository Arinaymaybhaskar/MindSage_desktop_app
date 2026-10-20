# MindSage handoff (2026-10-20, evening)

You are the ORCHESTRATOR. Read CLAUDE.md, then docs/agent/orchestrator.md and docs/agent/terse-output.md. Tell the owner at most 2-3 lines, only when asked or when blocked. Start with `git fetch origin`.

## State
- Repo: Arinaymaybhaskar/MindSage_desktop_app. Jira KAN, cloudId 5ff5bb5a-94c3-42d4-ae17-384d856cb56f.
- Flow: ticket branch -> phase/p1-make-the-promise-true -> dev (cut from main) -> main. Hooks block edits and pushes on main/dev/phase/*: use ticket branches in own worktrees, land via PR.
- Merged into the phase today: People section + trash-safety (#31), token-report fix (#32), gitleaks allowlist for scripts/qa (#33), context-cap hook (#34), inline-vs-agent rule (#35).
- Owner decisions made: ignored people leave the export (#36); the AI keeps filling a blank mood; mood slider defaults to "no mood"; KAN-381 target revised to p95 < 100 ms at 5,000 and < 200 ms at 50,000 vectors on Windows; People stays in P1 branch though KAN-195/198 are release P4.5.
- Moved out of P1 by the owner: KAN-60 (update prompt) and KAN-54 (support sheet sources) to P2, KAN-337 (macOS reopen) to P5.

## Open PRs into the phase (check `list_pull_requests`; merge each when Typecheck & Lint is green)
- #36 fix/people-export-ignored (KAN-195/198)
- #37 fix/ci-windows-e2e-hang: Windows e2e job hung 42 min in the Ollama installer; this PR's own "End-to-end (Windows)" run is the verification (Install Ollama should take seconds). Merge only when that run passes or fails at a named step.
- #38 fix/KAN-381-search-p95 (mmap_size 1 GiB)
- #39 fix/KAN-382-windowguard-tests
- #40 fix/KAN-383-mood-slider
- #41 fix/KAN-54-support-lines-text (VERIFIED_ON deliberately unchanged)
- #42 fix/KAN-384-qa-kit-windows
- Branch fix/KAN-384-windows-delete-uninstall (Enter-to-hold, pendingCount by file, uninstaller removes updater installer.exe): no PR yet, waiting on the opus diff review result; the uninstaller has never run on Windows.

## Next
1. Merge the PRs above as checks go green. Fix any red required check.
2. After merging: move KAN-381, 382, 383, 384 and KAN-192 to Ready for testing; a separate sonnet/high tester checks each in the real app (docs/agent/qa-kit.md) before Ready for release. KAN-192 is Failed Testing only because of the p95 target, now revised.
3. Update KAN-192 and KAN-381 acceptance text to the revised target; comment on KAN-383 that no-mood is default.
4. Owner: on Windows retest KAN-384 uninstaller and delete dialog, then `npm run bench:phase -- 1` and commit the results with a run-index row (needs Ollama), then PR phase -> dev (owner protects dev; Typecheck & Lint required).
5. Delete merged remote branches by hand (remote delete fails here), incl. fix/KAN-378-kill-probes-on-quit and fix/KAN-379-editor-save-race. Housekeeping: .claude/worktrees/ is excluded locally via .git/info/exclude.
6. Not in Jira: People extraction is weak with llama3.2 (10 of 20 pairs, valence often wrong) and dark-mode contrast of the person sparkline and entry underlines is low; both belong to P4.5 People.

## Rules that bit us
- Create Jira bugs without fixVersions (the create call rejects it); set fixVersions in a separate edit. Labels are set-full on edit.
- Inline vs agent (orchestrator.md): small edits, docs, Jira moves and merges inline; coding with tests, real-app tests and diff review go to agents.
- Agents report in at most 10 lines. Verify the commit exists before relaying. Stage by explicit path. Never pkill; port 11434: probe before use.
- Do not bump VERIFIED_ON in supportLines.ts unless every line was rechecked; the Support sheet shows it to users.
- The context-cap hook warns at 150k tokens; at that point write this file and give the owner the first prompt. Token report: `node scripts/token-report.mjs` (path fix merged in #32).
