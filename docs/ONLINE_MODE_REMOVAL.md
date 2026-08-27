# MindSage — Removing the Express Backend and Online Mode

**Reviewed:** 2026-08-24 · **Scope:** `src/server/`, the `mode === 'online'` branches in `electron/methods/`, and the `authMode` parameter threaded through the renderer.

A feasibility assessment for deleting the optional online-sync backend and the online/offline duality it implies. Each item is tagged **risk** (🟢 safe · 🟡 needs care · 🔴 blocking) and **effort** (`S` < 1d, `M` 1–3d, `L` > 3d).

**Verdict: safe.** Online mode is already unreachable from the UI, so this is dead-code deletion rather than feature removal. The backend can go today; the renderer cleanup is wide but mechanical.

---

## 1. Online mode is already unreachable

This is the fact that de-risks everything else, so it is worth stating first.

- The "Cloud" option in the auth-mode toggle is rendered `disabled` and labelled **"Coming Soon"** ([AuthLayout.tsx:101](../src/layouts/AuthLayout.tsx#L101), [:131](../src/layouts/AuthLayout.tsx#L131)). Its `onClick` only fires for the `offline` option ([:96](../src/layouts/AuthLayout.tsx#L96)).
- `authMode` initialises to `"offline"` in both [login.tsx:22](../src/pages/auth/login.tsx#L22) and `register.tsx`, and no code path calls `setAuthMode("online")`.
- `AuthContext.login` therefore always persists `authMode: "offline"` to `localStorage` ([AuthContext.tsx](../src/context/AuthContext.tsx)).

Every `mode === 'online'` branch in the main process is consequently dead at runtime.

---

## 2. 🟢 `src/server/` is fully orphaned · Effort: S

24 files, 1,877 LOC. Exactly one reference exists anywhere in the repo: the commented-out import at [electron/main.js:8](../electron/main.js#L8).

Nothing else touches it:

| Consumer | Includes `src/server/`? |
| --- | --- |
| Vite renderer build | No — not imported from `src/main.tsx` |
| `viteStaticCopy` targets | No — only `electron/db`, `methods`, `services`, `store.js`, `eventBus.js`, `qdrantWorker.js` |
| `electron-builder` `files` | No |
| `tsconfig.app.json` | Nominally (`include: ["src"]`) but files are `.js` and `allowJs` is off |
| `eslint.config.js` | No — matches `**/*.{ts,tsx}` only |

Deleting the directory also removes `src/server/utils/db.pdf` (a 684 KB binary tracked in git) and the hardcoded JWT-secret debt recorded in [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) §2.1.

### 2.1 Dependencies that become removable

None of these are used anywhere outside `src/server/`:

`express` · `pg` · `cors` · `cookie-parser` · `nodemailer` · `@aws-sdk/client-s3` · `@aws-sdk/s3-request-presigner` · `@google/genai` · `google-auth-library` · `dotenv`

**Keep** `jsonwebtoken` and `bcryptjs` — offline auth depends on both ([electron/methods/auth.js:32](../electron/methods/auth.js#L32), [:50](../electron/methods/auth.js#L50)).

`axios` becomes removable **only if** §4 is also completed; it is still imported by `electron/methods/{auth,journal,user}.js`.

> Removing `dotenv` is safe precisely because it was never loaded in the main process — which is also why Google OAuth is broken (see §5).

---

## 3. 🟢 Online branches in the main process · Effort: S

44 `mode === 'online'` branches across nine files. Every one has a complete offline `else`, and several are already stubs:

| File | Branches |
| --- | --- |
| `electron/methods/goal.js` | 10 |
| `electron/methods/journal.js` | 9 |
| `electron/methods/user.js` | 6 |
| `electron/methods/chat.js` | 6 |
| `electron/methods/dashboard.js` | 4 |
| `electron/methods/categories.js` | 4 |
| `electron/methods/progressLogs.js` | 2 |
| `electron/methods/auth.js` | 2 |
| `electron/methods/exportData.js` | 1 |

Existing stubs confirm the branch was never real: [chat.js:303-342](../electron/methods/chat.js#L303-L342) returns `{ error: "Online mode not implemented" }` four times, and [exportData.js:28](../electron/methods/exportData.js#L28) returns `"Export not available in online mode"`.

**Approach** — delete the `if` arm, unindent the `else`, drop the now-unused `mode` parameter last (see §4 for why ordering matters).

---

## 4. 🟡 `authMode` in the renderer — wide but mechanical · Effort: M

`authMode` is threaded as the **first positional argument** of nearly every service call: **151 references across 25 files**, including 15 direct `localStorage.getItem("authMode")` reads.

Affected files:

```
src/api/          categoryService, chatService, dashBoardService,
                  goalService, journalService, progressLogsService
src/components/   GlobalSearch, quickCapture, MoodSentimentChart,
                  goals/modals/ManualGoalModal
src/context/      AuthContext
src/layouts/      AuthLayout
src/pages/        auth/{login,register,changePassword,deleteAccount},
                  dashBoard, dataExport, goalDetail, goals, journalDetails,
                  journalForm, journalList, Memories, settings
```

**The risk is positional, not logical.** The value is always `"offline"`, so behaviour cannot change — but removing a leading parameter from a service *and* its IPC handler must happen in lockstep, or every subsequent argument silently shifts by one. Prefer removing the parameter one service at a time, renderer and handler together.

[chat.tsx](../src/pages/chat.tsx) already passes the literal `"offline"` at all seven call sites — that is the pattern to converge on if you want an intermediate step before full removal.

---

## 5. 🟢 Dead code with zero callers · Effort: S

Safe to delete outright, no refactor required:

- `journalService.chat`, `getUploadUrl`, `getMediaUrl` ([journalService.tsx:169-210](../src/api/journalService.tsx#L169-L210)) — all three hardcode `"online"` and have **no callers**. `getMediaUrl` returns a fabricated `s3-media-url.com` URL.
- `import axios` in [electron/methods/categories.js:3](../electron/methods/categories.js#L3) — never called.
- [src/api/axios.ts](../src/api/axios.ts) in its entirety — `baseURL: "http://localhost:4000/api"`, plus a refresh-token interceptor pointing at the same dead host.
- The `login:google` handler and channel ([auth.js:98](../electron/methods/auth.js#L98), [ipcHandlers.js:51](../electron/ipcHandlers.js#L51)) and `src/components/googleLoginElectron.tsx`.

---

## 6. 🟡 Features that are broken today, not merely dormant

Removal *fixes* these rather than regressing them — but each needs its UI entry point removed too, not just its implementation.

### 6.1 Forgot password is linked and dead
[login.tsx:142](../src/pages/auth/login.tsx#L142) renders a visible link to `/forgot-password`. That page posts to `localhost:4000` ([forgotPassword.tsx:31](../src/pages/auth/forgotPassword.tsx#L31), [:48](../src/pages/auth/forgotPassword.tsx#L48)) with no local fallback, so clicking it always yields *"Can't reach the API server."* Delete the link, the route, and the page — and note that offline password recovery is then genuinely absent (see [AUTH_REVIEW.md](AUTH_REVIEW.md) §2.6).

### 6.2 Google login is broken twice over
No `GOOGLE_CLIENT_ID` in the main process, and a callback that posts to a dead host. Nothing to preserve. Details in [NETWORK_AUDIT.md](NETWORK_AUDIT.md) §1.3.

---

## 7. 🔴 The one real gotcha: stale `localStorage`

A legacy install may still hold `authMode: "online"` written by an older build. Login always starts from a fresh `useState("offline")`, but several screens read the value back from storage and would route into branches you have deleted:

- [settings.tsx:47](../src/pages/settings.tsx#L47)
- [GlobalSearch.tsx:303](../src/components/GlobalSearch.tsx#L303)
- [changePassword.tsx:13](../src/pages/auth/changePassword.tsx#L13)
- [deleteAccount.tsx:17](../src/pages/auth/deleteAccount.tsx#L17)
- [quickCapture.tsx:13](../src/components/quickCapture.tsx#L13)

Completing §4 resolves this permanently. **If you do §3 without §4**, add a defensive coercion so a stale `"online"` can never reach a deleted branch:

```ts
const authMode = "offline"; // online mode removed; ignore any legacy stored value
```

---

## 8. Suggested sequencing

1. **Delete `src/server/`** and the commented import at [main.js:8](../electron/main.js#L8). Prune the ten dependencies in §2.1. Zero risk, immediate win.
2. **Delete the zero-caller dead code** in §5, including `src/api/axios.ts` and the Google login path.
3. **Remove the broken UI entry points** in §6 — the forgot-password link especially, since it is the only user-visible casualty of the current state.
4. **Collapse the main-process online branches** (§3), adding the §7 coercion in the same commit.
5. **Retire the `authMode` parameter** (§4) service by service. Optional; safe to defer.

Steps 1–3 are independently shippable and account for most of the value.

---

## 9. Documentation to update

These all describe the online backend as an existing (if dormant) feature:

- [AGENTS.md](../AGENTS.md) — lines 7, 23, 25, 29, 43, 46, 53
- [CLAUDE.md](../CLAUDE.md) — lines 21, 31, 45
- [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) — §2.1 (hardcoded secrets), §3 (`db.pdf`), and the empty-directory notes
- [.env.example](../.env.example) — most entries become obsolete; only `GOOGLE_*` would survive, and only if OAuth is kept
- [README.md](../README.md) — line 379 proposes replacing IPC with an Express API layer, which contradicts a fully offline direction
