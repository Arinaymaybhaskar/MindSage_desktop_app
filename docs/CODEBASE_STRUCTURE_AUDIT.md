# Codebase Structure Audit

**Date:** 2026-08-25
**Scope:** folder layout, file placement, naming, dead code, and packaging hygiene.
**Status:** phases 1, 2 and 4 implemented on 2026-08-28. See the status table below.

The architecture is sound. The three-layer split (renderer → IPC → main → db) is real
and consistently followed; `electron/db`, `electron/methods`, and `electron/services`
have clear, non-overlapping responsibilities, and no renderer file reaches into Node
directly. What follows is not a redesign — it is the cleanup needed to make the tree
match the architecture that is already there.

Roughly **22 source files under `src/` are unreferenced**, **~240 MB of native binaries
are tracked in plain git**, and **one dead subsystem (`src/server/`) still has four live
call sites**. Those three are the items worth doing first.

---

## 0. Priority summary

| #   | Item                                                         | Effort | Status |
| --- | ------------------------------------------------------------ | ------ | ------ |
| P1  | Delete `src/server/` and cut the 4 call sites still using it  | M      | Done |
| P2  | Remove the unreferenced files under `src/`                    | S      | Done, 21 of them rather than 22 |
| P3  | Move `resources/` binaries to Git LFS or a release asset      | M      | Not started. The 13 unused whisper binaries are gone, but the large blobs remain in history |
| P4  | Normalize file naming (`camelCase` vs `PascalCase`)           | M      | Declined. Judged churn without functional gain |
| P5  | Fix the extensionless imports in `electron/methods/`          | S      | Done |
| P6  | Narrow `viteStaticCopy` to what the worker actually needs     | S      | Done, 37 copied items down to 3 |
| P7  | Split the 7 files over 600 lines                              | L      | Not started, and deliberately left as ongoing work |
| P8  | Consolidate stray root/`src` files and orphan CSS             | S      | Done |

## 0.1 What this audit got wrong

Recorded because the same verification gaps would recur. Every item below was
checked against the tree before acting on it, and several findings did not
survive that check.

- **`playbackWaveformVisualizer.tsx` is live, not dead.** `voiceRecorder.tsx`
  imports it and `journalForm.tsx` renders that. The unreferenced list is 21
  files, not 22.
- **`src/utils/electronUtils.js` was referenced.** Two main-process modules,
  `methods/dashboard.js` and `methods/ollama.js`, imported it. The search
  behind the finding covered `src/` but not `electron/`. Deleting it broke the
  production build while typecheck, lint and the tests all stayed green,
  because `tsconfig.app.json` covers only the renderer and ESLint matches only
  `.ts`/`.tsx`. It was misfiled rather than dead, and now lives at
  `electron/methods/authToken.js`.
- **`src/global.d.ts` had already been fixed.** It no longer declares the dead
  `electronAPI` surface or the four undefined types. It declares
  `webkitAudioContext`, which live code in `useVoiceRecorder` depends on, so
  it had to stay. `src/electron.d.ts` is likewise complete now.
- **`src/types/` is not sparse.** It holds seven files and is already the home
  for shared row shapes, so there was nothing to consolidate.
- **The unused whisper binaries were 14, not 12.** The list missed
  `whisper-server.exe` and `vad-speech-segments.exe`. Thirteen were removed;
  `whisper-server.exe` was kept because it is the proposed fix for the open
  transcription startup cost in `docs/benchmarks/OPTIMIZATION_LOG.md`.
- **`@rive-app/canvas` was in `devDependencies`,** not `dependencies`, so it
  never shipped to users.
- **The camelCase IPC channels were 7, not 2.** The five `media:` channels were
  missed alongside `goal:getPinned` and `logs:getAll`.
- **`/memories` and `/qdrant` are not the same case.** `/memories` is linked
  from the dashboard, so it is a real signed-in feature that needed a guard.
  Only `/qdrant` is a developer tool, and it is now dev-build only.
- **The 27 tracked screenshots could not simply be untracked.** `README.md`
  embeds six of them and GitHub renders the README from the repository, so
  those six stay tracked and the ignore rule now negates them explicitly.

## 0.2 Found while verifying, and not in this audit

