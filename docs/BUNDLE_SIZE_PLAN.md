# MindSage — Installer & App Size Reduction Plan

**Written:** 2026-08-24 · **Measured against:** `release/MindSage Setup 1.0.0.exe` and `release/win-unpacked/` (built 2026-08-12)

**Current: 236 MB installer, 777 MB installed.** Roughly **60% of that is avoidable** without removing a single feature. This document measures where every megabyte goes, then ranks the cuts by payoff against effort.

**Legend:** `🟢 free` (config only, no behaviour change) · `🟡 cheap` (small code change) · `🔴 structural` (architecture decision) · effort `S` < 1d · `M` 1–3d · `L` > 3d

---

## 1. Where the 777 MB goes

### 1.1 Top level — `release/win-unpacked/`

| Size | Path | Notes |
| ---: | --- | --- |
| **484 MB** | `resources/` | The app itself — see §1.2 |
| 197 MB | `MindSage.exe` | Electron runtime. Fixed cost. |
| 43 MB | `locales/` | ~50 Chromium locale packs. **The app is English-only.** |
| 15 MB | `LICENSES.chromium.html` | Legally required. Compresses well; leave it. |
| 10 MB | `icudtl.dat` | ICU data. Trimmable only with a custom Electron build — not worth it. |
| 32 MB | GPU/misc DLLs | `libGLESv2`, `vk_swiftshader`, `d3dcompiler_47`, `ffmpeg.dll` — Electron internals. Leave. |

### 1.2 Inside `resources/` — the real target

| Size | Path | Verdict |
| ---: | --- | --- |
| **162 MB** | `app.asar` | Renderer bundle + **all production `node_modules`** — mostly avoidable (§2.3) |
| **90 MB** | `app.asar.unpacked/` | 78 MB `ffmpeg-static` + 12 MB `better-sqlite3` (§2.2, §2.6) |
| **83 MB** | `whisper-bin-x64/` | 77 MB of that is `ggml-tiny.en.bin` (§3.1) |
| **77 MB** | `win/` | Qdrant binary (§3.2) |
| **74 MB** | `mac/` | **The macOS Qdrant binary, shipped inside the Windows build** (§2.1) |

---

## 2. Quick wins — ~240 MB, config and packaging only

### 2.1 🟢 S — Stop shipping every platform's binaries to every platform · **−74 MB**

`extraResources` uses `"filter": ["**/*"]`, so the entire `resources/` tree goes into every build. The Windows installer carries the **74 MB macOS Qdrant binary**, and a future mac DMG would carry `qdrant.exe` plus the whole Windows Whisper toolchain (~160 MB of dead weight — see [MAC_RELEASE_PLAN.md](MAC_RELEASE_PLAN.md) §3.2).

**Fix** — move `extraResources` out of the shared `build` block and into per-platform blocks:

```jsonc
"win":   { "extraResources": [{ "from": "resources/win",   "to": "." },
                              { "from": "resources/whisper/win-x64", "to": "whisper" }] },
"mac":   { "extraResources": [{ "from": "resources/mac-${arch}", "to": "." },
                              { "from": "resources/whisper/darwin-${arch}", "to": "whisper" }] },
"linux": { "extraResources": [{ "from": "resources/linux", "to": "." }] }
```

This is the single highest ratio of payoff to risk in this document.

### 2.2 🟡 M — Replace the 81 MB `ffmpeg.exe` · **−65 MB**

