import localDB from "../db/index.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import axios from "axios";
import { getOfflineAccessTokenSecret } from "../services/tokenSecret.js";

// Generated per install and persisted outside the bundle. See
// services/tokenSecret.js for why this is uniqueness, not confidentiality.

function describeApiConnectionError(error, fallbackMessage) {
  const code = error?.code || error?.cause?.code;
  const isNetworkCode = [
    "ENOTFOUND",
    "EAI_AGAIN",
    "ECONNREFUSED",
    "ECONNRESET",
    "ECONNABORTED",
    "ETIMEDOUT",
  ].includes(code);

  if (isNetworkCode || (!error?.response && !error?.request)) {
    const apiCode = code || "UNREACHABLE";
    return `Can't reach the API server; check your internet or DNS (${apiCode})`;
  }

  if (error?.response?.data?.message) {
    return error.response.data.message;
  }

  if (error?.message) {
    return error.message;
  }

  return fallbackMessage;
}

const generateAccessToken = (user) => {
  return jwt.sign(user, getOfflineAccessTokenSecret(), { expiresIn: "15m" });
};

export const handleLogin = async (event, mode, credentials) => {
  const { identifier, password } = credentials;
  if (mode === "online") {
    try {
      // Call your local backend server
      const response = await axios.post(
        "http://localhost:4000/api/auth/login",
        credentials,
      );
      return response.data;
    } catch (error) {
      console.error(
        "Online login error:",
        error.response?.data || error.message,
      );
      throw new Error(describeApiConnectionError(error, "Online login failed"));
    }
  } else {
    // Offline Mode
    try {
      const user = localDB.findUserByIdentifier(identifier);
      if (!user) throw new Error("User not found");

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) throw new Error("Incorrect password");

      const accessToken = generateAccessToken({
        id: user.id,
        username: user.username,
      });
      // --- FIX: Ensure full_name is never undefined ---
      const userInfo = {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name || null, // Fallback to null if undefined
        created_at: user.created_at,
        profile_picture: user.profile_picture || null,
      };
      return { accessToken, userInfo };
    } catch (error) {
      console.error("Offline login error:", error);
      throw error;
    }
  }
};

export const handleRegister = async (event, mode, details) => {
  if (mode === "online") {
    try {
      // Call your local backend server started with startServer()
      const response = await axios.post(
        "http://localhost:4000/api/auth/register",
        details,
      );
      return response.data;
    } catch (error) {
      console.error(
        "Online registration error:",
        error.response?.data || error.message,
      );
      throw new Error(
        describeApiConnectionError(error, "Online registration failed"),
      );
    }
  } else {
    // Offline Mode
    try {
      const existingUser = localDB.findUserForCheck(
        details.email,
        details.username,
      );
      if (existingUser) {
        throw new Error("Username or email already exists");
      }
      const newUser = localDB.createUser(details);
      return { user: newUser };
    } catch (error) {
      console.error("Offline registration error:", error);
      throw error;
    }
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
