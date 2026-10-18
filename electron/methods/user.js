import localDB from "../db/index.js";
import bcrypt from "bcryptjs";
import { currentUserId, signOut } from "../session.js";
import { createAttemptLimiter } from "../attemptLimiter.js";
import { deleteProfileEverything, describeProfile } from "./profileDelete.js";

// Wrong passwords on the delete screen and the change-password form share one
// count; after five the profile is locked for a minute. Checks for one profile
// run one at a time, so parallel calls cannot all pass before the first
// failure is recorded.
const deleteAttempts = createAttemptLimiter({ maxAttempts: 5, lockMs: 60_000 });
const queue = new Map(); // key -> tail of that profile's password checks

function serialized(key, task) {
  const run = (queue.get(key) ?? Promise.resolve()).then(task, task);
  const tail = run.catch(() => {});
  queue.set(key, tail);
  tail.then(() => {
    if (queue.get(key) === tail) queue.delete(key);
  });
  return run;
}

/** Throws unless `password` is the user's; counts and locks wrong ones. */
async function checkPassword(userId, password) {
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
}

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
  await serialized(String(userId), async () => {
    try {
      await checkPassword(userId, old_password);
    } catch (err) {
      throw err.message.startsWith("Incorrect password")
        ? new Error(
            err.message.replace(
              "Incorrect password",
              "Incorrect current password",
            ),
          )
        : err;
    }
    localDB.changePassword(userId, new_password);
  });
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

  return serialized(String(userId), async () => {
    await checkPassword(userId, password);
    // Sign out the moment the rows are gone, before the slower index cleanup,
    // so nothing can write for a user that no longer exists.
    const result = await deleteProfileEverything(userId, {
      afterRows: signOut,
    });
    return { message: "Profile deleted", ...result };
  });
};
