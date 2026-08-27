# MindSage — Network & Offline Audit

**Reviewed:** 2026-08-24 · **Scope:** Every outbound network path reachable from the Electron main process, the renderer bundle, and the bundled local services.

MindSage is marketed and architected as offline-first. This document records what the app *actually* sends over the network, ranked by whether it fires without user action. Each item has a **severity** (🔴 fires unprompted · 🟠 fires on first run · 🟡 user-initiated or unreachable), the **evidence** (file/line), and the fix.

**Verdict: not fully offline.** One external call fires on every launch of a packaged build with no user action. Everything that touches journal content is local.

---

## 1. Confirmed external egress

### 1.1 🔴 Auto-updater contacts GitHub on every launch · Effort: S

[electron/main.js:183](../electron/main.js#L183) calls `initAutoUpdater(win)` immediately after the main window is shown. The wrapper at [electron/services/autoUpdater.js:11](../electron/services/autoUpdater.js#L11) returns early when `app.isPackaged` is false — so dev is clean — but in the shipped app it runs `checkForUpdatesAndNotify()` with `autoDownload = true`.

The feed is baked into the packaged build at `release/win-unpacked/resources/app-update.yml`:

```yaml
owner: Arinaymaybhaskar
repo: MindSage_desktop_app
provider: github
updaterCacheDirName: mindsage-desktop-app-updater
```

This path has demonstrably executed: `%LOCALAPPDATA%\mindsage-desktop-app-updater\` already contains a cached `installer.exe`.

**Impact** — on every start the app reveals its IP address and app version to GitHub, and may download an installer in the background. This is the single finding that contradicts the offline-first claim, because no user action triggers it.

**Fix** — gate the check behind an explicit setting (default off) in `user_settings`, or behind a manual "Check for updates" button in Settings. If updates must stay automatic, disclose it in-app and offer an opt-out.

### 1.2 🟠 First-run embedding-model pull · Effort: M

`OllamaEmbeddingModelSetup()` runs at startup ([electron/main.js:13](../electron/main.js#L13)) and, when `nomic-embed-text:v1.5` is absent, spawns `ollama pull` ([electron/services/OllamaSetup.js:133](../electron/services/OllamaSetup.js#L133)) — roughly 274 MB from Ollama's registry.

Related, both user-initiated: the Ollama installer download from `ollama.com/download/OllamaSetup.exe` ([appSetup.js:27](../electron/services/appSetup.js#L27)) and the `ollama.com` links opened from the tutorial page ([OllamaTutorial.tsx:308-385](../src/pages/OllamaTutorial.tsx#L308-L385)).

**Impact** — a machine with no network cannot complete first-time setup. This is inherent to shipping without bundled model weights, not a defect, but it should be stated plainly rather than discovered.

**Fix** — document the one-time online requirement in the README and the setup UI. Consider offering a fully offline installer variant with weights pre-seeded.

### 1.3 🟡 Google OAuth — reachable handler, broken end to end · Effort: S

[electron/methods/auth.js:104-160](../electron/methods/auth.js#L104-L160) contacts `accounts.google.com`, `oauth2.googleapis.com`, and `www.googleapis.com`. The `login:google` IPC channel is registered at [electron/ipcHandlers.js:51](../electron/ipcHandlers.js#L51).

It cannot succeed. `dotenv` is never loaded in the main process — it appears only under `src/server/` — so `process.env.GOOGLE_CLIENT_ID` is `undefined` and the authorization URL is built with `client_id=undefined` ([auth.js:146](../electron/methods/auth.js#L146)). Even if that were fixed, the callback posts to `localhost:4000/api/auth/google-login`, a server that is never started.

**Fix** — delete the handler and the channel. See [ONLINE_MODE_REMOVAL.md](ONLINE_MODE_REMOVAL.md).

### 1.4 🟡 Wikimedia-hosted Google logo — present in the bundle, never requested · Effort: S

[src/components/googleLoginElectron.tsx:69](../src/components/googleLoginElectron.tsx#L69) hotlinks the button icon from `upload.wikimedia.org`, and the URL is present in the built renderer bundle.

**It does not fire.** `GoogleLoginElectron` is gated behind an `authMode === "online"` conditional on both [login.tsx:162](../src/pages/auth/login.tsx#L162) and [register.tsx:475](../src/pages/auth/register.tsx#L475); the "Cloud" toggle in [AuthLayout.tsx:101](../src/layouts/AuthLayout.tsx#L101) is `disabled` and labelled "Coming Soon"; and `authMode` initialises to `"offline"` with no code path that sets it to `"online"`. The element never mounts, so the request is never made.

**Fix** — inline the logo as an SVG regardless, so the asset cannot leak if the gate is ever removed. Removing online mode deletes the component outright.

---

## 2. Local-only traffic (loopback — not egress)

Everything below stays on `127.0.0.1` and is safe:

| Service | Endpoint | Evidence |
| --- | --- | --- |
| Ollama (generation + embeddings) | `127.0.0.1:11434` | [appSetup.js:23](../electron/services/appSetup.js#L23), [ollama.js](../electron/methods/ollama.js) |
| Qdrant (vector search) | `127.0.0.1:<free port>` | [qdrantManager.js:240](../electron/services/qdrantManager.js#L240) |
| Whisper.cpp (STT) | bundled binary, no socket | [whisper.js](../electron/methods/whisper.js) |
| FFmpeg | bundled binary, no socket | [media.js](../electron/methods/media.js) |
| SQLite | local file | [db/connection.js:6](../electron/db/connection.js#L6) |

Media handling is entirely filesystem-based — thumbnails are generated with Electron's own `nativeImage` and cached under `userData` ([media.js:36](../electron/methods/media.js#L36)).

---

## 3. Dead network paths

These exist in source but cannot execute in the shipped app:

- All `localhost:4000` calls in `electron/methods/journal.js`, `user.js`, `auth.js`, and `src/api/axios.ts` — the Express server is never started ([main.js:8](../electron/main.js#L8) is commented out).
- Gemini (`@google/genai`), nodemailer, S3, and `pg` — confined to `src/server/`, which never boots.
- A hardcoded `s3-media-url.com` placeholder in [journalService.tsx:208](../src/api/journalService.tsx#L208) — a method with zero callers.
- `import axios` in [electron/methods/categories.js:3](../electron/methods/categories.js#L3) — imported, never called.

---

## 4. Missing controls

### 4.1 🟠 No Content-Security-Policy anywhere · Effort: S

Neither [index.html](../index.html) nor the `BrowserWindow` configuration sets a CSP, and `webSecurity` is left at its default. Nothing structurally prevents a future component from loading a remote script, font, or image.

**Fix** — add a restrictive CSP meta tag (or inject headers via `session.defaultSession.webRequest`) limiting `default-src` to `'self'` plus the loopback origins the app genuinely uses. For an offline-first app this is close to free, and it converts "we don't make external requests" from a convention into an enforced invariant.

### 4.2 🟡 Fonts are correctly self-hosted · Effort: none

Worth recording as a positive: the display fonts were migrated off `fonts.googleapis.com` and are bundled locally ([src/index.css:6](../src/index.css#L6)). No webfont egress.

---

## 5. Verification notes

Findings are derived from source, the built renderer bundle (`dist/assets/*.js`), the packaged build's `app-update.yml`, and the updater cache on disk.

**A live packet capture was attempted and did not complete.** `npm run dev` fails to boot Electron with `TypeError: Cannot read properties of undefined (reading 'exports')` — the `better-sqlite3` native addon needs `npm run rebuild` against the current Electron ABI. The packaged build at `release/win-unpacked/MindSage.exe` (built 2026-08-12) exits before reaching "App ready" in `%APPDATA%\MindSage\main.log`.

**To re-verify at runtime:**

```powershell
npm run rebuild
Start-Process "release\win-unpacked\MindSage.exe"
$ids = (Get-Process MindSage).Id
Get-NetTCPConnection | Where-Object {
    $ids -contains $_.OwningProcess -and
    $_.RemoteAddress -notin @('0.0.0.0','::','127.0.0.1','::1')
}
```

Any row returned is external egress. Expect zero once §1.1 is addressed.
