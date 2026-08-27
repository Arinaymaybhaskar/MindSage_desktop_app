# MindSage — Authentication Review

**Reviewed:** 2026-08-24 · **Scope:** The full auth path — `login.tsx` → `authService` → `auth:login` IPC → `electron/methods/auth.js` → `electron/db/auth.js` → SQLite, plus every downstream handler's token check, session persistence, and account management.

Each item has a **severity** (🔴 major · 🟠 moderate · 🟡 minor) and an **effort** estimate (`S` < 1d, `M` 1–3d, `L` > 3d).

---

## 1. The framing problem

Auth here is a JWT-shaped ritual wrapped around a local SQLite row. It borrows the entire vocabulary of a client/server system — access tokens, 15-minute expiry, refresh interceptors, bearer headers — but there is no server, no network boundary, and no attacker who cannot simply open `%APPDATA%/MindSage/mind-sage.db`. Nearly every defect in §2 follows from that mismatch.

Two coherent designs exist. **Pick one before fixing anything below**, because §2.1, §2.5, §2.6, and §2.8 are all downstream of the answer.

### Option A — It's a lock
The password protects the journal from someone with access to the machine. This is the design the UI already implies (there is a "Require biometrics to access the app" toggle). To be real it needs:

- A key derived from the password, encrypting the database (§2.6) — otherwise the lock guards an open door.
- An enforced session lifetime: idle timeout, or lock-on-launch (§2.8).
- An honest recovery story: key-from-password means a forgotten password is unrecoverable data loss. That tradeoff must be stated at signup.

### Option B — It's profile selection
The password just picks which user row you write as, with no security claim. Then:

- Drop tokens entirely; `bcrypt.compare` on login, hold `userId` in main-process memory.
- Delete roughly 200 lines of ceremony: `generateAccessToken`, the shared secret, `getUserIdFromToken` in nine files, the refresh interceptor.
- Remove the biometric toggle rather than leaving it inert.

**The current code is neither.** It pays the complexity cost of A while delivering B.

---

## 2. Findings

### 2.1 🔴 Tokens are never verified — `jwt.decode`, never `jwt.verify` · Effort: M

Every handler that reads a token calls `jwt.decode`, which parses the payload **without checking the signature or `exp`**:

