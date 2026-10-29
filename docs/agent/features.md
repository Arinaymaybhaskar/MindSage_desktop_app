# Features, env flags, native binaries and packaging notes

Read this before you touch import/export, the auto-updater, the support lines, Whisper or FFmpeg paths, environment flags, or anything about how the app is bundled and packaged. Logging has its own file: [logging.md](logging.md).

## Import and export formats

**Import and export formats live in [electron/portability/](../../electron/portability/)**, one pure module per format (`detect`, `read`, `write` over a map of path to bytes, no `electron` or database imports) so each is unit-tested in `portability.test.js`. Add a format there, register it in `index.js` (readers are tried most specific first), and give it a round-trip test.

Imports go through `electron/methods/portability.js`, which writes with `localDB.createJournalEntry` rather than the editor's create handler on purpose: the handler emits `journal:created`, which would queue AI title, tag and summary generation for every imported entry and overwrite the source's own. One call to the indexer's `sweep()` afterwards indexes them for search (see [search-index.md](search-index.md)). The commit writes 250 entries per transaction and yields between them, reporting `import:bulk*` on `ai-status-event` to the Local AI panel, so a 5,000-entry import never blocks setup (KAN-80). Instead of per-entry AI, the newest 200 imported entries are marked `failed` with a waiting message (`methods/importBackfill.js`) and picked up by the one backfill, `backfillEnrichment` in `methods/ollama.js`, which runs on `ai:models-ready` or right after the import when AI is already there. The You're set screen (after sign-up, KAN-436) has an optional "Have entries elsewhere?" import line over the same `data:import-*` channels; `/setup` runs before sign-up and offers no import. Undo (KAN-74): each profile's latest import (ids only, never text) is kept in electron-store `last-import.json`, so the Import tab can still undo it after a restart (`data:import-last`, `data:import-undo`); a newer import replaces it, and an editor save of one of its entries (`journal:edited`, which AI fills do not emit) turns Undo off. Undo soft-deletes then purges, so media, AI data and index rows go the same way as the Trash.

App logos come from Simple Icons via [AppLogo.tsx](../../src/components/settings/AppLogo.tsx); apps it does not carry get a lettered tile, not a logo copied from their site.

## People is opt-in and the AI only suggests

[docs/PEOPLE.md](../PEOPLE.md) is the plan and what is still missing. Pure logic lives in [electron/people/](../../electron/people/) (no `electron` or database imports, tested in `people.test.js`); SQL in `electron/db/people.js`; the queue and `people:*` IPC in `electron/methods/people.js`. Its tables come from migration 9 and cascade from the user, the entry or the person, so deleting a profile or purging an entry removes them in the same statement.

- Keep every model claim grounded in code (the name is in the entry, the sentence numbers exist, a relationship word is present) and never auto-merge anything but an exact alias.
- When you change the prompt, schema or checks, bump `EXTRACTOR_VERSION` in `extract.js`.
- Mentions store offsets into `journal_entries.content`, never a copy of the text, and nothing from People goes into the search index.
- Summary copy describes what was written and never judges the person or relationship.

## Updates are quiet and opt-in

`electron/services/autoUpdater.js` checks only when the user turned on automatic checks or pressed "Check now"; `updateRelay.js` remembers where the download stands (`update:get-state`) and `UpdateBar` shows it. "Restart to update" goes through `prepareToRestart()` in [src/utils/unsavedWork.ts](../../src/utils/unsavedWork.ts): a screen holding text a restart would lose registers a guard there (the entry form does), and the restart is refused while one is dirty. Notices that sit above the page (`UpdateBar`, `AIReadinessBanner`) go in the wrapper in `App.tsx`, because the title bar is `fixed` over the top 40px.

## Support lines are bundled data, and safety-critical (KAN-50/54/55)

[src/data/supportLines.ts](../../src/data/supportLines.ts) lists the lines per region (India, US, UK, Canada, Australia, Germany) with the date they were last checked; change a number only after checking the operator's own page and bump `VERIFIED_ON`. The first check (2026-10-19) was by web search of public pages, not against each operator's site, so a person re-checking them is still owed.

- `SupportSheet` works offline: a desktop cannot dial, so it shows the number, a copy button (with a select-the-number fallback when the clipboard is blocked) and a QR code (`tel:`/`sms:`) drawn locally with `qrcode-generator`, always on a white quiet zone, opened inside the card of the line it belongs to; under-18 lines are one compact row each, and "Other countries" lists the regions.
- iCall's hours differ between sources, so its note says to check their site. Voice-only lines never get a Text row.
- The region comes from the person's choice (`localStorage.support_region`) or the system language.
- The pinned link on Today (`PinnedSupportLink`) sits above the dock.
- Ask shows `ASK_DISCLAIMER` under the composer and in onboarding, and both Ask prompts carry `NO_ADVICE_RULE`.

