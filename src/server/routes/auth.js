import express from "express";
import bcrypt from 'bcryptjs';
import jwt from "jsonwebtoken";
import pool from "../db.js";
import { OAuth2Client } from "google-auth-library";
import crypto from "crypto";
import { transporter } from "../config/mailer.js";
import fs from "fs";

const router = express.Router();

const offlineAccessTokenSecret = "be1e968105e3d8c510625e7ae117d3b376913c6359b5063bc5ff07f1cc43cfa3229405930cdeb7bcc9e9ebf3199c0b85b1a0c2396018eee4985f2d1a0abf6002";
const offlineRefreshTokenSecret = "835261b0476f6ab27b89e3f5584dab137ae30e8d73bc98b72b304373076e7c34c68cc2d92733b32bef0459582a389bc72f5f32f432f06cc87e90101bcbe47b9e";

// --- Helper function to generate Access Token ---
const generateAccessToken = (user) => {
  return jwt.sign(user, offlineAccessTokenSecret, { expiresIn: '15m' });
};

const client = new OAuth2Client(process.env.O_AUTH_CLIENT_ID);

// --- User Registration ---
router.post("/register", async (req, res) => {
  const { username, email, password, timezone, full_name, authMode } = req.body;

  try {
    // Check if username or email already exists
    const checkUser = await pool.query(
      "SELECT * FROM users WHERE username = $1 OR email = $2",
      [username, email]
    );

    if (checkUser.rows.length > 0) {
      return res.status(409).json({ message: "Username or email already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user with timezone and full_name
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, timezone, full_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username`,
      [username, email, hashedPassword, timezone || 'Asia/Kolkata', full_name || null]
    );
    const userId = result.rows[0].id;

    // Create default user settings
    await pool.query(
      `INSERT INTO user_settings (user_id) VALUES ($1)`,
      [userId]
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: "Username or email already exists" });
    }
    console.error("Registration error:", err);
    res.status(500).send("Server error");
  }
});

// --- Check if Username is Unique ---
router.post("/check-username", async (req, res) => {
  const { username } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length > 0) {
      return res.status(409).json({ message: "Username already exists" });
    }

    res.status(200).json({ message: "Username is available" });
  } catch (err) {
    console.error("Check username error:", err);
    res.status(500).send("Server error");
  }
});

// --- User Login ---
router.post("/login", async (req, res) => {
  const { identifier, password, timezone, rememberMe, authMode } = req.body;

  if (!identifier || !password) return res.status(400).json({ error: "Identifier and password are mandatory" });

  let query;
  if (identifier.includes("@")) {
    query = "SELECT * FROM users WHERE email = $1";
  } else {
    query = "SELECT * FROM users WHERE username = $1";
  }

  try {
    const result = await pool.query(query, [identifier]);
    const user = result.rows[0];
    if (!user) return res.status(404).send("User not found");

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(403).send("Incorrect password");

    const accessToken = generateAccessToken({
      id: user.id,
      username: user.username,
    });

    // Set refresh token expiration based on rememberMe
    const refreshTokenExpiry = rememberMe ? "30d" : "1d";
    const refreshTokenMaxAge = rememberMe
      ? 30 * 24 * 60 * 60 * 1000 // 30 days
      : 1 * 24 * 60 * 60 * 1000; // 1 day

    const refreshToken = jwt.sign(
      { id: user.id },
      offlineRefreshTokenSecret,
      { expiresIn: refreshTokenExpiry }
    );

    if (timezone) {
      await pool.query(
        `UPDATE users SET timezone = $1 WHERE id = $2`,
        [timezone, user.id]
      );
    }

    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)",
      [user.id, refreshToken]
    );

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
      sameSite: "Strict",
      maxAge: refreshTokenMaxAge,
      path: "/api/auth/refresh-token",
    });

    const userInfo = { created_at: user.created_at, email: user.email, id: user.id, full_name: user.full_name, username: user.username, timezone: user.timezone };
    res.json({ accessToken, userInfo });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Server error");
  }
});

// --- Refresh Access Token ---
router.post("/token", async (req, res) => {
  const refreshToken = req.body.token;
  if (!refreshToken) return res.sendStatus(401);

  try {
    const result = await pool.query("SELECT * FROM refresh_tokens WHERE token = $1 AND is_revoked = FALSE", [refreshToken]);
    if (result.rows.length === 0) return res.sendStatus(403);

    jwt.verify(refreshToken, offlineRefreshTokenSecret, (err, user) => {
      if (err) return res.sendStatus(403);
      // The user object from the JWT payload might contain 'id' or 'userId'
      const userId = user.id || user.userId;
      if (!userId) return res.sendStatus(403);
      const accessToken = generateAccessToken({ id: userId });
      res.json({ accessToken });
    });
  } catch (err) {
    console.error("Token refresh error:", err);
    res.sendStatus(500);
  }
});

// --- Logout ---
router.delete("/logout", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ message: "Refresh token is required" });
  try {
    await pool.query("UPDATE refresh_tokens SET is_revoked = TRUE WHERE token = $1", [token]);
    res.clearCookie("refreshToken", { path: "/api/auth/refresh-token" });
    res.sendStatus(204);
  } catch (err) {
    console.error("Logout error:", err);
    res.sendStatus(500);
  }
});

// --- Google Login ---
router.post("/google-login", async (req, res) => {
  const { profile } = req.body.response;

  if (!profile) {
    return res.status(400).json({ message: "Missing profile" });
  }

  try {
    const { email, name, id } = profile;

    const existingUserQuery = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    let user;
    if (existingUserQuery.rows.length === 0) {
      const newUserQuery = await pool.query(
        "INSERT INTO users (username, email, password_hash, full_name) VALUES ($1, $2, $3, $4) RETURNING *",
        [name || `user${Date.now()}`, email, id, name] // Using googleId as dummy password hash
      );
      user = newUserQuery.rows[0];
    } else {
      user = existingUserQuery.rows[0];
    }

    const accessToken = generateAccessToken({ id: user.id, username: user.username });
    const refreshToken = jwt.sign({ id: user.id }, offlineRefreshTokenSecret, { expiresIn: "7d" });

    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)",
      [user.id, refreshToken]
    );

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/api/auth/refresh-token",
    });

    const userInfo = { created_at: user.created_at, email: user.email, id: user.id, full_name: user.full_name, username: user.username, timezone: user.timezone };
    res.json({ accessToken, userInfo });

  } catch (err) {
    console.error("Google login error:", err);
    res.status(401).json({ message: "Invalid Google credential" });
  }
});

// --- Forgot Password ---
router.post("/forgot-password", async (req, res) => {
  const { identifier } = req.body;

  if (!identifier) {
    return res.status(400).json({ message: "Identifier is required" });
  }

  let query;
  if (identifier.includes("@")) {
    query = "SELECT id, email, full_name FROM users WHERE email = $1";
  } else {
    query = "SELECT id, email, full_name FROM users WHERE username = $1";
  }

  try {
    const result = await pool.query(query, [identifier]);

    if (result.rows.length === 0) {
      // To prevent user enumeration, we can send a generic success message even if the user doesn't exist.
      // However, for debugging/simplicity, we'll return a 404 for now.
      return res.status(404).json({ message: "User not found" });
    }

    const user = result.rows[0];
    const otp = crypto.randomInt(100000, 999999);
    const hashedOtp = crypto.createHash("sha256").update(String(otp)).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    await pool.query(
      `UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3`,
      [hashedOtp, expiresAt, user.id]
    );

    const htmlTemplate = fs.readFileSync("models/mailModel.html", "utf-8");
    const html = htmlTemplate
      .replace("{{OTP}}", otp)
      .replace("{{FULL_NAME}}", user.full_name || "User");

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Your Password Reset OTP",
      html,
    };

    await transporter.sendMail(mailOptions);

    const maskedEmail = user.email.replace(/(.{2}).+(@.+)/, "$1****$2");
    res.json({ message: `OTP sent to ${maskedEmail}` });

  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).send("Server error");
  }
});

// --- Verify OTP and Login ---
router.post("/verify-otp", async (req, res) => {
  const { identifier, otp } = req.body;

  if (!identifier || !otp) {
    return res.status(400).json({ message: "Identifier and OTP are required." });
  }

  try {
    // Look up the full user object
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 OR username = $1",
      [identifier]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = result.rows[0];

    if (!user.reset_token || !user.reset_token_expiry) {
      return res.status(400).json({ message: "No OTP has been requested for this user." });
    }

    const isExpired = new Date(user.reset_token_expiry) < new Date();
    if (isExpired) {
      return res.status(400).json({ message: "OTP expired." });
    }

    const hashedOtp = crypto.createHash("sha256").update(String(otp)).digest("hex");
    if (hashedOtp !== user.reset_token) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

    // --- OTP is valid, now log the user in ---

    // 1. Invalidate the reset token
    await pool.query(
      "UPDATE users SET reset_token = NULL, reset_token_expiry = NULL WHERE id = $1",
      [user.id]
    );

    // 2. Generate JWT tokens
    const accessToken = generateAccessToken({
      id: user.id,
      username: user.username,
    });

    // Using a standard 7-day refresh token for password reset login
    const refreshToken = jwt.sign(
      { id: user.id },
      offlineRefreshTokenSecret,
      { expiresIn: "7d" }
    );

    // 3. Store the refresh token
    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)",
      [user.id, refreshToken]
    );

    // 4. Set the refresh token as a cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/api/auth/refresh-token",
    });

    // 5. Send the access token and user info back to the client
    const userInfo = { created_at: user.created_at, email: user.email, id: user.id, full_name: user.full_name, username: user.username, timezone: user.timezone };
    res.json({ message: "OTP verified successfully. Logged in.", accessToken, userInfo });

  } catch (err) {
    console.error("OTP verification error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});


export default router;