`app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe` is **81 MB** — a full FFmpeg build with every codec, filter, and protocol ever compiled. [media.js:91](../electron/methods/media.js#L91) uses it for one job: converting recorded audio to the 16 kHz mono WAV that Whisper needs.

**Options, best first:**

1. **Drop FFmpeg entirely.** `whisper.cpp` reads WAV directly, and the renderer can record 16 kHz mono PCM via `MediaRecorder` / `AudioContext`. If the recording path can produce the right format, FFmpeg becomes unnecessary — **−81 MB**. Verify what formats [media.js](../electron/methods/media.js) is actually converting *from* first.
2. **Ship a minimal build.** `ffmpeg -f wav -acodec pcm_s16le` needs almost nothing; a build configured with `--disable-everything` plus the WAV/PCM/resample bits lands around **10–15 MB** — **−66 MB**. Requires hosting your own binaries per platform.
3. **Keep it.** Only if FFmpeg turns out to be doing more than audio conversion.

> ⚠️ An earlier draft claimed this binary was broken by `asar` packing. That was wrong — `electron-builder` auto-unpacks it and `ffmpeg-static` rewrites its own path at runtime. It works; it is simply enormous.

### 2.3 🟢 S — Move renderer-only libraries to `devDependencies` · **−80 MB**

**This is the biggest structural waste in the build, and it is a one-line-per-package fix.**

Vite bundles every renderer import into `dist/assets/*.js` — **2.6 MB total**. But `electron-builder` also copies all of `dependencies` into `app.asar` as raw source. So every renderer library ships **twice**: once tree-shaken and minified, once in full.

Measured from `node_modules`:

| Size | Package | Used by |
| ---: | --- | --- |
| 32.4 MB | `lucide-react` | renderer only |
| 21.6 MB | `date-fns` | renderer only |
| 6.2 MB | `react-dom` | renderer only |
| 5.9 MB | `chart.js` | renderer only |
| 5.8 MB | `gsap` | renderer only |
| 5.1 MB | `recharts` | renderer only |
| 3.3 MB | `zxcvbn` | renderer only |
| 2.2 MB | `framer-motion` | renderer only |
| **~82 MB** | **total** | all already inside the 2.6 MB bundle |

The main process imports only these npm packages (verified by scanning every `import`/`require` in `electron/`):

```
@qdrant/js-client-rest   axios          bcryptjs      better-sqlite3
electron-store           electron-updater (dynamic)   ffmpeg-static
get-port                 jsonwebtoken   sentiment     strip-ansi
zip-a-folder             zod
```

**Fix** — everything not on that list moves to `devDependencies`. Nothing about the build changes; Vite resolves devDependencies at build time exactly as it does now.

> Verify with a smoke test after the move: anything the main process `require`s dynamically (like `electron-updater`) must stay in `dependencies`, and a static scan can miss those.

### 2.4 🟢 S — Delete the dead backend's dependencies · **−15 MB**

`@google/genai` (9.6 MB), `@aws-sdk/client-s3` + presigner (3.5 MB), `express`, `pg`, `nodemailer`, `google-auth-library`, `cors`, `cookie-parser`, `dotenv` are used **only** by `src/server/`, which never boots. See [ONLINE_MODE_REMOVAL.md](ONLINE_MODE_REMOVAL.md) §2.1.

### 2.5 🟢 S — Stop shipping `public/` twice, and drop the screenshots · **−20 MB**

Two separate problems in `build.files`:

```jsonc
"files": ["dist/**/*", "dist-electron/**/*", "public/**/*", "package.json"]
```

1. **Vite already copies `public/` into `dist/`.** Listing both ships all 12 MB of static assets twice.
2. **`public/screenshots/` is 8 MB and has zero runtime references** — grepping the renderer for `screenshots/` returns nothing. It's README and marketing material, packaged inside the app.

**Fix** — remove `"public/**/*"` from `files`, and either move `screenshots/` out of `public/` into `assets/` (not shipped) or exclude it: `"!dist/screenshots/**"`.

### 2.6 🟢 S — Exclude `better-sqlite3`'s SQLite source · **−9.6 MB**

`app.asar.unpacked/node_modules/better-sqlite3/deps/` is 9.6 MB of SQLite amalgamation **source code**. Only the compiled `build/Release/better_sqlite3.node` is needed at runtime.

**Fix** — `"files": ["!**/node_modules/better-sqlite3/{deps,src}/**"]`. Test the packaged build afterwards; this is exactly the kind of exclusion that works until the addon needs rebuilding.

### 2.7 🟢 S — Ship one locale · **−42 MB**

```jsonc
"electronLanguages": ["en-US"]
```

Revisit if the app is ever localised — but it has no i18n layer today.

### 2.8 🟢 S — Maximise NSIS compression · **−10–20 MB installer**

```jsonc
"compression": "maximum"
```

Costs build time, shrinks only the installer (not the installed footprint). Worth it for a download.

---

## 3. Structural cuts — a further ~155 MB

These change how the app works and deserve their own decisions.

### 3.1 🔴 M — Download the Whisper model on first use instead of bundling it · **−77 MB**

`resources/whisper-bin-x64/models/ggml-tiny.en.bin` is 77 MB — **a third of the installer** — for a feature not every user will touch.

The consistency argument is strong: the app **already** downloads a 274 MB embedding model on first run ([OllamaSetup.js:133](../electron/services/OllamaSetup.js#L133)) and guides users through installing Ollama. Bundling a 77 MB speech model while streaming a 274 MB text model is an inconsistent bargain.

**Fix** — fetch on first use of voice journaling, with progress UI reusing the existing model-download component, cached under `userData`. Offer an offline-installer variant that pre-seeds it for air-gapped users.

**Tradeoff:** adds a network dependency to a feature that is otherwise fully offline. Given first-run already requires the network, this is a smaller regression than it appears — but it belongs in the same decision as [NETWORK_AUDIT.md](NETWORK_AUDIT.md) §1.2.

### 3.2 🔴 L — Replace Qdrant with `sqlite-vec` · **−77 MB**

The 77 MB Qdrant binary is a full distributed vector database — clustering, gRPC, snapshots, a web dashboard — spawned as a **separate process** to serve one user's journal on one machine. It also brings its own startup ordering, port allocation, and failure modes ([main.js:112](../electron/main.js#L112)).

`sqlite-vec` is a SQLite extension measured in **kilobytes** and runs inside the database the app already opens. For a single-user corpus of a few thousand entries, brute-force cosine similarity over stored vectors is more than fast enough.

**This also deletes an entire subsystem:** [qdrantManager.js](../electron/services/qdrantManager.js), the port-allocation dance, `QDRANT_HTTP_PORT` plumbing into the worker, the `synced_to_qdrant` state machine, and the `/qdrant` debug viewer page.

The iOS port already reached this conclusion — see `ios/docs/SQLITE_VEC_SPIKE.md`. Aligning desktop and iOS on one vector store is worth more than the 77 MB.

**Effort is real** (embedding storage, migration of existing vectors, search-quality validation), which is why it is last.

---

## 4. Projected results

| Stage | Installed | Installer |
| --- | ---: | ---: |
| **Today** | 777 MB | 236 MB |
| After §2 quick wins | ~537 MB | ~150 MB |
| After §2.2 ffmpeg | ~470 MB | ~130 MB |
| After §3.1 model on demand | ~395 MB | ~95 MB |
| After §3.2 sqlite-vec | **~320 MB** | **~80 MB** |

A 236 MB → ~150 MB installer is achievable in **under a day of config work**, with no behaviour change and no architectural decisions. The remainder is a roadmap, not a sprint.

---

## 5. Suggested order

1. **§2.1** per-platform resources — biggest payoff, lowest risk, and a prerequisite for the mac build anyway.
2. **§2.7** locales, **§2.5** public duplication, **§2.8** compression — pure config, minutes each.
3. **§2.3 + §2.4** dependency reclassification — do these together, since deleting `src/server/` and moving renderer deps touch the same manifest. Smoke-test the packaged build afterwards.
4. **§2.6** `better-sqlite3` exclusion — verify carefully; native addons punish over-eager exclusions.
5. **§2.2** ffmpeg — investigate option 1 (drop it) before building custom binaries.
6. **§3.1** Whisper model on demand — bundle with the first-run/network decisions in [NETWORK_AUDIT.md](NETWORK_AUDIT.md).
7. **§3.2** sqlite-vec — schedule alongside the iOS spike so both platforms land on one vector store.

---

## 6. Measure, don't guess

Add a size regression check to CI so this does not silently creep back:

```bash
npx electron-builder --dir            # unpacked build, no installer
du -sh release/win-unpacked           # or Get-ChildItem -Recurse on Windows
npx asar list release/win-unpacked/resources/app.asar | head -50
```

`electron-builder` also prints a per-file breakdown with `DEBUG=electron-builder`. Worth capturing the unpacked total as a CI artifact and failing the build if it grows more than ~5% between releases.