## Native binaries live in `resources/`

Whisper.cpp + DLLs and FFmpeg ship via `electron-builder` `extraResources`. Path resolution differs between dev (`../resources/...`) and packaged (`process.resourcesPath`) — copy the pattern in [electron/methods/whisper.js](../../electron/methods/whisper.js).

The binaries are not in git (KAN-193). [resources/binaries.json](../../resources/binaries.json) lists each file with its sha256 and the GitHub Release (`binaries-whisper-v1`) that holds it as a flat asset (named by basename); `scripts/fetch-binaries.mjs` downloads and verifies them, runs as `prebuild`/`prerelease` and as `npm run fetch:binaries`, and skips files already present with the right hash (CI caches `resources/whisper-bin-x64`). A missing file (offline) or a checksum mismatch exits non-zero naming the file. To change a binary: upload the new asset to a new release tag, update the hashes and `release` in the manifest. `MS_BINARIES_BASE_URL` overrides the release URL. The manifest holds the binaries only: voice models are downloaded on first dictation (KAN-91), so the release's `ggml-tiny.en.bin` asset is unused. After pulling this change, run `npm run fetch:binaries` before `npm run dev` on a clone that lacks `resources/whisper-bin-x64`.

## Environment flags

- `MS_DISABLE_GPU=1` (Windows) disables GPU for machines with broken drivers (the `win32` check near the top of `electron/main.js`).
- `MS_REMOTE_DEBUG=<port>` opens a loopback CDP endpoint (`remote-debugging-port` switch in `electron/main.js`) — anything that reaches it has full control of the renderer, so leave it off by default.
- `MS_USER_DATA_DIR=<dir>` points Electron's `userData` (the database, logs, media, electron-store files) at another directory, and a profile chosen this way always gets its own database; the benchmark harness also sets `APPDATA`, which the db-only bench scripts still resolve the database from, since they run without an Electron `app`. It is applied by [electron/userDataOverride.js](../../electron/userDataOverride.js), which must stay the first import in `main.js`.
- `MS_SKIP_DB_BACKUP=1` skips the pre-migration snapshot ([architecture.md](architecture.md)); `MS_DEBUG=1` keeps `debug` log lines ([logging.md](logging.md)); `MS_DB_DIR` / `MS_USER_DATA_DIR` are for db tests and `MS_SKIP_BENCH=1` skips the quick benchmark for one commit ([tooling-and-tests.md](tooling-and-tests.md)).

## Build and packaging notes

**Everything under `electron/` is bundled into `main.js`.** There are no worker threads and no `viteStaticCopy` targets any more (they existed only for `qdrantWorker.js`, which was spawned from a file path); a new main-process file needs no build config. A native dependency that must be loaded from disk (sqlite-vec's `vec0` library) is kept external by `vite.config.ts` (every `dependencies` entry is) and unpacked from the asar by `asarUnpack` in `package.json`; `electron/db/vectorExtension.js` rewrites `app.asar` to `app.asar.unpacked` when it resolves the path. node-llama-cpp's prebuilt llama.cpp binaries (`@node-llama-cpp/*`, CPU and Vulkan builds) are unpacked the same way; it picks the best one that loads at run time. The Windows CUDA build is left out of the installer (`build.files`) and offered once as the `cuda-engine` download (KAN-434): `electron/ai/cuda.js` unpacks the SHA-256-checked npm tarball into `<userData>/models` and a `module.registerHooks` resolve hook points node-llama-cpp's import of `@node-llama-cpp/win-x64-cuda` at it. It is offered only when node-llama-cpp finds the Nvidia driver and the CUDA runtime, since the build cannot load without them; a CUDA failure falls back to Vulkan. The Windows uninstaller prompt is in [security-and-session.md](security-and-session.md).

Local AI setup states (KAN-78, KAN-87): `electron/ai/setupState.js` is the state machine (downloading, paused, failed, offline, low-disk, low-memory, metered, work-network, starting, ready) over the shared downloader; IPC `ai:setup-*` and event `ai:setup-state`, wrapper `src/api/aiSetupService.ts`. It runs in the background and never gates writing. When it finishes it emits `ai:models-ready`, and `methods/ollama.js` re-runs enrichment for entries whose AI status is `failed`. Metered is asked once (no native API); a captive-portal HTML reply counts as offline, a 407 as work-network.
