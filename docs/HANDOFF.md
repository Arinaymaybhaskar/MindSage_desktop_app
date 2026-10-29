# MindSage handoff (2026-10-29 late night, P2: all built code merged except KAN-445)

## 2026-10-29 late night (read first; supersedes the sections below where they differ)
- #103 (KAN-388) and #104 are merged. Phase branch holds #47 to #104. Jira: KAN-193, 342, 388, 435, 436, 437, 464 moved to Ready for testing. KAN-389 is a duplicate of 388: comment added, the owner must close it (auto mode denied the move to Done). Many other P2 tickets still read "Not reviewed" or To Do in Jira although merged; check each against `git log` before the QA pass.
- Merged on the owner's "merge" after CI was green (Typecheck & Lint, DB tests, e2e Windows): #105 KAN-454 (d79d8df), #107 KAN-446 (b57b700), #109 KAN-444 (931006a), #111 KAN-447 (1b27090), #106 KAN-400 step bar (5ea9d36), #108 KAN-433 You're set simplified (251bbd4). No agents were running at that point. No PRs are open except this handoff. KAN-445 (40-question Ask test set) is the only P2 ticket not built; it scores 446/447.
- Ask track notes (agent report, CI-confirmed only): #105 also refuses a chat id that is not the signed-in profile's (not in the ticket; Ask used to write to whatever id the renderer sent). #107: Discreet entries (KAN-196) and an "AI access off" switch do not exist in code, so KAN-446's criteria about them are unmet and nothing filters them. #109: last 8 messages, fixed 2,400-character budget, not per-model tokens. #111: `count` runs `search_entries` until KAN-143; it changed `scripts/bench/bench-rag.mjs` and `scripts/qa/fake-ollama.mjs`; the agent skipped the quick-bench hook on all four commits (`MS_SKIP_BENCH=1`), so run the bench before the phase gate. Not verified: abort mid-answer, follow-ups from history, small-model intent and date picking, "passes the Ask test set". Local `ollama.models.test.js` fails without `onnxruntime-node` installed in a worktree (CI passes); `log.test.js` rotation is flaky in the full run.
- Owner decisions: no Recovery key screen until encryption is planned (later phase); setup step bar has 2 steps (Profile, Local AI), You're set is not counted; import is an optional button on You're set (KAN-436 stands); KAN-432 is dropped (superseded, comment added, owner closes it). Reminder, suggestions and Windows Hello controls are gone from You're set and Settings has none: reminders KAN-17/108/162 and suggestions KAN-117 are P3; new KAN-467 (Windows Hello toggle in Settings) filed under KAN-21 for P3 (the fix version was set by an edit; confirm it shows in Jira).
- Next: set Jira statuses for the merged tickets (454, 446, 444, 447, 400, 433 to Ready for testing; the owner closes 389 and 432), build KAN-445, then ONE Opus diff review and ONE Sonnet QA pass over all of P2 (grouped, not per ticket), then KAN-191 and KAN-385, `bench:phase -- 2`, the owner's own test, phase to `dev`.
- Not verified anywhere: packaging, bench targets, installer size, the release.yml cache step, a real installer build, Ask with a real Ollama model ("what did I write last week?" for KAN-342), the app launch for #106 and #108. Open owner decisions on #103 still stand (model hosting, thresholds and label map, the ~38 MB unused DLLs, Ollama users never get the ONNX files).
- Handoff rule (owner): only update this file when no agents are running. If an agent is running, wait until it has completed and reported, then write the handoff.
- Rules that bit us: a subagent id cannot be resumed after its session ends (the KAN-388 agent had to be redone); a Sonnet agent found KAN-400's premise false (no step bar, no Recovery key screen) so check a ticket's premise against the code before briefing; Jira fix versions cannot be set at create time, edit afterwards.

