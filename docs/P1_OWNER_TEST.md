# P1 owner test list (Windows)
Phase P1 "Make the promise true". Tickets that need a person or hardware. Steps come from the QA comments in Jira (project KAN).

## Setup
1. `npm ci`, then `npm run dev` (or the installer build: `npm run build`, install the NSIS `.exe` from `release/`).
2. Install Ollama (keep port 11434 free for it). Run `ollama pull nomic-embed-text:v1.5` and pull a chat model (the one set in Settings).

## KAN-54 Support sheet by region
1. Open the support sheet from the pinned link on Today.
2. Check the region header matches the Windows language; use Change to pick each of the 6 regions.
3. For each line, open the operator's own site and compare number and hours; fix `src/data/supportLines.ts` and bump `VERIFIED_ON` for each change. Check iCall hours (sources differ) and Kids Help Phone / Lifeline text details.
Pass: every number matches its operator's page, dated. Voice-only lines show no Text action.
Automated: six regions, under-18 lines, offline use and focus checked in the real app on Linux; numbers checked only by web search on 2026-10-19.

## KAN-55 QR code instead of Call
1. Open the support sheet, press "Show on my phone" on a line.
2. Scan the QR with a real phone camera.
3. Repeat in dark mode.
4. Press Copy number; the toast shows "Copied <number>". Optional: block the clipboard and check the number gets selected.
Pass: the phone offers to call (or text) the correct number in both themes.
Automated: QR decodes to tel:988 in light and dark (jsQR), white quiet zone, aria-label, blocked-clipboard fallback (KAN-366 fixed, retested).

## KAN-56 Delete profile flow
1. Create two profiles (A, B), each with entries, a photo and a recording.
2. Settings > Profile > Delete profile on A: the dialog lists what goes and offers a backup; a wrong password deletes nothing and counts attempts; the right password plus the hold deletes.
3. In `%APPDATA%\MindSage`: A's `media\journals` folders are gone, `backups` holds one fresh snapshot, B's entries are intact.
4. Delete B (last profile): the app returns to first run and `backups` is gone.
Pass: all four. Also scan the profile folder for A's username, email and entry text: no hits.
Automated: the Linux run passes all UI steps, lockout, per-profile drafts, raw-byte scans (KAN-371, 376, 380 fixed and retested); Windows file locks not run.

## KAN-344 Profile deletion leaves traces
1. Create two profiles; give profile A a chat with an attachment.
2. Hold one of A's media files open in another program (a photo viewer), then delete A.
3. The dialog says files are in use; `%APPDATA%\MindSage\pending-file-deletions.json` lists the path.
4. Close the other program, restart MindSage; within about 15 s the file is gone and the list file is removed.
5. `media\chats\...` has no empty folders; `backups` holds one fresh snapshot.
Pass: all five. Open item: chat attachments with no row in `files` are not found.
Automated: backup replacement, chat media removal and empty-folder pruning pass on Linux and in tests; the locked-file (EBUSY) case is simulated only.

## KAN-63 Uninstall cleanup
1. Install the build, create a profile and an entry.
2. Uninstall and answer No (the default): `%APPDATA%\MindSage` stays; reinstall opens the journal.
3. Uninstall and answer Yes: the folder is gone.
4. Silent uninstall (`/S`): data stays.
5. Update over an existing install: no prompt.
Pass: all five. The prompt must name the current user's folder.
Automated: `installer.test.js` 9/9; makensis compiles the include; the uninstaller itself has never run.

## KAN-60 Update prompt in the app
Needs a packaged build and a published non-pre-release GitHub release newer than the build.

1. With automatic checks off, nothing runs until "Check now".
2. A newer release is found; the bar shows "Downloading ... (n%)", then "Restart to update".
3. With unsaved text in the editor, Restart is refused.
4. Restart installs the update and the app opens on the new version.
5. Disconnect mid-download: the bar says retry later, no crash.
Pass: all five.
Automated: the setting is off by default; Check now says updates only work in the installed app (dev build); `update:get-state` and `update:install` answer correctly; UpdateBar and guard unit tests pass.

## KAN-57 Deeper tests and one end-to-end run
1. Start Ollama with the chat and embedding models.
2. Run `npm run test:e2e` (no `E2E_SKIP_AI`).
3. Confirm the steps for AI metadata, indexing and search all pass.
Pass: the full run is green with real AI.
Automated: `npm test`, `npm run test:db` and the e2e with `E2E_SKIP_AI=1` pass; AI and search are not covered without Ollama.

## KAN-192 Replace Qdrant with sqlite-vec
1. Fresh install with Ollama running: write 3 entries; each reaches the green indexed icon and search finds them.
2. Upgrade an install with Qdrant data: `qdrant-data` is deleted and entries re-index.
3. Stop Ollama, write an entry: it stays pending; start Ollama: it indexes within about 5 minutes. Trash an entry: not in search. Restore: back. Purge: nothing found.
4. On the packaged Windows build: the app starts, search works, no Qdrant process.
Pass: all five, no `qdrant` process, no listener on 6333/6334.
Automated: Linux real-app run passes steps 1-4 (fake Ollama, 5,090-entry upgrade); Windows packaging and recall vs Qdrant not run.

## KAN-337 macOS reopen (Mac only)
1. Launch, close the main window with the red button.
2. Click the dock icon: the window reappears, ready (no blank or splash).
3. Repeat three times, then check the log: no "Attempted to register a second handler", no unhandled rejection.
Pass: all four. Skip if no Mac is at hand.
Automated: simulated three times on Linux (window returns, one listener); unit tests pass.

## KAN-340 Mood emoji in the packaged app (provisional)
1. Install the packaged build.
2. Open New entry (and an existing entry) and look under "How are you feeling?".
Pass: five faces render on both screens (no alt text).
Automated: 5 of 5 load from `file://dist/index.html`; a test blocks absolute `public/` paths; no real packaged build or edit screen checked.

## Whole-phase checks
1. `npm run bench:phase -- 1` (needs Ollama; builds first). Commit the results with a run-index row.
2. Target: search p95 under 100 ms at 50,000 vectors. After KAN-381 (database file mapped) a 4-core Linux sandbox measures 96-117 ms p95, 78-81 ms p50 (was 118-133 / 104-108); this machine measured 192 / 182 ms before it. Re-measure here with `npm run bench -- --stages vector --label kan-381`. A revised target is proposed in `docs/benchmarks/FINDINGS.md` §9.
