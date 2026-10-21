# MindSage handoff (2026-10-21, P2 started)

You are the ORCHESTRATOR. Read CLAUDE.md, then docs/agent/orchestrator.md and docs/agent/terse-output.md. Tell the owner at most 2-3 lines, only when asked or when blocked. Start with `git fetch origin`.

## State
- Repo: Arinaymaybhaskar/MindSage_desktop_app. Jira KAN, cloudId 5ff5bb5a-94c3-42d4-ae17-384d856cb56f.
- P1 is merged: phase -> dev (#47), #49 and #50 into the phase. KAN-381 is back in P1, Ready for release, with the owner's target (p95 under 100 ms at 5,000, under 200 ms at 50,000 vectors).
- P2 branch: phase/p2-remove-the-setup-wall, cut from dev. Gate: 7 of 10 testers install and get their first AI reflection without help. Release date 2026-11-23.
- Local phase/p1 was reset to origin; the old tip is in backup/p1-local-pre-rewrite-20261021 (delete when sure).
- Wave 1 (engine) in progress, tickets built by agents, none merged, no Jira status moved yet:
  - KAN-68 built-in AI engine: PR #52 (feat/KAN-68-builtin-ai-engine, head b7d7f39). Opus review done, all 7 findings fixed, CI green. Needs a re-check of the fixes, then merge into the phase.
  - KAN-193 binaries out of git: PR #51 (f5ed433). Cannot merge until the owner creates the pre-release `binaries-whisper-v1` and uploads the 9 Whisper files (from the commit before f5ed433). History removal waits for KAN-191.
- Remaining Wave 1 order after #52 merges: KAN-89, 90, 69, 72, 71, 70, 91. Wave 2 first run (KAN-75, 76, 78, 79, 80, 87, 81, 82, 64), wave 3 polish, wave 4 housekeeping. Wave 0 left over: KAN-342 (in progress), KAN-385, test KAN-60 and KAN-54.

## Needs the owner
1. Create release `binaries-whisper-v1` and upload the files (PR #51).
2. Installer size: win-x64 prebuilts are 632 MB unpacked (cpu 30, vulkan 71, cuda 169, cuda-ext 351, arm64 11). Agent recommends shipping CPU and Vulkan only.
3. Encryption/recovery tickets (KAN-177, 178, 181, 183, 77) clash with the rule that the password encrypts nothing. Re-scope before building.

## Decisions made
- Provider rule (KAN-68): built-in engine only when aiProvider is set to it or both GGUFs are on disk at verified size; otherwise Ollama. Ollama stays a full provider (KAN-79 needs it). Revisit when KAN-69/72/78 ship the setup UI.
- The KAN-68 review ran as a fresh Opus agent although the author was Opus (author and judge must differ).

## Not verified on KAN-68
Real GPU driver crash, real Ollama, packaged installer, Mac. Real-app Ask took 50 s on one rerun (6 s before); cause unconfirmed, check on the retest.

## Rules that bit us
- Read this file before deciding on ticket targets; owner decisions listed in earlier handoffs stand.
- Create Jira bugs without fixVersions; set them in a separate edit. Labels are set-full on edit.
- CI installs with `npm ci --ignore-scripts`: no electron binary. Do not import electron at module top level in code that tests load.
- Inline vs agent (orchestrator.md): small edits, docs, Jira moves and merges inline; coding with tests, real-app tests and diff review go to agents.
- Never run install/uninstall tests on this machine: %APPDATA%\MindSage holds the real journal. Never pkill. Stage by explicit path.
