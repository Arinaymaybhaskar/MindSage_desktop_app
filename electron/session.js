// session.js
//
// Who is signed in, held by the main process. The renderer used to carry a
// JWT and pass it back on every IPC call, which put the trust relationship
// backwards: the renderer is the less trusted side, and the token was never
// verified, so any `{"id": N}` payload was accepted as user N
// (docs/AUTH_REVIEW.md §2.1). Now handlers ask this module, and the renderer
// holds no credential at all.
//
// What the password is for: picking whose journal this is and keeping people
// out of the app's screens. It does not encrypt anything on disk
// (MASTER_TODO 15, option B; encryption is a later, separate feature).
//
// "Remember me" persists the user id in an electron-store file next to the
// other app settings, so the next launch opens signed in. Without it, a launch
// starts at the sign-in screen.

import Store from "electron-store";
import { BrowserWindow } from "electron";

const store = new Store({
  name: "session",
  defaults: { rememberedUserId: null },
});

let current = null; // { id: number, username: string } | null

/** Tells every window, so the main window and Quick Capture agree. */
function broadcast() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("auth:changed");
  }
}

export function signIn(user, { remember = false } = {}) {
  current = { id: user.id, username: user.username };
  store.set("rememberedUserId", remember ? user.id : null);
  broadcast();
}

export function signOut() {
  current = null;
  store.set("rememberedUserId", null);
  broadcast();
}

/**
 * The signed-in user's id. Throws when nobody is, so a handler can never fall
 * through to running a query for user `undefined`.
 */
export function requireUserId() {
  if (!current) throw new Error("Not signed in");
  return current.id;
}

export function currentUserId() {
  return current?.id ?? null;
}

/**
 * Restores a remembered session on first use after launch. `findUser` is
 * injected so this module stays free of the database import, which opens a
 * connection at module scope.
 */
export function restoreRememberedSession(findUser) {
  if (current) return current;
  const id = store.get("rememberedUserId");
  if (id == null) return null;
  let user = null;
  try {
    user = findUser(id);
  } catch {
    // The schema may not exist yet on a first launch.
    return null;
  }
  if (!user) {
    store.set("rememberedUserId", null);
    return null;
  }
  current = { id: user.id, username: user.username };
  return current;
}
