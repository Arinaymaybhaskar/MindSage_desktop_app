# MindSage — macOS Release Plan

**Written:** 2026-08-24 · **Status:** Plan · **Current state:** `build.mac.target: dmg` is declared, but no macOS build has ever been produced or shipped.

**Verdict: macOS is roughly 60% wired and 0% shippable.** Qdrant has a mac binary, the app-lifecycle branches exist, and `electron-builder` is configured for DMG — but speech-to-text has no mac build at all, the bundled Qdrant is Intel-only, the database lands in the wrong directory, and nothing is signed or notarised. Each item below was verified against the code, not assumed.

**Legend:** `🔴 blocker` `🟠 high` `🟡 medium` `🟢 polish` · effort `S` < 1d · `M` 1–3d · `L` > 3d

---

## 1. 🔴 Blockers — the app will not work correctly on macOS

### 1.1 🔴 L — Whisper.cpp has no macOS build
[whisper.js:36](../electron/methods/whisper.js#L36) and [:89](../electron/methods/whisper.js#L89) hardcode Windows paths:

```js
path.join(basePath, "Release", "whisper-stream.exe")
path.join(basePath, "Release", "whisper-cli.exe")
```

`resources/whisper-bin-x64/` contains only `.exe` and `.dll` files. **Speech-to-text — a headline feature — is Windows-only.**

**Fix** — build `whisper-cli` and `whisper-stream` for `darwin-arm64` and `darwin-x64` (Metal-enabled is worth it on Apple Silicon), restructure to `resources/whisper/<platform>-<arch>/`, and replace the hardcoded paths with a platform resolver mirroring the one in [qdrantManager.js:66-78](../electron/services/qdrantManager.js#L66-L78), which already does this correctly. The `ggml-tiny.en.bin` model (77 MB) is platform-neutral and can be shared.

### 1.2 🔴 M — The bundled Qdrant binary is Intel-only
`resources/mac/qdrant` is a 64-bit Mach-O with `cputype 0x01000007` (**x86_64**), confirmed from its header. On Apple Silicon it needs Rosetta 2, which **is not installed by default** on a clean macOS. Vector search would fail at startup on most modern Macs with a confusing error.

**Fix** — ship `resources/mac-arm64/qdrant` and `resources/mac-x64/qdrant`, select by `process.arch`, and extend the `platformDir` switch in [qdrantManager.js:68](../electron/services/qdrantManager.js#L68) (which currently maps darwin → a single `mac` directory).

### 1.3 🔴 S — The database is written to the wrong directory on macOS
[connection.js:6](../electron/db/connection.js#L6) builds the path by hand:

```js
process.env.APPDATA || (process.platform == 'darwin'
  ? process.env.HOME + '/Library/Preferences'
  : process.env.HOME + "/.local/share")
```

`~/Library/Preferences` is for plists, not application data — Apple's convention is `~/Library/Application Support/<App>`. Worse, it disagrees with the rest of the app: the Ollama and Qdrant logs use `app.getPath("userData")` ([OllamaSetup.js:18](../electron/services/OllamaSetup.js#L18)), so on macOS the journal and its logs land in two different places. It also risks the DB being swept up by preference-syncing tools.

**Fix** — use `app.getPath("userData")` everywhere. This is a two-line change *before* any mac build exists; after launch it becomes a migration.

### 1.4 🔴 M — Nothing is signed or notarised
`build.mac` is `{ "target": "dmg" }` and nothing else. There is no `hardenedRuntime`, no entitlements file, no `notarize` block, and no `category`. An unsigned, un-notarised DMG on modern macOS shows *"MindSage is damaged and can't be opened"* — Gatekeeper's unhelpful phrasing for "unsigned" — and most users will simply delete it.

This is the single largest chunk of work and is covered in §2.

### 1.5 🔴 S — No microphone usage description
Voice journaling records audio. macOS **terminates** an app that touches the microphone without `NSMicrophoneUsageDescription` in its `Info.plist`. This is a hard crash, not a permission prompt.

**Fix** — add to `build.mac.extendInfo`:

```jsonc
"extendInfo": {
  "NSMicrophoneUsageDescription":
    "MindSage transcribes your voice entries on this device. Audio never leaves your Mac."
}
```

Add `NSCameraUsageDescription` only if the camera is ever used; do not request permissions the app does not need.

---

## 2. Signing and notarisation

### 2.1 🔴 M — Prerequisites
- Apple Developer Program membership (USD 99/yr).
- A **Developer ID Application** certificate (for distribution outside the App Store) and a **Developer ID Installer** certificate if a `.pkg` is ever added.
- An app-specific password or an App Store Connect API key for `notarytool`.

### 2.2 🔴 M — Hardened Runtime and entitlements
Notarisation requires the Hardened Runtime, and Electron needs specific exceptions:

```jsonc
// package.json → build.mac
"hardenedRuntime": true,
"gatekeeperAssess": false,
"entitlements": "build/entitlements.mac.plist",
"entitlementsInherit": "build/entitlements.mac.plist"
```

```xml
<!-- build/entitlements.mac.plist -->
<key>com.apple.security.cs.allow-jit</key><true/>
<key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
<key>com.apple.security.cs.disable-library-validation</key><true/>
<key>com.apple.security.device.audio-input</key><true/>
```

- `allow-jit` and `allow-unsigned-executable-memory` — V8.
- `disable-library-validation` — required because the app loads the `better-sqlite3` native addon and spawns third-party binaries.
- `device.audio-input` — Whisper recording.

### 2.3 🔴 M — Every nested binary must be signed
This is where Electron mac builds usually fail. Notarisation rejects the bundle if *any* executable inside it is unsigned. This app ships four:

| Binary | Source |
| --- | --- |
| `qdrant` | `resources/mac*/` |
| `whisper-cli`, `whisper-stream` | to be added (§1.1) |
| `ffmpeg` | `ffmpeg-static` in `node_modules` |
| `better_sqlite3.node` | native addon |

**Fix** — list them in `build.mac.binaries` so `electron-builder` signs each with `--options runtime`, and verify with `codesign --verify --deep --strict --verbose=2` before submitting.

### 2.4 🟠 S — Notarisation config

```jsonc
"notarize": { "teamId": "<TEAM_ID>" }
```

with `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` in the environment. `electron-builder` staples the ticket automatically. Budget 5–20 minutes per submission, and expect the first three attempts to fail on §2.3.

---

## 3. 🟠 Related packaging bug (affects all platforms)

### 3.1 🟢 — `ffmpeg-static` and asar: verified fine, no action needed
An earlier draft of this document flagged `spawn(ffmpegPath, …)` at [media.js:91](../electron/methods/media.js#L91) as broken because `package.json` declares no `asarUnpack`. **That was wrong.** Inspecting the packaged build shows `electron-builder` auto-unpacks executables:

```
release/win-unpacked/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe
```

`ffmpeg-static`'s `index.js` rewrites its own path to `app.asar.unpacked` at runtime, so the spawn resolves correctly. The same behaviour applies on macOS.

The binary is still an **81 MB** problem for a different reason — see [BUNDLE_SIZE_PLAN.md](BUNDLE_SIZE_PLAN.md) §2.2. Note that under Hardened Runtime it must still be signed (§2.3).

### 3.2 🟠 S — `extraResources` ships every platform's binaries to every platform
The current filter is `"**/*"`, so a mac DMG would carry `qdrant.exe` (77 MB) and the whole Windows Whisper toolchain (83 MB) — roughly **160 MB of dead weight**, all of which also has to be signed and notarised.

**Fix** — move to per-platform `extraResources` under `build.mac` / `build.win` / `build.linux`, each pulling only its own directory.

---

## 4. 🟠 Build matrix and CI

### 4.1 🟠 M — Architecture strategy
| Option | Size | Notes |
| --- | --- | --- |
| `arm64` only | smallest | Excludes 2020-and-earlier Intel Macs |
| `arm64` + `x64` as two DMGs | 2 × ~250 MB | Users must pick the right one |
| `universal` | largest | One download; doubles native-addon build complexity |

**Recommendation: two separate DMGs.** `better-sqlite3` needs a per-arch `electron-rebuild`, and universal builds make that materially harder for a single-maintainer project. Publish both to the same GitHub Release and let `electron-updater` resolve by arch.

### 4.2 🟠 S — Extend `release.yml`
The workflow currently has one `release-windows` job on `windows-latest`. Add a `release-macos` job on `macos-14` (Apple Silicon) with a `matrix.arch: [arm64, x64]`, the signing secrets (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`), and `npm run release -- --mac --<arch>`.

Note that `latest-mac.yml` must publish alongside `latest.yml` for auto-updates to resolve — and see [NETWORK_AUDIT.md](NETWORK_AUDIT.md) §1.1 before enabling auto-update at all.

---

## 5. 🟡 Behaviour differences to handle

- **🟡 S — Ollama auto-install is Windows-only.** [appSetup.js:174](../electron/services/appSetup.js#L174) opens the download page on every other platform. Acceptable for v1, but the mac onboarding copy should say so plainly rather than looking broken. A Homebrew hint (`brew install ollama`) is a cheap improvement.
- **🟡 S — The global shortcut is `Command+Option+Space`** ([main.js:309](../electron/main.js#L309)), which collides with Finder search on some configurations. Make it configurable and detect registration failure — `globalShortcut.register` returns `false` and the code currently only logs it.
- **🟡 S — `MS_DISABLE_GPU` is gated on `win32`** ([main.js:123](../electron/main.js#L123)). The same escape hatch is worth having on macOS.
- **🟢 S — Window chrome.** The Quick Capture window uses `frame: false`, `transparent: true`, `hasShadow: false`, `roundedCorners: false` — all tuned for Windows DWM quirks documented in the code. On macOS these produce a shadowless square popup that looks alien. Use `titleBarStyle: "hiddenInset"` and let the OS draw shadows and corners.
- **🟢 S — Traffic lights.** The custom `TitleBar.tsx` needs to yield to the native window controls on macOS.
- **🟢 S — `app.dock` and menu bar.** macOS expects a real application menu (Cmd+Q, Cmd+W, Cmd+,) — verify one is set rather than relying on the Windows-shaped chrome.

---

## 6. 🟢 Store-front polish

- `build.mac.category` — `public.app-category.lifestyle` or `.productivity`. Required metadata.
- DMG layout: background image, icon positions, `/Applications` symlink.
- `icon2.icns` at 1024×1024 (currently only `.ico` and `.png` are referenced).
- Verify the app name, copyright, and version render correctly in *About*.

---

## 7. Pre-release test checklist

Run on **both** a clean Apple Silicon Mac and a clean Intel Mac — "clean" meaning no Xcode, no Homebrew, no Rosetta:

- [ ] DMG opens without a Gatekeeper warning; drag-to-Applications works
- [ ] First launch completes onboarding, including the Ollama guidance path
- [ ] Qdrant starts natively (confirm no Rosetta prompt appears)
- [ ] Microphone permission prompts once, and Whisper transcription succeeds
- [ ] FFmpeg audio conversion works from the packaged app (validates §3.1)
- [ ] The DB is created under `~/Library/Application Support/MindSage`
- [ ] Journal CRUD, semantic search, and AI enrichment all work
- [ ] Global shortcut registers, or fails visibly rather than silently
- [ ] Cmd+Q, Cmd+W, dock-click-to-reopen, and full-screen behave natively
- [ ] `spctl -a -vvv /Applications/MindSage.app` reports **accepted / Notarized Developer ID**
- [ ] Uninstall by dragging to Trash leaves a documented, findable data directory

---

## 8. Phased plan

**Phase 1 — Make it run (≈1 week).** §1.3 userData path, §1.2 arm64 Qdrant, §1.1 mac Whisper binaries, §3.1 asar/ffmpeg, §3.2 per-platform resources. Validate with an unsigned local build before spending money on a certificate.

**Phase 2 — Make it installable (≈1 week).** Apple Developer enrolment, §2 signing and notarisation end to end, §1.5 Info.plist. Expect the nested-binary signing in §2.3 to consume most of this.

**Phase 3 — Make it native (≈3–4 days).** §5 behaviour differences and §6 polish.

**Phase 4 — Automate (≈2 days).** §4.2 CI matrix, `latest-mac.yml`, and the §7 checklist run against a real release candidate.

**Do not start Phase 2 before Phase 1 passes locally.** Paying for a certificate to notarise a build whose core features do not run on the platform is the classic way to waste the first month of a mac port.
