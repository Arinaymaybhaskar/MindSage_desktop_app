# MindSage handoff (2026-10-20, evening)

You are the ORCHESTRATOR. Read CLAUDE.md, then docs/agent/orchestrator.md and docs/agent/terse-output.md. Tell the owner at most 2-3 lines, only when asked or when blocked. Start with `git fetch origin`.

## State
- Repo: Arinaymaybhaskar/MindSage_desktop_app. Jira KAN, cloudId 5ff5bb5a-94c3-42d4-ae17-384d856cb56f.
- Flow: ticket branch -> phase/p1-make-the-promise-true -> dev (cut from main) -> main. Hooks block edits and pushes on main/dev/phase/*: use ticket branches in own worktrees, land via PR.
- Merged into the phase today: People section + trash-safety (#31), token-report fix (#32), gitleaks allowlist for scripts/qa (#33), context-cap hook (#34), inline-vs-agent rule (#35).
- Owner decisions made: ignored people leave the export (#36); the AI keeps filling a blank mood; mood slider defaults to "no mood"; KAN-381 target revised to p95 < 100 ms at 5,000 and < 200 ms at 50,000 vectors on Windows; People stays in the P1 branch though KAN-195/198 are release P4.5; the AI keeps filling a blank mood.
- Moved out of P1 by the owner: KAN-60 (update prompt) and KAN-54 (support sheet sources) to P2, KAN-337 (macOS reopen) to P5.

## Merged into the phase since (all green on required checks; tip 4dca3af, typecheck/lint/format/495 tests verified on 614bd35)
#36 ignored people out of the export, #37 Windows e2e CI fixed (Ollama zip instead of installer, serve + e2e in one step, 127.0.0.1; its own Windows e2e run is green, 4 min), #38 KAN-381 mmap, #39 KAN-382, #40 KAN-383, #41 KAN-54 hours, #42 KAN-384 QA kit, #43 handoff, #44 KAN-384 delete/uninstall (opus review: merge).

## Jira state
- Ready for testing (need the owner on Windows, steps in each ticket's latest comment): KAN-381, 382, 383, 384, 192.
- Ready for release: KAN-51, 52, 53, 55, 56, 57, 58, 59, 61, 62, 63, 88, 170, 335, 336, 338, 339, 340, 341, 343, 344, 359, bugs 366-380.
- Moved out of P1 by the owner: KAN-60, KAN-54 (to P2), KAN-337 (to P5).

## Next
1. Owner on Windows: retest KAN-381 (bench vs revised target: p95 < 100 ms at 5,000 and < 200 ms at 50,000), 382, 383 (mood slider, "Not set" default), 384 (uninstaller never ran on Windows; Enter hold; locked-file count 1) and 192. Then a separate tester agent or the owner moves each to Ready for release.
2. Then `npm run bench:phase -- 1` (needs Ollama) and commit the results with a run-index row on a ticket branch; then PR phase -> dev (owner protects dev; Typecheck & Lint required).
3. Delete merged remote branches by hand (remote delete fails here), incl. fix/KAN-378-kill-probes-on-quit and fix/KAN-379-editor-save-race.
4. Owner cleanup on the Windows machine: delete C:\Projects\MindSage_appdata_backup_20261020 (holds the journal), the three leftover worktrees, and mark the GitGuardian incident as a false positive (gitleaks allowlist for scripts/qa/ is merged).
5. Not in Jira: People extraction is weak with llama3.2 (10 of 20 pairs, valence often wrong) and dark-mode contrast of the person sparkline and entry underlines is low; both belong to P4.5 People.

## Rules that bit us
- Create Jira bugs without fixVersions (the create call rejects it); set fixVersions in a separate edit. Labels are set-full on edit.
- Inline vs agent (orchestrator.md): small edits, docs, Jira moves and merges inline; coding with tests, real-app tests and diff review go to agents.
- Agents report in at most 10 lines. Verify the commit exists before relaying. Stage by explicit path. Never pkill; port 11434: probe before use.
- Do not bump VERIFIED_ON in supportLines.ts unless every line was rechecked; the Support sheet shows it to users.
- The context-cap hook warns at 150k tokens; at that point write this file and give the owner the first prompt. Token report: `node scripts/token-report.mjs` (path fix merged in #32).
