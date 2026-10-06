# Codebase Structure Audit

**Date:** 2026-08-25 · **Implemented:** 2026-08-28
**Scope:** folder layout, file placement, naming, dead code, and packaging hygiene.
**Status:** closed. The findings were worked through and the queue for what remains is [MASTER_TODO.md](MASTER_TODO.md), which is newer than this file.

This document is kept as the record of what the audit found, what came of it, and
what it got wrong. The long findings sections it used to carry have been removed
now that they are implemented; the reasoning is preserved in the commits and in
the documents this one fed into. What is worth reading here is section 2, the
list of findings that did not survive verification, because the same verification
gaps would recur.

---

## 1. Outcome

**P1. Delete `src/server/` and cut the 4 call sites using it.** Done. The
online/offline auth mode went with it, including 44 dead `mode === "online"`
branches in the main process.

**P2. Remove the unreferenced files under `src/`.** Done, 21 files rather than
the 22 listed.

**P3. Move `resources/` binaries to Git LFS or a release asset.** Open. The 13
unused Whisper binaries are gone and `extraResources` is per-platform now, but
about 230 MB still sits in plain git history. See section 4.

**P4. Normalize file naming (`camelCase` vs `PascalCase`).** Declined. Roughly
50 renames with no functional gain, and it would collide with any in-flight
branch.

**P5. Fix the extensionless imports in `electron/methods/`.** Done, including
two multi-line imports the first pass missed.

**P6. Narrow `viteStaticCopy` to what the worker actually needs.** Done, 37
copied items down to 3.

**P7. Split the files over 600 lines.** Open, and deliberately left as ongoing
work. See section 4.

**P8. Consolidate stray root and `src` files and orphan CSS.** Done.

One finding was resolved differently from the recommendation. The audit and
[ONLINE_MODE_REMOVAL §6.1](ONLINE_MODE_REMOVAL.md) both called for deleting the
forgot-password link, route and page. The route and page were kept and the page
rewritten to say plainly that there is no account server and therefore no reset,
which is more use to someone who arrives there than a missing link.

---

## 2. What this audit got wrong

Every finding was checked against the tree before being acted on, and several did
not survive that check.

- **`src/utils/electronUtils.js` was not unreferenced.** Two main-process
  modules, `methods/dashboard.js` and `methods/ollama.js`, imported it. The
  search behind the finding covered `src/` but not `electron/`. Deleting it broke
  the production build while typecheck, lint and the tests all stayed green,
  because `tsconfig.app.json` covers only the renderer and the ESLint config
  matches only `.ts`/`.tsx`. **Nothing in the checked-in tooling covers
  `electron/`**, so only `vite build` catches this class of error. The file was
  misfiled rather than dead and now lives at `electron/methods/authToken.js`.
- **`playbackWaveformVisualizer.tsx` is live.** `voiceRecorder.tsx` imports it
  and `journalForm.tsx` renders that, so the unreferenced list was 21 files.
- **`src/global.d.ts` had already been fixed** and no longer declared the dead
  `electronAPI` surface. It declares `webkitAudioContext`, which live code in
  `useVoiceRecorder` needs, so it had to stay.
- **`src/types/` is not sparse.** It holds seven files and is already the home
  for shared row shapes, so there was nothing to consolidate.
- **The unused Whisper binaries were 14, not 12.** The list missed
  `whisper-server.exe` and `vad-speech-segments.exe`. Thirteen were removed;
  `whisper-server.exe` stays because it is the proposed fix for the open
  transcription startup cost in [benchmarks/OPTIMIZATION_LOG.md](benchmarks/OPTIMIZATION_LOG.md).
- **`@rive-app/canvas` was in `devDependencies`,** not `dependencies`, so it
  never shipped to users.
- **The camelCase IPC channels were 7, not 2.** The five `media:` channels were
  missed alongside `goal:getPinned` and `logs:getAll`.
- **`/memories` and `/qdrant` are not the same case.** `/memories` is linked from
  the dashboard, so it is a real signed-in feature that needed a guard. Only
  `/qdrant` is a developer tool, and it is now dev-build only.
- **The 27 tracked screenshots could not simply be untracked.** `README.md`
  embeds six of them and GitHub renders the README from the repository, so those
  six stay tracked and the ignore rule negates them explicitly.

---

## 3. Found while verifying, and not in this audit

**The packaged app never started the Qdrant worker.** `createQdrantWorker`
resolved `process.resourcesPath/dist-electron/qdrantWorker.js` when packaged, but
`build.files` packs `dist-electron/**/*` into `app.asar` and `build.asar` is left
at its default of true, so that path does not exist in an install. The worker
performs title, tag, mood and summary generation plus embeddings, so background
AI enrichment was silently dead in every packaged build while dev mode kept
working. Fixed by resolving from `__dirname`. Verified against a real
`electron-builder` output.

**`extraResources` shipped every platform's binaries to every platform.** The
filter was `**/*`, so a Windows installer carried the 74 MB macOS Qdrant build.
This was already item 12 in MASTER_TODO and [BUNDLE_SIZE_PLAN §2.1](BUNDLE_SIZE_PLAN.md);
it is now implemented as per-platform `extraResources`.

---

## 4. What is still open

**Binaries in git history (P3).** `resources/` is ~230 MB across 11 tracked
files, with no Git LFS configured. Every clone pays it and every future update to
a binary adds another full copy permanently. Deleting the unused Whisper
executables shrank the installer but not the history. This gets harder the longer
it waits.

**Files over 600 lines (P7).** Nine now, up from seven, because
`electron/qdrantWorker.js` grew and two files crossed the line since the audit:

```
947  electron/qdrantWorker.js
924  src/components/GlobalSearch.tsx
873  src/pages/journalDetails.tsx
807  src/pages/journalForm.tsx
771  src/components/settings/ModelSettings.tsx
685  src/components/LocalAIPanel.tsx
653  src/pages/journalList.tsx
631  electron/methods/ollama.js
603  src/pages/chat.tsx
```

The pattern in the renderer files is the same throughout: data fetching, derived
state and presentation in one component. Pulling the data and state logic into
hooks under `src/hooks/` is the extraction that pays off most, and it makes the
logic testable, which it currently is not. `electron/qdrantWorker.js` is a
different shape: it still constructs a fresh `QdrantClient` from four separate
`await import("@qdrant/js-client-rest")` calls, where one module-level client
would remove the repeated connection setup.

Both are carried in [MASTER_TODO.md](MASTER_TODO.md) as items 52 and 64.