**The packaged app never started the Qdrant worker.** `createQdrantWorker`
resolved `process.resourcesPath/dist-electron/qdrantWorker.js` when packaged,
but `build.files` packs `dist-electron/**/*` into `app.asar` and `build.asar`
is left at its default of true, so that path does not exist in an install.
The worker performs title, tag, mood and summary generation plus embeddings,
so background AI enrichment was silently dead in every packaged build while
dev mode kept working. Fixed by resolving from `__dirname`, which points
inside the archive when packaged, after confirming against a real
`electron-builder` output that a Worker can load an ES module from inside the
asar.

**`extraResources` shipped every platform's binaries to every platform.** The
filter was `**/*`, so a Windows installer carried the 74 MB macOS Qdrant
build. This is the fix already prescribed in `docs/MAC_RELEASE_PLAN.md`
section 3.2, now implemented as per-platform `extraResources`.

--- | -------------------------------------------------------- | ------ | ----------------------------------------------------- |
| P1  | Delete `src/server/` and cut the 4 call sites still using it | M      | Auth flows silently hit a server that never runs      |
| P2  | Remove the 22 unreferenced files under `src/`            | S      | Every reader has to re-derive what is live            |
| P3  | Move `resources/` binaries to Git LFS or a release asset | M      | ~240 MB repo; every clone pays it                     |
| P4  | Normalize file naming (`camelCase` vs `PascalCase`)      | M      | Constant guess-the-filename friction                  |
| P5  | Fix the extensionless imports in `electron/methods/`     | S      | Copied-to-package modules fail if ever loaded raw     |
| P6  | Narrow `viteStaticCopy` to what the worker actually needs | S      | Whole backend duplicated into the package             |
| P7  | Split the 7 files over 600 lines                         | L      | Merge pain, untestable logic                          |
| P8  | Consolidate stray root/`src` files and orphan CSS        | S      | Noise                                                 |

---

## 1. Dead code and unreferenced files

### 1.1 `src/server/` — an entire unreachable subsystem

