import localDB from "../db/index.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

function getUserIdFromToken(token) {
  try {
    // 1. Guard against null or undefined tokens
    if (!token) {
      return null;
    }
    const decoded = jwt.decode(token);
    return decoded;
  } catch (e) {
    console.error("Error decoding token:", e);
    return null;
  }
}

export const userGetMe = async (event, token) => {
  const userId = getUserIdFromToken(token).id;
  if (!userId) throw new Error("Invalid token for offline mode");
  return localDB.getUserById(userId);
};

export const userUpdateProfile = async (event, token, payload) => {
  const userId = getUserIdFromToken(token).id;
  if (!userId) throw new Error("Invalid token");
  const user = localDB.updateUserProfile(userId, payload);
  return { user };
};

export const userGetSettings = async (event, token) => {
  const userId = getUserIdFromToken(token).id;
  if (!userId) throw new Error("Invalid token");
  return localDB.getUserSettings(userId);
};

export const userUpdateSettings = async (event, token, payload) => {
  const userId = getUserIdFromToken(token).id;
  if (!userId) throw new Error("Invalid token");
  localDB.updateUserSettings(userId, payload);
  return localDB.getUserSettings(userId);
};

export const userChangePassword = async (event, token, payload) => {
  const { old_password, new_password } = payload;
  const userToken = getUserIdFromToken(token);
  if (!userToken) throw new Error("Invalid token");
  const user = localDB.findUserByIdentifier(userToken.username); // Assuming findUser can take ID
  if (!user) throw new Error("User not found");
  const match = await bcrypt.compare(old_password, user.password_hash);
  if (!match) throw new Error("Incorrect current password");
  localDB.changePassword(userToken.id, new_password);
  return { message: "Password updated successfully" };
};

export const userDeleteAccount = async (event, token, payload) => {
  const { password } = payload;
  const userToken = getUserIdFromToken(token);
  if (!userToken) throw new Error("Invalid token");
  const user = localDB.findUserByIdentifier(userToken.username);
  if (!user) throw new Error("User not found");
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) throw new Error("Incorrect password");
  localDB.deleteUser(userToken.id);
  return { message: "User account deleted successfully" };
};
