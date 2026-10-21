# MindSage handoff (2026-10-21, P2 wave 1 in progress)

You are the ORCHESTRATOR. Read CLAUDE.md, then docs/agent/orchestrator.md and docs/agent/terse-output.md. Tell the owner at most 2-3 lines, only when asked or when blocked. Start with `git fetch origin`.

## State
- Repo: Arinaymaybhaskar/MindSage_desktop_app. Jira KAN, cloudId 5ff5bb5a-94c3-42d4-ae17-384d856cb56f. P2 fix version id 10001 ("P2 Remove the setup wall", release 2026-11-23, gate: 7 of 10 testers install and get their first AI reflection without help).
- Flow: ticket branch -> phase/p2-remove-the-setup-wall -> dev -> main. P1 is merged into dev.
- Merged into the P2 phase: KAN-68 built-in AI engine (PR #52), KAN-89 separate AI calls (PRs #54, #55; #55 fixed a lost-edit bug found in the Opus review). Both are Ready for testing with QA comments; no tester has run them yet.
- P2 Jira: Ready for testing KAN-68, 89, plus wave 0 leftovers KAN-60 and KAN-54; KAN-342 In Progress; KAN-385 To Do (needs a clean Windows account). About 33 stories still To Do.
- Open PR: #51 (KAN-193 binaries out of git, f5ed433). Blocked on the owner creating the pre-release `binaries-whisper-v1` and uploading the 9 Whisper files. History removal waits for KAN-191.

## Next (wave 1 order)
1. KAN-90 async cached model list (not started; read the ticket first, it may touch electron/ai files).
2. KAN-69, 72, 71, 70, 91. Then wave 2 (KAN-75, 76, 78, 79, 80, 87, 81, 82, 64), wave 3 polish, wave 4 housekeeping.
3. A tester agent (sonnet, high, one per area, qa-kit.md) for KAN-68 and KAN-89 once KAN-90 lands, or earlier if the owner asks.
4. Bugs filed this phase (P2, phase-2-closeout): KAN-386 CPU fallback never clears and log GPU layers/context; KAN-387 300-token cap truncates long Ask answers; KAN-390 Ask can wait up to 5 min behind a running background call; KAN-392 people extraction bypasses the shared AI queue; KAN-393 trashed entry stays pending after restore. KAN-391 (search index fails on blank or too-long entries) was filed by someone else. Confirm the fix version on KAN-392 and KAN-393.
5. KAN-388: ONNX runtime with a GoEmotions-style feelings classifier and an NLI entailment gate, split from KAN-89 because neither model nor runtime existed. Unverified-summary marking waits for it. Measure the added size (estimate 100-250 MB, unmeasured).

## Needs the owner
1. Create release `binaries-whisper-v1` and upload the files (PR #51).
2. Installer size: win-x64 prebuilts are 632 MB unpacked (cpu 30, vulkan 71, cuda 169, cuda-ext 351, arm64 11). Agent recommends CPU and Vulkan only.
3. Encryption/recovery tickets (KAN-177, 178, 181, 183, 77) clash with the rule that the password encrypts nothing. Re-scope before building.
4. Delete KAN-389 in the Jira UI (duplicate of KAN-388, linked as one; the connector cannot delete issues).
5. The owner's checkout had an incomplete node_modules (no .bin): `git switch phase/p2-remove-the-setup-wall`, `git pull`, `npm ci` (without --ignore-scripts), then `npm run dev`.

## Decisions made
- Provider rule (KAN-68): built-in engine only when aiProvider is set to it or both GGUFs are on disk at verified size; otherwise Ollama. Ollama stays a full provider (KAN-79 needs it).
- ONNX (onnxruntime-node, CPU) for the classifier and the NLI gate, as its own ticket (KAN-388); KAN-89 closes on what is merged.
- Reviews run as fresh Opus agents, never the author.

## Not verified
KAN-68: real GPU driver crash, real Ollama, packaged installer, Mac. The 50 s Ask was not reproduced (9 Asks 3.6 to 4.8 s); likely GPU or disk contention. KAN-89: bench thresholds (69% group, 88% fully supported) need real models; Ask holding back a background job and the model swap on a one-model PC are unit-tested only.

## Rules that bit us
- Read this file before deciding on ticket targets; owner decisions listed in earlier handoffs stand.
- The Jira connector is flaky (searches time out, some calls hang 300 s). After a timeout, read the issue to see whether the write applied before retrying; a retried create made a duplicate (KAN-389). Use `issueType` and `additional_fields` on createJiraIssue. Create bugs without fixVersions; set them in a separate edit (`fields: {"fixVersions":[{"id":"10001"}]}`). Labels are set-full on edit.
- A Haiku batch agent stopped midway and left partial work; verify Jira state after any agent batch.
- CI installs with `npm ci --ignore-scripts`: no electron binary. Do not import electron at module top level in code that tests load.
- `npm run test:db` fails 16 tests on Windows with EBUSY temp cleanup (known; CI Linux is authoritative).
- Inline vs agent (orchestrator.md): small edits, docs, Jira moves and merges inline; coding with tests, real-app tests and diff review go to agents.
- Never run install/uninstall tests on this machine: %APPDATA%\MindSage holds the real journal. Never pkill. Stage by explicit path. Hooks block commands that chain `sleep`; use Monitor.