`src/server/` is 24 files of Express 5 + PostgreSQL + S3 + JWT. Its only entry point is
commented out at [electron/main.js:8](../electron/main.js#L8). `docs/ONLINE_MODE_REMOVAL.md`
already judged it safe to delete.

**But it is not fully dead**, and this is the most important finding in this audit.
Three renderer pages still make live HTTP calls to `http://localhost:4000/api`, which
nothing ever starts:

- [src/pages/auth/login.tsx:48](../src/pages/auth/login.tsx#L48) — `POST /auth/google-login`
- [src/pages/auth/register.tsx:168](../src/pages/auth/register.tsx#L168) — `POST /auth/check-username`
- [src/pages/auth/register.tsx:214](../src/pages/auth/register.tsx#L214) — `POST /auth/google-login`
- [src/pages/auth/forgotPassword.tsx:31](../src/pages/auth/forgotPassword.tsx#L31) — `POST /auth/forgot-password`, then `POST /auth/verify-otp`

These are not "structure" problems, they are broken features in an offline-first app.
[src/api/axios.ts](../src/api/axios.ts) exists purely to serve them, and its error handler is
written as if a remote API were expected ("Can't reach the API server; check your internet or
DNS"), which is the message a user will see when they try to reset a password.

**Recommendation:** treat this as one unit of work. Decide what Google login, username
availability, and password reset should do offline (`docs/OFFLINE_AUTH_DESIGN.md` is the
right input), route them through IPC like every other call, then delete `src/server/`
and `src/api/axios.ts` together. Deleting the server without fixing the four call sites
would leave dangling imports; fixing the call sites without deleting the server leaves
the dead tree behind. Doing both also drops `express`, `pg`, `cors`, `cookie-parser`,
`nodemailer`, and the two `@aws-sdk` packages from `dependencies`.

Also note `src/server/utils/db.pdf` — a 700 KB PDF checked in under a `utils/` folder.
It is documentation, not code, and does not belong in a source tree at all.

### 1.2 Unreferenced files under `src/`

Verified by import-path search; each of these has zero importers.

**Components (14)**

```
src/components/ColorSystemDemo.tsx
src/components/MoodSentimentChart.tsx        (297 lines)
src/components/RecentEntryCard.tsx
src/components/StatCard.tsx
src/components/dictaphone.tsx
src/components/navbar.tsx
src/components/playbackWaveformVisualizer.tsx
src/components/ui/AudioPlayer.tsx
src/components/ui/Background.tsx
src/components/ui/Button.tsx
src/components/ui/Input.tsx
src/components/ui/InputField.tsx
src/components/ui/TextArea.tsx
src/components/ui/Toggle.tsx
```

**Settings panels (4)** — [src/pages/settings.tsx](../src/pages/settings.tsx) lazy-loads exactly six
panels (Profile, Color, Model, Security, Export, Appearance). These four are not among them:

```
src/components/settings/AISettings.tsx
src/components/settings/AudioSettings.tsx
src/components/settings/GoalsSettings.tsx
src/components/settings/NotificationsSettings.tsx
```

**Other (4)**

```
src/api/eventBusService.tsx
src/hooks/useAIStatus.ts
src/hooks/useSpeechRecognition.ts
src/utils/electronUtils.js
```

Two of these deserve individual mention:

- [src/components/ui/Toggle.tsx](../src/components/ui/Toggle.tsx) imports from `"@/components/ui/switch"`.
  **There is no `@` path alias** configured in either [vite.config.ts](../vite.config.ts) or
  [tsconfig.app.json](../tsconfig.app.json), and no lowercase `switch.tsx` exists. This file
  cannot compile and is contributing to the 131-error typecheck baseline. It is a leftover from a
  shadcn-style scaffold that was never wired up.
- `Input.tsx` vs `InputField.tsx` and `Toggle.tsx` vs `Switch.tsx` are duplicate-purpose pairs where
  the newer one won and the older one was never removed. `Switch.tsx` has 6 real importers;
  `Toggle.tsx` has 0.

**Recommendation:** delete all 22. If any is a work-in-progress you intend to finish, move it to a
clearly-marked location rather than leaving it indistinguishable from live code — right now a reader
cannot tell `StatCard.tsx` (dead) from `dashboard/BentoCard.tsx` (live) without grepping.

### 1.3 Orphaned CSS

```
src/index.css     408 lines   imported by main.tsx      ← the only live one
src/App.css        42 lines   imported by nothing
src/styles.css     12 lines   imported by nothing
```

`App.css` and `styles.css` are Vite-template leftovers. Delete both. Having three CSS files where two
are dead is actively misleading when someone goes looking for where a style is defined.

### 1.4 Unused assets

- `public/rive/` — `rive.js` (410 KB) + `rive.wasm` (1.8 MB) + `logo-loader.riv`. **Nothing in `src/`
  or `index.html` references any of them.** The `@rive-app/canvas` dependency in `package.json` is
  likewise unimported. This is ~2.2 MB shipped in every build for a feature that was evaluated and
  not adopted (see commit `ff7adbf`, the MoodOrb evaluation).
- `assets/rive/` — a second copy of `logo-loader.riv` plus `logo.scene.json`. Same asset, different
  folder, also unused.
- `public/ai.png`, `public/ai-white.png`, `public/gemini-color.png`, `public/gemini-color.svg`,
  `public/ollama.svg`, `public/textbg.png` — zero references.
- `assets/diagrams/diagram-export-15-07-2026-10_23_13.svg` — **8.6 MB**, machine-named, not referenced
  from [README.md](../README.md). The other diagrams in that folder are PNGs at a few hundred KB.
- `electron/services/qdrantCollection.example.txt` — a scratch example file sitting in a services
  directory, and it is copied into the packaged app by the `services/*` glob in `viteStaticCopy`.

**Recommendation:** delete the above; decide once whether Rive stays. If yes, `assets/rive/` is the
source and `public/rive/` the build output — document that. If no, remove the dependency too.

### 1.5 Stray root files

- `test-color-db.js` — a 3 KB ad-hoc migration script at the repo root, tracked in git, not a test
  despite the name, not referenced by any npm script. It writes a `test-color.db` next to itself.
  Either move it to `scripts/` with a name that says what it is, or delete it.
- `logs/` — contains two real log files (115 KB) from 2026-08-11. Correctly gitignored, but it is a
  runtime output directory living in the source tree. Worth confirming the app writes here
  deliberately rather than by accident.

---

## 2. Naming consistency

This is the single most pervasive issue. There is no convention — it is roughly 50/50 within the
same folders.

### 2.1 Components: 14 PascalCase vs 21 camelCase, same directory

```
PascalCase                     camelCase
AIReadinessBanner.tsx          dock.tsx
GlobalSearch.tsx               masonry.tsx
KeyboardShortcutsModal.tsx     navbar.tsx
LazyThumb.tsx                  moodSlider.tsx
Modal.tsx                      profileDropdown.tsx
OllamaStatus.tsx               quickCapture.tsx
QuickCaptureTitleBar.tsx       voiceRecorder.tsx
ToastNotification.tsx          weeklyMoodStrip.tsx
...                            ...
```

Subfolders are inconsistent the same way: `src/components/goals/modals/` holds six PascalCase modals
and one `logProgressModal.tsx`.

### 2.2 Pages: 4 PascalCase vs 11 camelCase

```
Memories.tsx  NotFoundPage.tsx  OllamaTutorial.tsx  Onboarding.tsx
chat.tsx  dashBoard.tsx  dataExport.tsx  goalDetail.tsx  goals.tsx
journalDetails.tsx  journalForm.tsx  journalList.tsx  qdrantViewer.tsx  settings.tsx
```

`dashBoard.tsx` is neither convention — camelCase with an interior capital that reads as a typo.
`src/components/moodCalender.tsx` is a genuine spelling error ("Calender" → "Calendar") baked into a
filename and its imports.

### 2.3 `.tsx` files containing no JSX

Thirteen files use the `.tsx` extension but contain no JSX at all — the entire `src/api/` service
layer plus one util:

```
src/api/authService.tsx        src/api/mediaService.tsx
src/api/categoryService.tsx    src/api/ollamaService.tsx
src/api/chatService.tsx        src/api/progressLogsService.tsx
src/api/dashBoardService.tsx   src/api/qDrantService.tsx
src/api/eventBusService.tsx    src/api/userService.tsx
src/api/goalService.tsx        src/utils/chatutils.tsx
src/api/journalService.tsx
```

`src/api/whisperService.ts` and `src/api/axios.ts` are already correctly `.ts` — so the folder is
internally inconsistent too. `src/hooks/useVoiceRecorder.tsx` has the same problem while its six
sibling hooks are `.ts`, and `src/utils/electronUtils.js` is plain JavaScript in a TypeScript
renderer. `src/api/qDrantService.tsx` also capitalizes the D mid-word, unlike `qdrantViewer.tsx`.

**Recommendation:** pick one rule and apply it mechanically:

- Files that export a React component → `PascalCase.tsx`.
- Everything else (services, hooks, utils, types, constants) → `camelCase.ts`.

This is ~50 renames. Do it in one dedicated commit with no logic changes so the diff stays reviewable,
and use `git mv` so history follows. On Windows, watch for case-only renames — `git mv` through an
intermediate name is the reliable path. A prior commit (`680bf42`) already had to fix an import-casing
bug, which is exactly the class of failure this convention prevents.

### 2.4 Import extension convention is documented but not followed

[CLAUDE.md](../CLAUDE.md) states: _"Imports use explicit `.ts`/`.tsx` extensions ... Match this."_

Actual counts across `src/`: **5 imports with an explicit extension, 226 without.** The convention is
the opposite of what is documented. `allowImportingTsExtensions` is enabled so both work, but the doc
is telling every new contributor to write the minority style. Either update CLAUDE.md to describe
reality (recommended — 226 vs 5 is not a close call) or normalize the 226.

---

## 3. `electron/` layer issues

The layering itself is clean: `ipcHandlers.js` imports only from `methods/`, and `methods/` imports
only from `db/` plus its own peers. No handler reaches past a method into the database. Keep that.

Three concrete problems:

### 3.1 Extensionless local imports will break if ever loaded raw

Sixteen imports inside `electron/methods/` omit the `.js` extension:

```
electron/methods/auth.js:1          import localDB from "../db";
electron/methods/chat.js:3,4,5,7    import ... from "../eventBus" / "./AIPrompts" / "./ollama" / "./qdrant"
electron/methods/journal.js:1       import localDB from "../db";
electron/methods/progressLogs.js:4  import { db } from "../db/connection";
...and 10 more across categories.js, exportData.js, goal.js, user.js, whisper.js
```

Node ESM requires the extension. These work today only because Vite bundles them into `main.js` and
resolves the extension at build time. But these same files are _also_ copied verbatim into
`dist-electron/methods/` by `viteStaticCopy` — and those copies would throw `ERR_MODULE_NOT_FOUND`
the moment anything loaded them directly. This is a latent trap: the day someone points the worker or
a dynamic `await import()` at `dist-electron/methods/chat.js`, it fails only in the packaged build.

Note `electron/db/` gets this right — every internal import there is `'./connection.js'`. The fix is
mechanical: add `.js` to those 16 imports.

### 3.2 `viteStaticCopy` copies far more than the worker needs

[vite.config.ts:26-40](../vite.config.ts#L26-L40) copies `db/*`, `methods/*`, `services/*`, plus
`qdrantWorker.js`, `store.js`, and `eventBus.js`. But [electron/qdrantWorker.js](../electron/qdrantWorker.js)
— the only consumer of raw-copied files — imports exactly two local modules:

```js
import { db } from "./db/connection.js";
import { eventBus } from "./eventBus.js";
```

Everything else in `dist-electron/methods/` and `dist-electron/services/` is a dead second copy of
code already bundled into `main.js`. That is ~25 duplicated files in the shipped package, including
the `qdrantCollection.example.txt` scratch file.

It also means [CLAUDE.md](../CLAUDE.md)'s warning — _"New files under `electron/db|methods|services/`
must be listed in the `viteStaticCopy` targets"_ — is over-broad. Only files reachable from
`qdrantWorker.js` actually need copying.

**Recommendation:** narrow the targets to `qdrantWorker.js`, `eventBus.js`, `db/connection.js`, and
whatever `connection.js` transitively needs. Verify a packaged build still enriches journals before
committing — this is exactly the class of change that works in dev and breaks in the installer, so
test it there. Then correct the CLAUDE.md note.

### 3.3 Everything else in `electron/` is fine

`appSettings.js`, `windowManager.js`, `events.js`, `eventBus.js`, and `store.js` sit at the
`electron/` root alongside `main.js`, `preload.js`, `ipcHandlers.js`, and `qdrantWorker.js` — nine
root-level files. That is a defensible flat layout for a main process this size; it does not need
subfoldering. `ipcHandlers.js` at 211 lines for 65 channels is a thin, readable router. IPC channel
naming (`domain:action`) is consistent across all 65 channels, with only two stragglers using
camelCase actions where the rest use kebab-case: `goal:getPinned` and `logs:getAll` (compare
`goal:get-active-goals`, `chat:get-chats`). Minor, but worth fixing while you are in there.

---

## 4. Oversized files

Seven files exceed 600 lines. In a codebase where the median component is under 150, these are where
future merge conflicts and untestable logic accumulate:

```
877   src/pages/journalDetails.tsx
870   src/components/GlobalSearch.tsx
806   src/pages/journalForm.tsx
769   src/components/settings/ModelSettings.tsx
706   electron/qdrantWorker.js
662   src/pages/journalList.tsx
611   src/pages/chat.tsx
```

The pattern in each is the same: data fetching, derived state, and presentation all in one component.
The extraction that pays off most is pulling the data/state logic into hooks (`useJournalDetail`,
`useGlobalSearch`, `useModelDownloads`) — `src/hooks/` already exists and is the natural home. That
also makes the logic testable, which currently it is not.

`electron/qdrantWorker.js` is a different shape: four separate `await import("@qdrant/js-client-rest")`
calls constructing a fresh `QdrantClient`, at lines 52, 95, 136, and 199. One module-level client
would remove the repeated connection setup.

This is the largest item in this audit and the least urgent. Do it incrementally, one file per PR,
after the deletions in §1 — some of the weight may disappear on its own.

---

## 5. Smaller placement issues

**Files at `src/` root that belong in folders**

- [src/TitleBar.tsx](../src/TitleBar.tsx) — a component sitting beside `App.tsx` rather than in
  `src/components/`. Its sibling `src/components/QuickCaptureTitleBar.tsx` is placed correctly, which
  makes the inconsistency stand out.
- `src/App.css`, `src/styles.css` — dead, see §1.3.

**Two ambient type files, overlapping and one of them dead**

- [src/electron.d.ts](../src/electron.d.ts) declares `Window.electron` — live, and as CLAUDE.md notes,
  deliberately incomplete (missing `minimize`/`maximize`/`close`, the source of the `TitleBar.tsx`
  typecheck errors).
- [src/global.d.ts](../src/global.d.ts) declares `Window.electronAPI` with an
  `auth.login(mode: "online" | "offline", ...)` signature. **Nothing uses `window.electronAPI`**, and
  the `"online"` mode it describes no longer exists. It also references `LoginCredentials`,
  `AuthResponse`, `UserInfo`, and `RegistrationDetails` — types that are never defined anywhere, so
  the file is broken as well as unused.

  Delete `global.d.ts`. Then complete `electron.d.ts` with the window controls, which closes a chunk
  of the typecheck baseline.

**Types are scattered**

`src/types/` holds only `Chat.ts` and `Goals.ts`, while 23 exported interfaces and types live inline
across 17 other files — including domain types in `src/utils/moods.ts`, `src/utils/moodHierarchy.ts`,
and `src/api/journalService.tsx`. Component-local prop interfaces should stay put; shared domain types
(journal, mood, user, settings) should move to `src/types/`. Right now `src/types/` is too sparse to be
worth looking in, which is why people keep not using it.

**Prompt templates live in two places**

`src/utils/prompts/Journal.ts` and `src/utils/prompts/goal.ts` (renderer, 2 files) alongside
`electron/methods/AIPrompts.js` (main, 333 lines). Both build LLM prompts. This split is defensible if
the renderer prompts only feed UI preview and the main-process ones drive the real calls — but nothing
says so, and the naming gives no hint. Worth a comment in each explaining the boundary, or a
consolidation if the split is accidental. Note the folder mixes cases too: `Journal.ts` and `goal.ts`.

**Single-file folders**

`src/constants/`, `src/layouts/`, `src/routes/`, and `src/components/journal/` each hold one file. Not
a problem — they are correct homes that will fill in. Leave them.

**Test placement is inconsistent with the stated convention**

CLAUDE.md says tests sit next to the module they cover, and three of four do
(`src/api/journalService.test.ts`, `src/utils/DateFormatter.test.ts`,
`src/utils/contrastingColor.test.ts`, `electron/methods/jsonStream.test.js`). The exception is
`src/test/aiMetadata.test.ts`, which sits in the folder meant for `setup.ts` infrastructure. Move it
next to the module it tests.

**Dev-only routes are shipped and unguarded**

[src/App.tsx:218-219](../src/App.tsx#L218-L219) registers `/memories` and `/qdrant` outside
`<PrivateRoute>`, unlike every other route. `qdrantViewer.tsx` (416 lines) is a vector-database
inspector — a developer tool. Either guard both routes, or gate them behind a dev-mode check so they
do not ship to users.

---

## 6. Repository hygiene

### 6.1 ~240 MB of binaries tracked in plain git

```
80.5 MB  resources/win/qdrant.exe
77.7 MB  resources/whisper-bin-x64/models/ggml-tiny.en.bin
77.1 MB  resources/mac/qdrant
 2.5 MB  resources/whisper-bin-x64/Release/SDL2.dll
 + 20 more .exe/.dll files
```

No Git LFS is configured. Every clone downloads all of it, and every future update to a binary adds
another full copy to history permanently. This is the highest-leverage repo-hygiene fix available, and
it gets harder the longer it waits.

Compounding it: [electron/methods/whisper.js](../electron/methods/whisper.js) spawns exactly two
binaries — `whisper-stream.exe` (line 36) and `whisper-cli.exe` (line 89). The other **twelve** —
`bench.exe`, `command.exe`, `lsp.exe`, `main.exe`, `quantize.exe`, `stream.exe`, `test-vad.exe`,
`test-vad-full.exe`, `vad-speech-segments.exe`, `wchess.exe`, `whisper-bench.exe`,
`whisper-command.exe`, `whisper-talk-llama.exe` — are unused. They are tracked in git _and_ shipped to
users via the `extraResources` `**/*` filter in [package.json](../package.json). `whisper-talk-llama.exe`
alone is 1.6 MB.

Also `resources/win/.qdrant-initialized` is a runtime state marker that got committed. It should be
gitignored, not tracked — a fresh clone starts with Qdrant already flagged as initialized.

**Recommendation, in order:**

1. Delete the 12 unused whisper binaries and untrack `.qdrant-initialized` (immediate, low risk,
   removes them from the installer as well as the repo).
2. Move the remaining binaries to Git LFS, or fetch them in a postinstall/CI step and gitignore
   `resources/`. `docs/BUNDLE_SIZE_PLAN.md` is the right place to record the decision.
3. Narrow the `extraResources` filter from `**/*` to the specific files needed.

### 6.2 Marketing screenshots are gitignored but still tracked

`.gitignore` contains `public/screenshots/` with a comment explaining they should be regenerated via
`npm run capture` rather than carried in history. But **27 PNGs there are still tracked** (~4 MB) —
gitignore does not affect already-tracked files. The intent is recorded; the `git rm --cached` was
never run. Either finish it or drop the ignore rule, because right now the file says one thing and the
repo does another.

### 6.3 `dist/`, `dist-electron/`, `release/` present on disk

Correctly gitignored. No action — noted only to confirm they are not tracked.

---

## 7. Documentation drift

Three concrete mismatches found while auditing, all in files that are supposed to be the source of
truth:

1. **CLAUDE.md's import-extension rule is inverted** — it documents the 5-file minority style as the
   convention (§2.4).
2. **CLAUDE.md's `viteStaticCopy` rule is over-broad** — only worker-reachable files need copying, not
   everything under `db|methods|services` (§3.2).
3. **AGENTS.md is already flagged as stale** by CLAUDE.md (its Commands, `ios/`, and dependency notes).
   It is 10 KB of orientation with a warning label on it. Either fix the three stale sections or fold
   the still-accurate parts into CLAUDE.md and delete it — a doc that opens by telling you which parts
   to distrust is worse than no doc.

`docs/` is otherwise in good shape: 18 files, indexed by `docs/README.md`, with `MASTER_TODO.md` as the
single ordered queue. The recent move of the four root-level `.md` files into `docs/` was the right
call. Note that most of `docs/` is currently untracked (only 4 of 18 files are in git) — worth
committing.

---

## 8. Suggested sequencing

Each phase is independently shippable and leaves the tree in a working state.

**Phase 1 — deletions (low risk, high signal).** Remove the 22 unreferenced `src/` files, `App.css`,
`styles.css`, `global.d.ts`, the unused public assets, `public/rive/`, `assets/rive/`, the 8.6 MB
diagram SVG, `qdrantCollection.example.txt`, `test-color-db.js`, and the 12 unused whisper binaries.
Drop `@rive-app/canvas` from `package.json`. Run `npm test` and record the typecheck/lint counts before
and after — they should go down, and that delta is your evidence nothing live was removed.

**Phase 2 — the online-mode cut.** Fix the four auth call sites to use IPC, delete `src/server/` and
`src/api/axios.ts`, drop the seven now-unused server dependencies. This is the one phase with real
product risk; it needs manual testing of login, register, and password reset.

**Phase 3 — naming.** The ~50 renames from §2, in one commit, no logic changes, `git mv` throughout.

**Phase 4 — packaging.** Narrow `viteStaticCopy`, add the `.js` extensions in `electron/methods/`,
narrow `extraResources`, and move binaries to LFS. **Verify with a real packaged build**, not just
`npm run dev` — every problem in this phase is invisible in dev mode.

**Phase 5 — decomposition.** The seven oversized files from §4, one per PR, ongoing.

Phases 1 and 2 together are what turn this from "a codebase with dead code in it" into a clean one.
The rest is polish, and phase 5 can run indefinitely in the background.
