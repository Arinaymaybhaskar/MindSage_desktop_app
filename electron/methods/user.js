import localDB from "../db/index.js";
import bcrypt from "bcryptjs";
import { currentUserId, signOut } from "../session.js";
import { createAttemptLimiter } from "../attemptLimiter.js";
import { deleteProfileEverything, describeProfile } from "./profileDelete.js";

// Wrong passwords on the delete screen are counted; after five the screen is
// locked for a minute.
const deleteAttempts = createAttemptLimiter({ maxAttempts: 5, lockMs: 60_000 });

export const userGetMe = async (event) => {
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");
  return localDB.getUserById(userId);
};

export const userUpdateProfile = async (event, payload) => {
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");
  const user = localDB.updateUserProfile(userId, payload);
  return { user };
};

export const userGetSettings = async (event) => {
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");
  return localDB.getUserSettings(userId);
};

export const userUpdateSettings = async (event, payload) => {
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");
  localDB.updateUserSettings(userId, payload);
  return localDB.getUserSettings(userId);
};

export const userChangePassword = async (event, payload) => {
  const { old_password, new_password } = payload;
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");
  const user = localDB.findUserById(userId);
  if (!user) throw new Error("User not found");
  const match = await bcrypt.compare(old_password, user.password_hash);
  if (!match) throw new Error("Incorrect current password");
  localDB.changePassword(userId, new_password);
  return { message: "Password updated successfully" };
};

export const userDeleteSummary = async () => {
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");
  return describeProfile(userId);
};

export const userDeleteAccount = async (event, payload) => {
  const { password } = payload ?? {};
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");
  const key = String(userId);

  const locked = deleteAttempts.lockedFor(key);
  if (locked) {
    throw new Error(
      `Too many wrong passwords. Try again in ${locked} seconds.`,
    );
  }
  const user = localDB.findUserById(userId);
  if (!user) throw new Error("User not found");
  const match =
    typeof password === "string" &&
    (await bcrypt.compare(password, user.password_hash));
  if (!match) {
    const left = deleteAttempts.fail(key);
    throw new Error(
      left > 0
        ? `Incorrect password. ${left} ${left === 1 ? "attempt" : "attempts"} left.`
        : "Too many wrong passwords. Try again in a minute.",
    );
  }
  deleteAttempts.succeed(key);

  const result = await deleteProfileEverything(userId);
  signOut();
  return { message: "Profile deleted", ...result };
};