[categories.js:11](../electron/methods/categories.js#L11) · [chat.js:16](../electron/methods/chat.js#L16) · [exportData.js:10](../electron/methods/exportData.js#L10) · [goal.js:11](../electron/methods/goal.js#L11) · [journal.js:16](../electron/methods/journal.js#L16) · [progressLogs.js:12](../electron/methods/progressLogs.js#L12) · [qdrant.js:14](../electron/methods/qdrant.js#L14) · [user.js:12](../electron/methods/user.js#L12)

Two consequences:

1. The `offlineAccessTokenSecret` at [auth.js:9](../electron/methods/auth.js#L9) is decorative. It signs tokens that nothing validates, so it provides no integrity guarantee — while still being a hardcoded secret in source (also recorded in [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) §2.1).
2. `expiresIn: '15m'` ([auth.js:32](../electron/methods/auth.js#L32)) is never enforced.

**This second point is load-bearing by accident.** The *only* reason sessions survive past 15 minutes is that nothing checks `exp`. Switching the handlers to `jwt.verify` in isolation would log every user out mid-session with no way back, because the refresh interceptor at [axios.ts:57](../src/api/axios.ts#L57) points at `localhost:4000` — a server that is never started.

**Fix** — do not fix this piecemeal. Under Option A, introduce verification *and* a workable lifetime (long expiry, or renew-on-activity in the main process) in the same change. Under Option B, delete the tokens instead.

### 2.2 🔴 `logout()` does not log the user out · Effort: S

The entire body of `logout` in [AuthContext.tsx](../src/context/AuthContext.tsx) is:

```js
const logout = () => {
  localStorage.clear();
};
```

It never calls `setAccessToken(null)` or `setUser(null)`, so React context still holds a truthy token and [privateRoute.tsx:8](../src/routes/privateRoute.tsx#L8) keeps admitting the user. [profileDropdown.tsx:106](../src/components/profileDropdown.tsx#L106) masks the bug with a `window.location.reload()`; the other two call sites do not.

**Fix** — reset both state values in `logout`, and stop relying on a reload to make it take effect.

### 2.3 🟠 `localStorage.clear()` is too blunt · Effort: S

The app owns five keys: `accessToken`, `authMode`, `userInfo`, **`colorTheme`**, and **`zoom_scale`**. `logout` wipes all of them, so signing out silently resets the user's theme and zoom level.

**Fix** — remove the three auth keys explicitly rather than clearing the namespace.

### 2.4 🟠 The dashboard logs you out on any error · Effort: S

[dashBoard.tsx:139](../src/pages/dashBoard.tsx#L139) wraps six parallel fetches in a single `catch` whose only action is `logout()`. A transient SQLite error, a malformed IPC response, or one slow Qdrant call destroys the session and (per §2.3) the user's theme.

Compounded by §2.2, the result is incoherent: `localStorage` is cleared but the UI stays on the dashboard with stale context state until something triggers a reload.

**Fix** — surface the error and offer a retry. Reserve `logout()` for an actual authentication failure, which — given §2.1 — cannot currently occur.

### 2.5 🟠 `biometric_lock` is a toggle that does nothing · Effort: M

The setting exists in the schema ([connection.js:34](../electron/db/connection.js#L34)), in the `userService` type, and renders in [SecuritySettings.tsx:30-36](../src/components/settings/SecuritySettings.tsx#L30-L36) under the label *"Require biometrics to access the app."* There is **no implementation anywhere** — no `systemPreferences.promptTouchID`, no Windows Hello call, no gate on app launch.

In a private journaling app, a security control that displays as enabled while doing nothing is worse than no control: it induces false confidence about where the journal is safe to keep.

**Fix** — implement it (Option A) or remove the toggle (Option B). Do not ship it inert.

### 2.6 🔴 The database is unencrypted · Effort: L

[connection.js:6-10](../electron/db/connection.js#L6-L10) opens a plain `better-sqlite3` file at a predictable path. Journal content, titles, AI summaries, and mood data are readable by any process or person with file access.

This is the central gap for an offline journal: **the login screen is a UI gate in front of an open door.** The password becomes meaningful only when it derives the key that protects the data.

**Fix** — SQLCipher (via `better-sqlite3-multiple-ciphers`), or app-layer encryption of the sensitive columns, with the key derived from the password via a proper KDF. Note the honest tradeoff: this makes a forgotten password equal permanent data loss, which is precisely why no offline password reset exists today (see [ONLINE_MODE_REMOVAL.md](ONLINE_MODE_REMOVAL.md) §6.1). Decide the recovery story — recovery code, exported key file, or explicit "no recovery" — *before* implementing.

### 2.7 🟠 Quick Capture is reachable while logged out · Effort: S

The global shortcut opens the window unconditionally ([main.js:311](../electron/main.js#L311)), and `/quick-capture` is the one non-auth route **not** wrapped in `PrivateRoute` ([App.tsx:232](../src/App.tsx#L232)).

With no session, [quickCapture.tsx:42](../src/components/quickCapture.tsx#L42) passes `accessToken!` as `null`. [journal.js:26](../electron/methods/journal.js#L26) then evaluates `getUserIdFromToken(token).id` against a `null` return and throws — caught by the surrounding `try`, surfacing only *"Failed to save entry."* The user loses a whole entry to a generic toast.

**Fix** — either gate the window on an active session before opening it, or handle the null case explicitly and preserve the draft so nothing is lost.

### 2.8 🟠 No session lifetime at all · Effort: M

The token sits in `localStorage` indefinitely and, per §2.1, its expiry is never checked. Anyone who opens the laptop is already inside the journal.

**Fix** — under Option A, add an idle timeout and/or lock-on-launch. This is what the biometric toggle in §2.5 was evidently reaching for.

### 2.9 🟡 Dead auth surface · Effort: S

Carried over from the removal assessment, since it is all auth code:

- Forgot password is **linked from the login screen** ([login.tsx:142](../src/pages/auth/login.tsx#L142)) and posts to a server that does not exist.
- Google login is broken twice over — no `GOOGLE_CLIENT_ID` in the main process, and a callback to a dead host.
- The `mode === 'online'` arms of `handleLogin` and `handleRegister` ([auth.js:37](../electron/methods/auth.js#L37), [:73](../electron/methods/auth.js#L73)) are unreachable.

Full detail in [ONLINE_MODE_REMOVAL.md](ONLINE_MODE_REMOVAL.md).

---

## 3. What is already good

Worth preserving through any refactor:

- **Registration validation is the strongest part of the flow.** zxcvbn with a `score >= 3` gate ([register.tsx:254](../src/pages/auth/register.tsx#L254)), username format and length rules ([:231](../src/pages/auth/register.tsx#L231)), and a real email pattern check ([:250](../src/pages/auth/register.tsx#L250)).
- **Password hashing is correct** — `bcrypt` at cost 10 on both create and change ([db/auth.js:25](../electron/db/auth.js#L25), [db/user.js:82](../electron/db/user.js#L82)).
- **User creation is transactional** — the `users` insert and its `user_settings` row are wrapped in a `db.transaction` ([db/auth.js:33](../electron/db/auth.js#L33)), so a failure cannot leave a user without settings.
- **`PRAGMA foreign_keys = ON`** ([connection.js:15](../electron/db/connection.js#L15)) means `deleteUser` genuinely cascades to journal entries rather than orphaning them.
- **Sensitive actions re-verify the password.** Both `userChangePassword` and `userDeleteAccount` run `bcrypt.compare` against the current password before acting ([user.js:86](../electron/methods/user.js#L86), [:106](../electron/methods/user.js#L106)).

Login-attempt rate limiting is absent, but deliberately not flagged: against an attacker with local file access it buys nothing.

---

## 4. Suggested sequencing

1. **§2.2, §2.3, §2.4** — small, self-contained, no design decision required. §2.4 is the one users would realistically hit today.
2. **§2.7** — prevents silent data loss from Quick Capture.
3. **§2.9** — delete the dead surface, especially the forgot-password link.
4. **Decide Option A or Option B** (§1).
5. **§2.1, §2.5, §2.6, §2.8** — implement together, according to that decision. Fixing any one of them in isolation either breaks sessions (§2.1) or leaves the guarantee hollow (§2.5, §2.6).
