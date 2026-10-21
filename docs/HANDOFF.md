# MindSage handoff (2026-10-22 c, P2 waves 2 and 3 built, wave 4 started)

You are the ORCHESTRATOR. Read CLAUDE.md, then docs/agent/orchestrator.md and docs/agent/terse-output.md. Tell the owner at most 2-3 lines, only when asked or when blocked. Start with `git fetch origin` and `git pull` (merge, never rebase), then read this file again if the pull changed it.

## State
- Repo: Arinaymaybhaskar/MindSage_desktop_app. Jira KAN, cloudId 5ff5bb5a-94c3-42d4-ae17-384d856cb56f. P2 fix version id 10001 ("P2 Remove the setup wall", release 2026-11-23, gate: 7 of 10 testers install and get their first AI reflection without help).
- Flow: ticket branch -> phase/p2-remove-the-setup-wall -> dev -> main. Never merge the phase branch to dev until the owner says so.
- Owner instruction (2026-10-22): no testing and no reviewing for now. Built tickets carry the Jira label `not-reviewed`; Jira statuses are NOT moved.
- Merged into the P2 phase, built, unreviewed and untested: KAN-90, 69, 72, 71, 91, 70, 82, 64, 78, 87, 75, 79 (#67), 76 (#69), 80 (#70), 81 (#73), 65 (#74), 66 (#75), 73 (#76), 86 (#77), plus CI fix #71. All carry the `not-reviewed` label and the Jira status "Not reviewed" (checked in Jira 2026-10-22). CI (typecheck/lint, db, Windows e2e) was green on every PR before merge, including #73 to #77; the phase branch itself has no push-triggered CI run, so its tip after the merges is only covered by those PR runs. Reviewed earlier by Opus: KAN-68, KAN-89.
- Open: #51 KAN-193 binaries out of git, blocked on the owner.
- KAN-81 was built WITHOUT its blockers: KAN-162 (daily nudge, fix version P3) and KAN-313 (Windows Hello, release-later) are still To Do and unbuilt. The screen's reminder toggle only stores `journal_reminder` and `reminder_time` and fires nothing; Windows Hello is hidden behind `helloAvailable()`, which returns false. Do not build 162/313 in P2 unless the owner says so.

## Next
1. Wave 4 housekeeping, in progress: KAN-169 (lint electron/ and scripts/, branch chore/KAN-169-lint-main-process, agent launched; check for its PR). Candidates after it: remove the unused packages listed under KAN-86 below (no ticket yet; file one first), KAN-388, bugs 386/387/390/392/393. No review or test per the owner.
2. Review first, when the owner lifts the pause: KAN-76 migration 10 (rebuilds `users`, email nullable; the migration runner now turns foreign keys off around migrations marked `rebuildsTables` and runs foreign_key_check; a mistake would delete journal entries via cascade). Never run on a real profile yet.
3. KAN-80 placement conflict: first-run /setup runs before sign-up, so its import step only works with a signed-in profile (new installs see a pointer to Settings). The design changes list (2026-10-20) moved WIN-145 to after the first saved entry. Owner decides where the screen goes.
4. Bugs filed this phase (P2, phase-2-closeout): KAN-386, 387, 390, 392, 393; KAN-391 by someone else. Confirm the fix version on KAN-392 and KAN-393. The two CI fixes in #71 were committed under Refs KAN-70/KAN-75 with no bug ticket.
5. KAN-388: ONNX runtime feelings classifier and NLI gate; KAN-69 has a TODO(KAN-388) hook. Measure added size.

## Facts from this session's agents (things later work must know)
- KAN-76: profile name is the existing `username` column; sign-up is one screen (`/register`), zxcvbn lazy-loaded (main chunk 1,871 kB to 1,046 kB, zxcvbn own 819 kB chunk); weak passwords blocked (score >= 3). `media:save-profile` path traversal fixed. Stepper.tsx deleted.
- KAN-80: imports batch 250 entries per transaction; imported entries skip per-entry AI; newest 200 get one backfill (`backfillEnrichment` in electron/methods/ollama.js, capped, idempotent). Settings imports get the same; Undo refused while importing. Ollama-without-choosing users get no immediate backfill (Retry shown).
- No sidebar exists, only the dock: the KAN-64 status card is mounted fixed bottom-left in App.tsx; its compact rail is not mounted anywhere. Card wording is the agent's own (the "board" wording was not available): ask the owner for it.
- KAN-69/72/71/70/79/78/87 have NO UI; the Settings > Models picker, dialogs and Advanced sheet belong to the design tickets. ModelDialog and VoiceModelPrompt exist (VoiceModelPrompt is mounted from journalForm; ModelDialog is not mounted).
- KAN-72: if the free-space read fails the check passes (Infinity) and the download proceeds. Metered-connection warning not done (Electron cannot detect it cheaply); KAN-78 asks every first-time user once instead.
- KAN-69: the speed probe bypasses the AI queue and can overlap a background job; speeds for non-probed models are scaled by file size (`speedMeasured: false`). Llama 3.1 8B added as on-request, pinned revision + SHA-256 from Hugging Face headers.
- KAN-91: Whisper tiny model removed from git; base.en and small via the shared downloader; hashes from HF headers. package.json untouched to avoid conflicting with #51; a dev machine with the old model in resources/ still bundles it.
- KAN-78/87: Ollama path only waits for the registry then emits `pull-model`; that pull has no resume or checksum. Backfill retries every `failed` entry once after models arrive (broader than "failed for lack of models").
- KAN-79: openai-compatible URLs loopback-only, no redirects; .gguf path from a main-process dialog, header check only; a .gguf provider still needs the built-in embedding model; OpenAI server must serve 768-dim nomic embeddings; settings live in the global modelStore, not per user.
- KAN-70: "feelings" was read as the mood tags (owner has not confirmed); suggestions switch only blocks generateSuggestion (not queued).
- KAN-75: welcome only while no profile exists; restore goes sign-up first, then Settings > Import & Export. The first-run /setup page still comes before the welcome.
- KAN-81: migration 11 adds `users.reminder_time`; each toggle saves at once; Continue opens Today. App.tsx routes to the screen from Onboarding.
- KAN-65: Sync All button, `search:bulk-sync` handler, preload entry and `searchService.bulkSync` are gone; indexing is automatic only. `retryGaveUp` in searchIndex.js is now unused by any handler (dead code, remove later).
- KAN-66: GlobalSearch empty state polls `search:status` every 3 s while shown ("Still reading n entries", write-first message, index-unavailable notice). No component test (GlobalSearch has none).
- KAN-73: damaged zip is named and skipped, the rest imports with a warning (all damaged: one error); locked file and disk full have own messages; commit failure rolls back entries and media and keeps the preview. Commit rollback and locked-file paths have no test (db tests cannot run on Windows). Files of another format in a mixed set are ignored silently.
- KAN-86: 15 renderer-only packages moved to devDependencies (list in PR #77). Packages imported nowhere look removable: @google/genai, axios, buffer, dotenv, google-auth-library, lottie-react, react-hot-toast, react-speech-recognition, recharts, uuid, zod-to-json-schema. Installer size, app.asar contents and a packaged smoke test are NOT verified.
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
- When you write the next handoff and the first prompt for the following session, the prompt must tell that session to run `git fetch origin` and `git pull` (merge any open handoff PR first) before reading this file.
- Read this file before deciding on ticket targets; owner decisions listed in earlier handoffs stand.
- The auto-mode classifier denies `gh pr merge` and Jira label edits as "merge without review" until the owner says "merge" in that turn; then retry once. Never the phase branch into dev. If denied, report and stop, do not work around it.
- CI e2e (`scripts/e2e/run.mjs`) follows the UI text: welcome -> Get started -> Create your profile -> #password -> Create profile. Change the script whenever a first-run screen changes. CI unit tests must not import electron (mock `electron-store`).
- The Jira connector is flaky (searches time out, some calls hang 300 s). After a timeout, read the issue to see whether the write applied before retrying. Use `issueType` and `additional_fields` on createJiraIssue. Create bugs without fixVersions; set them in a separate edit (`fields: {"fixVersions":[{"id":"10001"}]}`). Labels are set-full on edit. transitionJiraIssue needs `transitionName`, not `transition`.
- A Haiku batch agent stopped midway and left partial work; verify Jira state after any agent batch.
- CI installs with `npm ci --ignore-scripts`: no electron binary. Do not import electron at module top level in code that tests load.
- `npm run test:db` fails 16 tests on Windows with EBUSY temp cleanup (known; CI Linux is authoritative). Full `npm test` has flaky timeouts in log.test.js and hooks.test.mjs under load; they pass alone.
- Parallel agents in separate worktrees worked when their file areas differed; run agents that touch electron/ai one at a time.
- Inline vs agent (orchestrator.md): small edits, docs, Jira moves and merges inline; coding with tests goes to agents.
- Never run install/uninstall tests on this machine: %APPDATA%\MindSage holds the real journal. Never pkill. Stage by explicit path. Hooks block commands that chain `sleep`; use Monitor.