## 2026-10-29 night (older, partly superseded by the section above)
- Owner said "merge" and everything green is merged into the phase branch: #82 to #102 (incl. #51 KAN-193, #101 KAN-437, #102 KAN-438). Nothing is reviewed or tested; the owner wants ONE full review and QA pass after all code is written, then KAN-191 and KAN-385.
- Agent grouping rule (owner): one Opus agent for all Opus-tier tickets, one Sonnet agent for all Sonnet-tier tickets, never one agent per ticket. Review and QA the same way.
- Open: #103 (KAN-388, ONNX classifier and NLI gate, Opus). It conflicted with #101 in `fillMetadata` (ollama.js). The Opus agent (id a08e5e22d85552137, resume with SendMessage) was asked to merge phase into it, switch the classifier's "keep words if the chat model fails" path from tags to `setSuggestedTags`, check the migration number (phase has 13 from #101), reconcile with #51's manifest, and post the KAN-388 size comment in Jira. Check `gh pr view 103` for its commit and CI, then merge when green and the owner says "merge".
- Owner decisions open in #103: model hosting (Hugging Face, pinned revision plus SHA-256), the two thresholds and the label-to-word map, whether to drop ~38 MB of probably unused DLLs, Ollama users never get the ONNX files (64 MB uncompressed added). Not verified: packaging, bench targets, installer size.
- KAN-437 (#101): feeling words are no longer saved as tags; migration 13 adds `journal_entries.suggested_tags`; the entry page shows them as unticked boxes; `journal:accept-feeling` adds the tag. The old five AI-switch keys are ignored. No Settings screen shows the switches yet and the tick UI has no render test.
- KAN-193: release `binaries-whisper-v1` exists (9 assets; the manifest uses 8, `ggml-tiny.en.bin` is unused). Real download verified. Not verified: release.yml cache step, a real installer build.
- KAN-191 (history scrub, force-push of main): the owner must lift main's no-force-push rule for one push; do it only with no open PRs and `backup/pre-history-scrub` pushed first. Expect the auto-mode classifier to refuse; the owner runs the push.
- KAN-385 (uninstaller on a clean Windows VM): owner tests later. KAN-83 landing page moved to P4. KAN-77/177/178/181/183 are P5.
- Known: KAN-434 (optional CUDA download) has no fix version and its offer rarely shows on driver-only PCs (needs cublas64_13.dll). `npm run test:coverage` exists (local only, baseline 33.0% lines). `npm run test:db` fails with EBUSY on Windows; CI on Linux is authoritative. The auto-mode classifier denies `gh release create`; the owner ran it.

## 2026-10-29 evening (older, partly superseded by the night section above)
- Owner said "merge": #82 to #99 are merged into the phase branch, except #51. Open at the end: #100 (this handoff), #101, #102, #51. Built and merged this session: KAN-435 (#93), 436 (#94), 439 (#95, with 391), 434 (#96, optional CUDA download), 440 (#97), 441 (#98), 464 (#99, `npm run test:coverage`, local only, baseline 33.0% lines). None reviewed or tested; the owner wants one full review and QA pass after all code is written.
- Agent grouping rule (owner): one Opus agent for all Opus-tier tickets, one Sonnet agent for all Sonnet-tier tickets, not one agent per ticket. Review and QA the same way, after the code is done.
- The Opus agent (id a08e5e22d85552137) built KAN-437 (#101) and KAN-438 (#102), then hit the 5-hour usage limit (resets 19:30 IST on 2026-10-29). KAN-388 (ONNX classifier) is NOT done or not in a PR yet: after the reset, `SendMessage` to that agent id to continue KAN-388, or start one Opus agent for it. Merge #101 and #102 when CI is green.
- KAN-83 (landing page) moved to P4 (fix version and `release-p4`).
- KAN-193 (#51): the owner created release `binaries-whisper-v1` (9 assets, hashes verified before upload). The Sonnet agent merged phase into #51 (1c25c84) and the real download of 8 files verified. `ggml-tiny.en.bin` was dropped from the manifest because KAN-91 no longer bundles it, so the release's 9th asset is unused. Merge #51 once its CI is green. Not verified: release.yml cache step, a real installer build.
- KAN-191 (history scrub, force-push) is blocked on KAN-193 (same rewrite) and needs the owner to lift main's no-force-push rule for one push. Do it only with no open PRs and the backup branch pushed first.
- KAN-385 (uninstaller, needs a clean Windows VM): owner tests later.
- Remaining P2 To Do after the above: KAN-191, 193, 385 only. KAN-77/177/178/181/183 are P5.
- Known: the CUDA runtime (cublas64_13.dll) is absent on driver-only PCs, so the KAN-434 offer rarely shows; KAN-434 has no fix version yet. `npm run test:db` fails with EBUSY on Windows; CI on Linux is authoritative.

# (older) 2026-10-29 section follows

## 2026-10-29 decisions (owner) and new tickets
- Installer ships CPU and Vulkan engine binaries only. CUDA becomes an optional post-install download for Nvidia GPUs: KAN-434 (no fix version yet). This unblocks KAN-388 (ONNX).
- The password only locks the profile; it encrypts nothing. KAN-77, 177, 178, 181, 183 moved to fix version P5 (label release-p5). Their descriptions still say "encrypts" and name old releases; rewrite when the real encryption project is scoped.
- KAN-80 import placement: after sign-up, optional, never blocking (a skippable line on You're set). Ticket KAN-436.
- KAN-70 "feelings" means the KAN-94 feeling words (built-in plus custom). Mood stays the KAN-93 five words under "Enrich entries". The merged KAN-70 build read it as mood tags, so rework is KAN-437, after #90 merges. The owner already edited KAN-70's description.
- KAN-64 status card wording is the table in KAN-64's own description (title plus second line per state). The agent said the wording was unavailable; it was in Jira. The built card does not match it. Ticket KAN-435.
- Follow-ups, all filed as P2 bugs with `found-in-phase-2`, `phase-2-closeout`: KAN-438 People extraction yields to Ask (after #86 merges), KAN-439 chat and search query embeds untruncated, KAN-440 profile names case-insensitive, KAN-441 last-import record deleted with its profile.
- Owner said not to worry about timelines.
- Not done: the owner's own actions (release `binaries-whisper-v1` for PR #51; delete KAN-389 in the Jira UI). All 11 PRs (#82, #84 to #92) are CI green and unmerged, mergeable and clean individually; #89 and #90 will conflict in AIPrompts.js, and #90 uses migration 12. Merge only when the owner says "merge", #83 first.

You are the ORCHESTRATOR. Read CLAUDE.md, then docs/agent/orchestrator.md and docs/agent/terse-output.md. Tell the owner at most 2-3 lines, only when asked or when blocked. Start with `git fetch origin` and `git pull` (merge, never rebase), then read this file again if the pull changed it.

## State
- Repo: Arinaymaybhaskar/MindSage_desktop_app. Jira KAN, cloudId 5ff5bb5a-94c3-42d4-ae17-384d856cb56f. P2 fix version id 10001 ("P2 Remove the setup wall", release 2026-11-23, gate: 7 of 10 testers install and get their first AI reflection without help).
- Flow: ticket branch -> phase/p2-remove-the-setup-wall -> dev -> main. Never merge the phase branch to dev until the owner says so.
- Owner instruction (2026-10-22): no testing and no reviewing for now. Built tickets carry the Jira label `not-reviewed`; Jira statuses are NOT moved.
- Merged into the P2 phase, built, unreviewed and untested: KAN-90, 69, 72, 71, 91, 70, 82, 64, 78, 87, 75, 79 (#67), 76 (#69), 80 (#70), 81 (#73), 65 (#74), 66 (#75), 73 (#76), 86 (#77), 169 (#79), 394 (#80), plus CI fix #71. All carry the `not-reviewed` label and the Jira status "Not reviewed" (checked in Jira 2026-10-22). CI (typecheck/lint, db, Windows e2e) was green on every PR before merge, including #73 to #77; the phase branch itself has no push-triggered CI run, so its tip after the merges is only covered by those PR runs. Reviewed earlier by Opus: KAN-68, KAN-89.
- Open: #51 KAN-193 binaries out of git, blocked on the owner.
- KAN-81 was built WITHOUT its blockers: KAN-162 (daily nudge, fix version P3) and KAN-313 (Windows Hello, release-later) are still To Do and unbuilt. The screen's reminder toggle only stores `journal_reminder` and `reminder_time` and fires nothing; Windows Hello is hidden behind `helloAvailable()`, which returns false. Do not build 162/313 in P2 unless the owner says so.

## Next
1. Open PRs against the phase branch, all built, unreviewed, untested, NOT merged (owner said do not merge): #82 KAN-393, #84 KAN-386, #85 KAN-387, #86 KAN-390, #87 KAN-392, #88 KAN-391, #89 KAN-93, #90 KAN-94, #91 KAN-67, #92 KAN-74 (#92 CI was pending). CI green on #82 and #84 to #91. All their Jira tickets carry `not-reviewed` and sit in Not reviewed. Merge only when the owner says "merge". Expect conflicts: AIPrompts.js between #89 and #90; migration numbering (#90 uses 12). Merge #83 (this handoff) first.
2. Follow-ups noted by agents: after #86 merges, People extraction (#87) should also use `yieldToAsk`. Chat and search query embeds (`methods/chat.js`, `methods/search.js`) still send untruncated text (KAN-391 covered the indexer only). `scripts/qa/app.mjs` sign-up still fills #email and #full_name (removed by KAN-76). KAN-74: the last-import record is not deleted when its profile is deleted. KAN-67: names compare case-sensitively ("Maya" and "maya" both allowed). Custom feeling words with comma, ; or | are refused (KAN-94). No tag filter exists in the app, so KAN-94 "appears in filters" had nothing to extend.
3. Remaining P2 To Do: KAN-388 (ONNX, waits on installer-size decision), KAN-77/177/178/181/183 (encryption/recovery, clash with "password encrypts nothing", re-scope), KAN-83 (landing page), KAN-191 and KAN-193 (blocked on owner), KAN-385 (needs hardware). Nothing else buildable in P2 without an owner decision.
4. Review first, when the owner lifts the pause: KAN-76 migration 10 and KAN-94 migration 12 (never run on a real profile yet).
5. KAN-80 placement conflict: first-run /setup runs before sign-up, so its import step only works with a signed-in profile. Owner decides where the screen goes.
6. The phase branch has no CI run of its own (CI triggers on push to main and on PRs only).

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
- KAN-65: Sync All button, `search:bulk-sync` handler, preload entry and `searchService.bulkSync` are gone; indexing is automatic only. `retryGaveUp` in electron/db/searchIndex.js has no handler caller but its db test uses it; kept (KAN-394).
- KAN-66: GlobalSearch empty state polls `search:status` every 3 s while shown ("Still reading n entries", write-first message, index-unavailable notice). No component test (GlobalSearch has none).
- KAN-73: damaged zip is named and skipped, the rest imports with a warning (all damaged: one error); locked file and disk full have own messages; commit failure rolls back entries and media and keeps the preview. Commit rollback and locked-file paths have no test (db tests cannot run on Windows). Files of another format in a mixed set are ignored silently.
- KAN-86: 15 renderer-only packages moved to devDependencies (list in PR #77). The 11 packages imported nowhere were removed in KAN-394 (#80); scripts/capture-shots.mjs still has stale `.recharts-*` selectors. KAN-169: ESLint now covers electron/ and scripts/ (no-unused-vars ignores unused args; `@ts-check` on pure modules skipped, typecheck only covers src). Installer size, app.asar contents and a packaged smoke test are NOT verified.
- Not verified anywhere in this wave: the real app was launched for none of these tickets; no real GPU, Ollama, LM Studio, network drop, packaged build or Mac. gitleaks and lint-staged are not installed in worktrees (hooks skip them).

## Needs the owner
1. Create release `binaries-whisper-v1` and upload the files (PR #51). History removal waits for KAN-191.
2. Delete KAN-389 in the Jira UI (duplicate of KAN-388; the connector cannot delete issues).
3. Say "merge" when ready (see 2026-10-29 section above).
4. The owner's checkout had an incomplete node_modules (no .bin): `git switch phase/p2-remove-the-setup-wall`, `git pull`, `npm ci` (without --ignore-scripts), then `npm run dev`.

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
