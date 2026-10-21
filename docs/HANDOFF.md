# MindSage handoff (2026-10-22, P2 wave 1 done, wave 2 in progress)

You are the ORCHESTRATOR. Read CLAUDE.md, then docs/agent/orchestrator.md and docs/agent/terse-output.md. Tell the owner at most 2-3 lines, only when asked or when blocked. Start with `git fetch origin` and `git pull` (merge, never rebase), then read this file again if the pull changed it.

## State
- Repo: Arinaymaybhaskar/MindSage_desktop_app. Jira KAN, cloudId 5ff5bb5a-94c3-42d4-ae17-384d856cb56f. P2 fix version id 10001 ("P2 Remove the setup wall", release 2026-11-23, gate: 7 of 10 testers install and get their first AI reflection without help).
- Flow: ticket branch -> phase/p2-remove-the-setup-wall -> dev -> main. Never merge the phase branch to dev until the owner says so.
- Owner instruction (2026-10-22): no testing and no reviewing for now. Built tickets carry the Jira label `not-reviewed`; Jira statuses are NOT moved. Keep building the To Do list.
- Merged into the P2 phase and built, unreviewed and untested: KAN-90 (#57), 69 (#58), 72 (#59), 71 (#60), 91 (#61), 70 (#62), 82 (#63), 64 (#64), 78+87 (#65), 75 (#66). Reviewed earlier by Opus: KAN-68 (#52), KAN-89 (#54, #55).
- Open PRs: #67 KAN-79 advanced setup (179325b, built, unmerged: merge it first). #51 KAN-193 binaries out of git, blocked on the owner (see below).
- `not-reviewed` label is set on KAN-90, 69, 72, 71, 91, 70 only. STILL TO LABEL: KAN-64, 75, 78, 82, 87, 79 (labels are set-full on edit: read the issue, send the whole list plus `not-reviewed`).
- Jira status of KAN-90 is Ready for testing; 69, 72, 71, 91, 70 and the rest of this wave are still To Do. Decide with the owner whether to move them.

## Next
1. Merge #67 (owner pre-approved merging finished PRs into the phase branch; the auto-mode classifier may still ask, retry on the owner's word). Label the six tickets above.
2. Wave 2 left: KAN-76 simpler sign-up (opus-review; needs the profile-name migration first, check it exists; zxcvbn lazy-loaded; bundle report), KAN-80 import during setup (opus-review), KAN-81 You're-set screen (needs daily nudge and Windows Hello tickets; check dependencies first). Opus `high` for the two opus-review ones, no review/test per the owner.
3. Then wave 3 polish, wave 4 housekeeping.
4. Bugs filed this phase (P2, phase-2-closeout): KAN-386 CPU fallback never clears and log GPU layers/context; KAN-387 300-token cap truncates long Ask answers; KAN-390 Ask can wait up to 5 min behind a running background call; KAN-392 people extraction bypasses the shared AI queue; KAN-393 trashed entry stays pending after restore. KAN-391 (search index fails on blank or too-long entries) was filed by someone else. Confirm the fix version on KAN-392 and KAN-393.
5. KAN-388: ONNX runtime with a GoEmotions-style feelings classifier and an NLI entailment gate. KAN-69's under-8 GB feelings path has a TODO(KAN-388) hook. Measure added size (estimate 100-250 MB, unmeasured).

## Facts from this session's agents (things later work must know)
- No sidebar exists, only the dock: the KAN-64 status card is mounted fixed bottom-left in App.tsx; its compact rail is not mounted anywhere. Card wording is the agent's own (the "board" wording was not available): ask the owner for it.
- KAN-69/72/71/70/79/78/87 have NO UI; the Settings > Models picker, dialogs and Advanced sheet belong to the design tickets. ModelDialog and VoiceModelPrompt exist (VoiceModelPrompt is mounted from journalForm; ModelDialog is not mounted).
- KAN-72: if the free-space read fails the check passes (Infinity) and the download proceeds. Metered-connection warning not done (Electron cannot detect it cheaply); KAN-78 asks every first-time user once instead.
- KAN-69: the speed probe bypasses the AI queue and can overlap a background job; speeds for non-probed models are scaled by file size (`speedMeasured: false`). Llama 3.1 8B added as on-request, pinned revision + SHA-256 from Hugging Face headers.
- KAN-91: Whisper tiny model removed from git; base.en and small via the shared downloader; hashes from HF headers. package.json untouched to avoid conflicting with #51; a dev machine with the old model in resources/ still bundles it.
- KAN-78/87: Ollama path only waits for the registry then emits `pull-model`; that pull has no resume or checksum. Backfill retries every `failed` entry once after models arrive (broader than "failed for lack of models").
- KAN-79: openai-compatible URLs loopback-only, no redirects; .gguf path from a main-process dialog, header check only; a .gguf provider still needs the built-in embedding model; OpenAI server must serve 768-dim nomic embeddings; settings live in the global modelStore, not per user.
- KAN-70: "feelings" was read as the mood tags (owner has not confirmed); suggestions switch only blocks generateSuggestion (not queued).
- KAN-75: welcome only while no profile exists; restore goes sign-up first, then Settings > Import & Export. The first-run /setup page still comes before the welcome.
- Not verified anywhere in this wave: the real app was launched for none of these tickets; no real GPU, Ollama, LM Studio, network drop, packaged build or Mac. gitleaks and lint-staged are not installed in worktrees (hooks skip them).

## Needs the owner
1. Create release `binaries-whisper-v1` and upload the files (PR #51). History removal waits for KAN-191.
2. Installer size: win-x64 prebuilts are 632 MB unpacked (cpu 30, vulkan 71, cuda 169, cuda-ext 351, arm64 11). Agent recommends CPU and Vulkan only.
3. Encryption/recovery tickets (KAN-177, 178, 181, 183, 77) clash with the rule that the password encrypts nothing. Re-scope before building.
4. Delete KAN-389 in the Jira UI (duplicate of KAN-388; the connector cannot delete issues).
5. Confirm "feelings" = mood tags (KAN-70) and give the status-card wording (KAN-64).
6. The owner's checkout had an incomplete node_modules (no .bin): `git switch phase/p2-remove-the-setup-wall`, `git pull`, `npm ci` (without --ignore-scripts), then `npm run dev`.

## Decisions made
- Provider rule (KAN-68): built-in engine only when aiProvider is set to it or both GGUFs are on disk at verified size; otherwise Ollama. Ollama stays a full provider.
- ONNX (onnxruntime-node, CPU) for the classifier and the NLI gate, as its own ticket (KAN-388).
- Reviews run as fresh Opus agents, never the author (paused by the owner for now).

## Rules that bit us
- Read this file before deciding on ticket targets; owner decisions listed in earlier handoffs stand.
- The auto-mode classifier denies `gh pr merge` as "merge without review"; the owner has approved merging finished ticket PRs into the phase branch, never the phase branch into dev. If denied, report and stop, do not work around it.
- The Jira connector is flaky (searches time out, some calls hang 300 s). After a timeout, read the issue to see whether the write applied before retrying. Use `issueType` and `additional_fields` on createJiraIssue. Create bugs without fixVersions; set them in a separate edit (`fields: {"fixVersions":[{"id":"10001"}]}`). Labels are set-full on edit. transitionJiraIssue needs `transitionName`, not `transition`.
- A Haiku batch agent stopped midway and left partial work; verify Jira state after any agent batch.
- CI installs with `npm ci --ignore-scripts`: no electron binary. Do not import electron at module top level in code that tests load.
- `npm run test:db` fails 16 tests on Windows with EBUSY temp cleanup (known; CI Linux is authoritative). Full `npm test` has flaky timeouts in log.test.js and hooks.test.mjs under load; they pass alone.
- Parallel agents in separate worktrees worked when their file areas differed; run agents that touch electron/ai one at a time.
- Inline vs agent (orchestrator.md): small edits, docs, Jira moves and merges inline; coding with tests goes to agents.
- Never run install/uninstall tests on this machine: %APPDATA%\MindSage holds the real journal. Never pkill. Stage by explicit path. Hooks block commands that chain `sleep`; use Monitor.
