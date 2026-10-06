import localDB from "../db/index.js";
import bcrypt from "bcryptjs";
import { currentUserId, signOut } from "../session.js";

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

export const userDeleteAccount = async (event, payload) => {
  const { password } = payload;
  const userId = currentUserId();
  if (!userId) throw new Error("Not signed in");
  const user = localDB.findUserById(userId);
  if (!user) throw new Error("User not found");
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) throw new Error("Incorrect password");
  localDB.deleteUser(userId);
  signOut();
  return { message: "User account deleted successfully" };
};
