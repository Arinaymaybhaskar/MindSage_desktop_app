# Security: CSP, window sandboxing, the session, the uninstaller

Read this before you add an IPC channel or handler, touch auth or sign-in, change `index.html`, the preload or any window, load anything from outside the app, write sign-in or password copy, or edit the Windows installer.

## The session lives in the main process; there are no tokens

[electron/session.js](../../electron/session.js) holds who is signed in, and every handler under `electron/methods/` reads it with `currentUserId()` (guarded, so signed-out calls refuse) rather than taking a credential from the renderer. **IPC channels take no `token` argument**: when you add one, read the user from the session, and never accept a user id from the renderer.

- Sign-in is `auth:login` (with `rememberMe`, persisted in electron-store `session.json`); `auth:get-session`, `auth:list-profiles` (the signed-out profile picker at `#/profiles`: id, username, full name and an avatar thumbnail, never email), `auth:logout` and the one-shot `auth:adopt-legacy-session` (upgrade path for old localStorage JWTs) are registered early with the setup IPC.
- Both windows follow the `auth:changed` broadcast.
- The password picks the account and keeps people out of the app; **it does not encrypt anything** (decision: option B), and the UI says so. Do not add copy that implies otherwise until encryption exists (a Jira ticket).
- `localStorage.userInfo` is a display cache only; never put anything in it a handler would trust.
- Profile deletion re-checks the password in the main process: see [trash-and-deletion.md](trash-and-deletion.md).

## The Content-Security-Policy

**The main window has a Content-Security-Policy, and it stops the renderer loading anything from outside the app.** It covers subresource loads only: navigation and new windows (KAN-62) and the main process (updater, model and installer downloads) are separate controls, so do not describe it as proof that MindSage makes no outside requests.

- It is built in [electron/csp.js](../../electron/csp.js) and injected into `index.html` by a Vite plugin (strict for a build; the dev server also gets its hot-reload socket, and the React preamble).
- The renderer may load script, style, fonts and `connect-src` from the app's own files only (on a `file://` page `'self'` is not tighter than that), and images, audio and the PDF frame from `data:` and `blob:`.
- **If a screen needs something else, change the policy deliberately in `csp.js` and its test; do not loosen it to make an error go away.** No `fetch` to a URL, no remote image, no Google Fonts link, no inline `<script>`.
- The splash has its own policy in `public/splash.html`.
- A `<meta>` policy cannot carry `frame-ancestors`, `report-uri` or `sandbox`.

## Window sandboxing and windowGuard

**Every window is sandboxed, with context isolation and no Node** (main, Quick Capture and the splash), so a preload may import only `electron` and a page script can never `require`; a window that needs something from the main process gets a channel in the preload, not Node.

[electron/windowGuard.js](../../electron/windowGuard.js) refuses new windows and any main-frame navigation or redirect away from the app's own pages (web and mail links go to the default browser; subframes are left to the CSP's `frame-src data:`; there is no permission-request handler yet), and `open-external` only takes `http:`, `https:` and `mailto:`.

## The Windows uninstaller keeps the journal unless asked

[assets/installer.nsh](../../assets/installer.nsh) (electron-builder's `buildResources` is `assets/`, so that is where it looks) adds a `customUnInstall` prompt, default No, that names the current user's `%APPDATA%\MindSage` (an all-users install is switched to the user context first). It never prompts or deletes during an update (`${isUpdated}`) or a silent uninstall, and leaves the `--delete-app-data` flag to electron-builder. There is no MSIX/appx target; if one is added, the Store removes the package's app data itself and this prompt does not apply. NSIS cannot be run off Windows; `installer.test.js` pins the properties and compiles it with `makensis` when present.
