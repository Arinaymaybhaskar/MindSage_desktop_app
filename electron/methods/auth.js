import fs from "node:fs";
import Store from "electron-store";
import { ipcMain } from "electron";
import localDB from "../db/index.js";
import { getThumbnailBase64, writeProfileImage } from "./media.js";
import bcrypt from "bcryptjs";
import {
  currentUserId,
  restoreRememberedSession,
  signIn,
  signOut,
} from "../session.js";
import { log } from "../log.js";

// The session lives in the main process (session.js). Login no longer issues
// a token: there is no server to present one to, and the old one was never
// verified anyway.

const toUserInfo = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  full_name: user.full_name || null,
  created_at: user.created_at,
  profile_picture: user.profile_picture || null,
});

export const handleLogin = async (event, credentials) => {
  const { identifier, password, rememberMe = false } = credentials;
  try {
    const user = localDB.findUserByIdentifier(identifier);
    if (!user) throw new Error("User not found");

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) throw new Error("Incorrect password");

    signIn(user, { remember: !!rememberMe });
    markLegacySessionChecked();
    return { userInfo: toUserInfo(user) };
  } catch (error) {
    log.error("Offline login error:", error);
    throw error;
  }
};

/** Who is signed in, restoring a remembered session on first ask. */
export const handleGetSession = async () => {
  const session = restoreRememberedSession(localDB.findUserById);
  if (!session) return { userInfo: null };
  try {
    const user = localDB.findUserById(session.id);
    return { userInfo: user ? toUserInfo(user) : null };
  } catch {
    return { userInfo: null };
  }
};

/**
 * The accounts to offer on the profile picker, each with a small avatar
 * already encoded, so the picker needs no other handler to draw itself.
 */
export const handleListProfiles = async () => {
  let rows = [];
  try {
    rows = localDB.listProfiles();
  } catch {
    // The schema may not exist yet on a first launch.
    return [];
  }
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      username: row.username,
      full_name: row.full_name || null,
      avatar: row.profile_picture
        ? await getThumbnailBase64(row.profile_picture, 192).catch(() => null)
        : null,
    })),
  );
};

export const handleLogout = async () => {
  signOut();
  return { ok: true };
};

// Installs from before the session moved here kept a JWT in the renderer's
// localStorage and stayed signed in indefinitely. Dropping that on upgrade
// would sign everyone out once, and with no password reset a user who had
// forgotten their password would lose access to their journal. So the first
// launch after upgrading may hand the old token over once, and it is honoured
// exactly as far as the old code honoured it: decoded, not verified. After
// that one chance the door is shut for good.
const migration = new Store({
  name: "session-migration",
  defaults: { legacyTokenChecked: false },
});

export const handleAdoptLegacySession = async (event, token) => {
  if (migration.get("legacyTokenChecked") || currentUserId() != null) {
    return { userInfo: null };
  }
  migration.set("legacyTokenChecked", true);
  try {
    const payload = JSON.parse(
      Buffer.from(String(token).split(".")[1], "base64url").toString("utf8"),
    );
    const user = payload?.id != null && localDB.findUserById(payload.id);
    if (!user) return { userInfo: null };
    signIn(user, { remember: true });
    return { userInfo: toUserInfo(user) };
  } catch {
    return { userInfo: null };
  }
};

/** Closes the one-time door once a fresh install signs in normally. */
export function markLegacySessionChecked() {
  migration.set("legacyTokenChecked", true);
}

/**
 * Creates a profile from a profile name (the username column), a password and
 * an optional photo. No email and no full name: sign-up asks for neither.
 */
export const handleRegister = async (event, details) => {
  let picture = null;
  try {
    const username =
      typeof details?.username === "string" ? details.username.trim() : "";
    if (!/^\w{3,}$/.test(username)) {
      throw new Error(
        "Profile name must be 3 or more letters, numbers or underscores",
      );
    }
    if (typeof details.password !== "string" || !details.password) {
      throw new Error("A password is required");
    }
    if (localDB.findUserForCheck(null, username)) {
      throw new Error("Profile name already exists");
    }
    if (details.photo?.arrayBuffer) {
      picture = writeProfileImage(
        details.photo.arrayBuffer,
        details.photo.filename || "photo",
      );
    }
    const newUser = localDB.createUser({
      username,
      password: details.password,
      timezone: details.timezone,
      profile_picture: picture,
    });
    return { user: newUser };
  } catch (error) {
    // A photo saved for a profile that was never made would linger on disk.
    if (picture) fs.rmSync(picture, { force: true });
    log.error("Offline registration error:", error);
    throw error;
  }
};

/**
 * Reports whether a username is still free in the local database.
 *
 * Registration re-checks this before inserting; this exists so the form can
 * tell the user while they type rather than after they submit.
 */
export const handleCheckUsername = async (event, username) => {
  const name = typeof username === "string" ? username.trim() : "";
  if (!name) {
    return { available: false };
  }
  // findUserForCheck matches email OR username. Passing the name as both
  // would also reject it when it happens to equal someone's email, so the
  // email side is passed a value no address can equal.
  const existing = localDB.findUserForCheck(null, name);
  return { available: !existing };
};

/**
 * Registered with the setup IPC, ahead of the database and Qdrant, because
 * the renderer asks who is signed in as soon as it mounts. The handlers read
 * the database lazily and treat a missing schema as "nobody".
 */
export function registerSessionIPC() {
  ipcMain.handle("auth:get-session", handleGetSession);
  ipcMain.handle("auth:list-profiles", handleListProfiles);
  ipcMain.handle("auth:logout", handleLogout);
  ipcMain.handle("auth:adopt-legacy-session", handleAdoptLegacySession);
}
