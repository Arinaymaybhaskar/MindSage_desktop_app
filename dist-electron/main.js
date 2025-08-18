import { shell as shell$1, app as app$1, ipcMain, BrowserWindow } from "electron";
import path$1 from "node:path";
import { fileURLToPath as fileURLToPath$1 } from "node:url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path, { dirname } from "path";
import url, { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import { OAuth2Client } from "google-auth-library";
import crypto from "crypto";
import nodemailer from "nodemailer";
import fs from "fs";
import Sentiment from "sentiment";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import axios from "axios";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import Database from "better-sqlite3";
import fs$1 from "node:fs";
import http from "http";
import { execSync } from "child_process";
dotenv.config();
const pool = new Pool({
  host: process.env.MINDSAGE_DB_URL || process.env.DATABASE_URL || "localhost",
  port: 5432,
  user: process.env.MINDSAGE_DB_USERNAME || "postgres",
  password: process.env.MINDSAGE_DB_PASSWORD || "password",
  database: process.env.MINDSAGE_DB_DATABASE || "mindsage",
  ssl: {
    rejectUnauthorized: false
  }
});
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});
const router$8 = express.Router();
const generateAccessToken$1 = (user2) => {
  return jwt.sign(user2, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "15m" });
};
new OAuth2Client(process.env.O_AUTH_CLIENT_ID);
router$8.post("/register", async (req, res) => {
  const { username, email, password, timezone, full_name, authMode } = req.body;
  try {
    const checkUser = await pool.query(
      "SELECT * FROM users WHERE username = $1 OR email = $2",
      [username, email]
    );
    if (checkUser.rows.length > 0) {
      return res.status(409).json({ message: "Username or email already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, timezone, full_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username`,
      [username, email, hashedPassword, timezone || "Asia/Kolkata", full_name || null]
    );
    const userId = result.rows[0].id;
    await pool.query(
      `INSERT INTO user_settings (user_id) VALUES ($1)`,
      [userId]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "Username or email already exists" });
    }
    console.error("Registration error:", err);
    res.status(500).send("Server error");
  }
});
router$8.post("/check-username", async (req, res) => {
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
router$8.post("/login", async (req, res) => {
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
    const user2 = result.rows[0];
    if (!user2) return res.status(404).send("User not found");
    const match = await bcrypt.compare(password, user2.password_hash);
    if (!match) return res.status(403).send("Incorrect password");
    const accessToken = generateAccessToken$1({
      id: user2.id,
      username: user2.username
    });
    const refreshTokenExpiry = rememberMe ? "30d" : "1d";
    const refreshTokenMaxAge = rememberMe ? 30 * 24 * 60 * 60 * 1e3 : 1 * 24 * 60 * 60 * 1e3;
    const refreshToken = jwt.sign(
      { id: user2.id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: refreshTokenExpiry }
    );
    if (timezone) {
      await pool.query(
        `UPDATE users SET timezone = $1 WHERE id = $2`,
        [timezone, user2.id]
      );
    }
    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)",
      [user2.id, refreshToken]
    );
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      // Use secure cookies in production
      sameSite: "Strict",
      maxAge: refreshTokenMaxAge,
      path: "/api/auth/refresh-token"
    });
    const userInfo = { created_at: user2.created_at, email: user2.email, id: user2.id, full_name: user2.full_name, username: user2.username, timezone: user2.timezone };
    res.json({ accessToken, userInfo });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Server error");
  }
});
router$8.post("/token", async (req, res) => {
  const refreshToken = req.body.token;
  if (!refreshToken) return res.sendStatus(401);
  try {
    const result = await pool.query("SELECT * FROM refresh_tokens WHERE token = $1 AND is_revoked = FALSE", [refreshToken]);
    if (result.rows.length === 0) return res.sendStatus(403);
    jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, user2) => {
      if (err) return res.sendStatus(403);
      const userId = user2.id || user2.userId;
      if (!userId) return res.sendStatus(403);
      const accessToken = generateAccessToken$1({ id: userId });
      res.json({ accessToken });
    });
  } catch (err) {
    console.error("Token refresh error:", err);
    res.sendStatus(500);
  }
});
router$8.delete("/logout", async (req, res) => {
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
router$8.post("/google-login", async (req, res) => {
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
    let user2;
    if (existingUserQuery.rows.length === 0) {
      const newUserQuery = await pool.query(
        "INSERT INTO users (username, email, password_hash, full_name) VALUES ($1, $2, $3, $4) RETURNING *",
        [name || `user${Date.now()}`, email, id, name]
        // Using googleId as dummy password hash
      );
      user2 = newUserQuery.rows[0];
    } else {
      user2 = existingUserQuery.rows[0];
    }
    const accessToken = generateAccessToken$1({ id: user2.id, username: user2.username });
    const refreshToken = jwt.sign({ id: user2.id }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "7d" });
    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)",
      [user2.id, refreshToken]
    );
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1e3,
      // 7 days
      path: "/api/auth/refresh-token"
    });
    const userInfo = { created_at: user2.created_at, email: user2.email, id: user2.id, full_name: user2.full_name, username: user2.username, timezone: user2.timezone };
    res.json({ accessToken, userInfo });
  } catch (err) {
    console.error("Google login error:", err);
    res.status(401).json({ message: "Invalid Google credential" });
  }
});
router$8.post("/forgot-password", async (req, res) => {
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
      return res.status(404).json({ message: "User not found" });
    }
    const user2 = result.rows[0];
    const otp = crypto.randomInt(1e5, 999999);
    const hashedOtp = crypto.createHash("sha256").update(String(otp)).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1e3);
    await pool.query(
      `UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3`,
      [hashedOtp, expiresAt, user2.id]
    );
    const htmlTemplate = fs.readFileSync("models/mailModel.html", "utf-8");
    const html = htmlTemplate.replace("{{OTP}}", otp).replace("{{FULL_NAME}}", user2.full_name || "User");
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user2.email,
      subject: "Your Password Reset OTP",
      html
    };
    await transporter.sendMail(mailOptions);
    const maskedEmail = user2.email.replace(/(.{2}).+(@.+)/, "$1****$2");
    res.json({ message: `OTP sent to ${maskedEmail}` });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).send("Server error");
  }
});
router$8.post("/verify-otp", async (req, res) => {
  const { identifier, otp } = req.body;
  if (!identifier || !otp) {
    return res.status(400).json({ message: "Identifier and OTP are required." });
  }
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 OR username = $1",
      [identifier]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }
    const user2 = result.rows[0];
    if (!user2.reset_token || !user2.reset_token_expiry) {
      return res.status(400).json({ message: "No OTP has been requested for this user." });
    }
    const isExpired = new Date(user2.reset_token_expiry) < /* @__PURE__ */ new Date();
    if (isExpired) {
      return res.status(400).json({ message: "OTP expired." });
    }
    const hashedOtp = crypto.createHash("sha256").update(String(otp)).digest("hex");
    if (hashedOtp !== user2.reset_token) {
      return res.status(400).json({ message: "Invalid OTP." });
    }
    await pool.query(
      "UPDATE users SET reset_token = NULL, reset_token_expiry = NULL WHERE id = $1",
      [user2.id]
    );
    const accessToken = generateAccessToken$1({
      id: user2.id,
      username: user2.username
    });
    const refreshToken = jwt.sign(
      { id: user2.id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" }
    );
    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)",
      [user2.id, refreshToken]
    );
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1e3,
      // 7 days
      path: "/api/auth/refresh-token"
    });
    const userInfo = { created_at: user2.created_at, email: user2.email, id: user2.id, full_name: user2.full_name, username: user2.username, timezone: user2.timezone };
    res.json({ message: "OTP verified successfully. Logged in.", accessToken, userInfo });
  } catch (err) {
    console.error("OTP verification error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token == null) return res.status(401).send("Unauthorized");
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user2) => {
    if (err) return res.status(403).send("Forbidden");
    req.user = user2;
    next();
  });
}
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var mimeTypes = {};
const require$$0 = {
  "application/1d-interleaved-parityfec": { "source": "iana" },
  "application/3gpdash-qoe-report+xml": { "source": "iana", "charset": "UTF-8", "compressible": true },
  "application/3gpp-ims+xml": { "source": "iana", "compressible": true },
  "application/3gpphal+json": { "source": "iana", "compressible": true },
  "application/3gpphalforms+json": { "source": "iana", "compressible": true },
  "application/a2l": { "source": "iana" },
  "application/ace+cbor": { "source": "iana" },
  "application/activemessage": { "source": "iana" },
  "application/activity+json": { "source": "iana", "compressible": true },
  "application/alto-costmap+json": { "source": "iana", "compressible": true },
  "application/alto-costmapfilter+json": { "source": "iana", "compressible": true },
  "application/alto-directory+json": { "source": "iana", "compressible": true },
  "application/alto-endpointcost+json": { "source": "iana", "compressible": true },
  "application/alto-endpointcostparams+json": { "source": "iana", "compressible": true },
  "application/alto-endpointprop+json": { "source": "iana", "compressible": true },
  "application/alto-endpointpropparams+json": { "source": "iana", "compressible": true },
  "application/alto-error+json": { "source": "iana", "compressible": true },
  "application/alto-networkmap+json": { "source": "iana", "compressible": true },
  "application/alto-networkmapfilter+json": { "source": "iana", "compressible": true },
  "application/alto-updatestreamcontrol+json": { "source": "iana", "compressible": true },
  "application/alto-updatestreamparams+json": { "source": "iana", "compressible": true },
  "application/aml": { "source": "iana" },
  "application/andrew-inset": { "source": "iana", "extensions": ["ez"] },
  "application/applefile": { "source": "iana" },
  "application/applixware": { "source": "apache", "extensions": ["aw"] },
  "application/at+jwt": { "source": "iana" },
  "application/atf": { "source": "iana" },
  "application/atfx": { "source": "iana" },
  "application/atom+xml": { "source": "iana", "compressible": true, "extensions": ["atom"] },
  "application/atomcat+xml": { "source": "iana", "compressible": true, "extensions": ["atomcat"] },
  "application/atomdeleted+xml": { "source": "iana", "compressible": true, "extensions": ["atomdeleted"] },
  "application/atomicmail": { "source": "iana" },
  "application/atomsvc+xml": { "source": "iana", "compressible": true, "extensions": ["atomsvc"] },
  "application/atsc-dwd+xml": { "source": "iana", "compressible": true, "extensions": ["dwd"] },
  "application/atsc-dynamic-event-message": { "source": "iana" },
  "application/atsc-held+xml": { "source": "iana", "compressible": true, "extensions": ["held"] },
  "application/atsc-rdt+json": { "source": "iana", "compressible": true },
  "application/atsc-rsat+xml": { "source": "iana", "compressible": true, "extensions": ["rsat"] },
  "application/atxml": { "source": "iana" },
  "application/auth-policy+xml": { "source": "iana", "compressible": true },
  "application/bacnet-xdd+zip": { "source": "iana", "compressible": false },
  "application/batch-smtp": { "source": "iana" },
  "application/bdoc": { "compressible": false, "extensions": ["bdoc"] },
  "application/beep+xml": { "source": "iana", "charset": "UTF-8", "compressible": true },
  "application/calendar+json": { "source": "iana", "compressible": true },
  "application/calendar+xml": { "source": "iana", "compressible": true, "extensions": ["xcs"] },
  "application/call-completion": { "source": "iana" },
  "application/cals-1840": { "source": "iana" },
  "application/captive+json": { "source": "iana", "compressible": true },
  "application/cbor": { "source": "iana" },
  "application/cbor-seq": { "source": "iana" },
  "application/cccex": { "source": "iana" },
  "application/ccmp+xml": { "source": "iana", "compressible": true },
  "application/ccxml+xml": { "source": "iana", "compressible": true, "extensions": ["ccxml"] },
  "application/cdfx+xml": { "source": "iana", "compressible": true, "extensions": ["cdfx"] },
  "application/cdmi-capability": { "source": "iana", "extensions": ["cdmia"] },
  "application/cdmi-container": { "source": "iana", "extensions": ["cdmic"] },
  "application/cdmi-domain": { "source": "iana", "extensions": ["cdmid"] },
  "application/cdmi-object": { "source": "iana", "extensions": ["cdmio"] },
  "application/cdmi-queue": { "source": "iana", "extensions": ["cdmiq"] },
  "application/cdni": { "source": "iana" },
  "application/cea": { "source": "iana" },
  "application/cea-2018+xml": { "source": "iana", "compressible": true },
  "application/cellml+xml": { "source": "iana", "compressible": true },
  "application/cfw": { "source": "iana" },
  "application/city+json": { "source": "iana", "compressible": true },
  "application/clr": { "source": "iana" },
  "application/clue+xml": { "source": "iana", "compressible": true },
  "application/clue_info+xml": { "source": "iana", "compressible": true },
  "application/cms": { "source": "iana" },
  "application/cnrp+xml": { "source": "iana", "compressible": true },
  "application/coap-group+json": { "source": "iana", "compressible": true },
  "application/coap-payload": { "source": "iana" },
  "application/commonground": { "source": "iana" },
  "application/conference-info+xml": { "source": "iana", "compressible": true },
  "application/cose": { "source": "iana" },
  "application/cose-key": { "source": "iana" },
  "application/cose-key-set": { "source": "iana" },
  "application/cpl+xml": { "source": "iana", "compressible": true, "extensions": ["cpl"] },
  "application/csrattrs": { "source": "iana" },
  "application/csta+xml": { "source": "iana", "compressible": true },
  "application/cstadata+xml": { "source": "iana", "compressible": true },
  "application/csvm+json": { "source": "iana", "compressible": true },
  "application/cu-seeme": { "source": "apache", "extensions": ["cu"] },
  "application/cwt": { "source": "iana" },
  "application/cybercash": { "source": "iana" },
  "application/dart": { "compressible": true },
  "application/dash+xml": { "source": "iana", "compressible": true, "extensions": ["mpd"] },
  "application/dash-patch+xml": { "source": "iana", "compressible": true, "extensions": ["mpp"] },
  "application/dashdelta": { "source": "iana" },
  "application/davmount+xml": { "source": "iana", "compressible": true, "extensions": ["davmount"] },
  "application/dca-rft": { "source": "iana" },
  "application/dcd": { "source": "iana" },
  "application/dec-dx": { "source": "iana" },
  "application/dialog-info+xml": { "source": "iana", "compressible": true },
  "application/dicom": { "source": "iana" },
  "application/dicom+json": { "source": "iana", "compressible": true },
  "application/dicom+xml": { "source": "iana", "compressible": true },
  "application/dii": { "source": "iana" },
  "application/dit": { "source": "iana" },
  "application/dns": { "source": "iana" },
  "application/dns+json": { "source": "iana", "compressible": true },
  "application/dns-message": { "source": "iana" },
  "application/docbook+xml": { "source": "apache", "compressible": true, "extensions": ["dbk"] },
  "application/dots+cbor": { "source": "iana" },
  "application/dskpp+xml": { "source": "iana", "compressible": true },
  "application/dssc+der": { "source": "iana", "extensions": ["dssc"] },
  "application/dssc+xml": { "source": "iana", "compressible": true, "extensions": ["xdssc"] },
  "application/dvcs": { "source": "iana" },
  "application/ecmascript": { "source": "iana", "compressible": true, "extensions": ["es", "ecma"] },
  "application/edi-consent": { "source": "iana" },
  "application/edi-x12": { "source": "iana", "compressible": false },
  "application/edifact": { "source": "iana", "compressible": false },
  "application/efi": { "source": "iana" },
  "application/elm+json": { "source": "iana", "charset": "UTF-8", "compressible": true },
  "application/elm+xml": { "source": "iana", "compressible": true },
  "application/emergencycalldata.cap+xml": { "source": "iana", "charset": "UTF-8", "compressible": true },
  "application/emergencycalldata.comment+xml": { "source": "iana", "compressible": true },
  "application/emergencycalldata.control+xml": { "source": "iana", "compressible": true },
  "application/emergencycalldata.deviceinfo+xml": { "source": "iana", "compressible": true },
  "application/emergencycalldata.ecall.msd": { "source": "iana" },
  "application/emergencycalldata.providerinfo+xml": { "source": "iana", "compressible": true },
  "application/emergencycalldata.serviceinfo+xml": { "source": "iana", "compressible": true },
  "application/emergencycalldata.subscriberinfo+xml": { "source": "iana", "compressible": true },
  "application/emergencycalldata.veds+xml": { "source": "iana", "compressible": true },
  "application/emma+xml": { "source": "iana", "compressible": true, "extensions": ["emma"] },
  "application/emotionml+xml": { "source": "iana", "compressible": true, "extensions": ["emotionml"] },
  "application/encaprtp": { "source": "iana" },
  "application/epp+xml": { "source": "iana", "compressible": true },
  "application/epub+zip": { "source": "iana", "compressible": false, "extensions": ["epub"] },
  "application/eshop": { "source": "iana" },
  "application/exi": { "source": "iana", "extensions": ["exi"] },
  "application/expect-ct-report+json": { "source": "iana", "compressible": true },
  "application/express": { "source": "iana", "extensions": ["exp"] },
  "application/fastinfoset": { "source": "iana" },
  "application/fastsoap": { "source": "iana" },
  "application/fdt+xml": { "source": "iana", "compressible": true, "extensions": ["fdt"] },
  "application/fhir+json": { "source": "iana", "charset": "UTF-8", "compressible": true },
  "application/fhir+xml": { "source": "iana", "charset": "UTF-8", "compressible": true },
  "application/fido.trusted-apps+json": { "compressible": true },
  "application/fits": { "source": "iana" },
  "application/flexfec": { "source": "iana" },
  "application/font-sfnt": { "source": "iana" },
  "application/font-tdpfr": { "source": "iana", "extensions": ["pfr"] },
  "application/font-woff": { "source": "iana", "compressible": false },
  "application/framework-attributes+xml": { "source": "iana", "compressible": true },
  "application/geo+json": { "source": "iana", "compressible": true, "extensions": ["geojson"] },
  "application/geo+json-seq": { "source": "iana" },
  "application/geopackage+sqlite3": { "source": "iana" },
  "application/geoxacml+xml": { "source": "iana", "compressible": true },
  "application/gltf-buffer": { "source": "iana" },
  "application/gml+xml": { "source": "iana", "compressible": true, "extensions": ["gml"] },
  "application/gpx+xml": { "source": "apache", "compressible": true, "extensions": ["gpx"] },
  "application/gxf": { "source": "apache", "extensions": ["gxf"] },
  "application/gzip": { "source": "iana", "compressible": false, "extensions": ["gz"] },
  "application/h224": { "source": "iana" },
  "application/held+xml": { "source": "iana", "compressible": true },
  "application/hjson": { "extensions": ["hjson"] },
  "application/http": { "source": "iana" },
  "application/hyperstudio": { "source": "iana", "extensions": ["stk"] },
  "application/ibe-key-request+xml": { "source": "iana", "compressible": true },
  "application/ibe-pkg-reply+xml": { "source": "iana", "compressible": true },
  "application/ibe-pp-data": { "source": "iana" },
  "application/iges": { "source": "iana" },
  "application/im-iscomposing+xml": { "source": "iana", "charset": "UTF-8", "compressible": true },
  "application/index": { "source": "iana" },
  "application/index.cmd": { "source": "iana" },
  "application/index.obj": { "source": "iana" },
  "application/index.response": { "source": "iana" },
  "application/index.vnd": { "source": "iana" },
  "application/inkml+xml": { "source": "iana", "compressible": true, "extensions": ["ink", "inkml"] },
  "application/iotp": { "source": "iana" },
  "application/ipfix": { "source": "iana", "extensions": ["ipfix"] },
  "application/ipp": { "source": "iana" },
  "application/isup": { "source": "iana" },
  "application/its+xml": { "source": "iana", "compressible": true, "extensions": ["its"] },
  "application/java-archive": { "source": "apache", "compressible": false, "extensions": ["jar", "war", "ear"] },
  "application/java-serialized-object": { "source": "apache", "compressible": false, "extensions": ["ser"] },
  "application/java-vm": { "source": "apache", "compressible": false, "extensions": ["class"] },
  "application/javascript": { "source": "iana", "charset": "UTF-8", "compressible": true, "extensions": ["js", "mjs"] },
  "application/jf2feed+json": { "source": "iana", "compressible": true },
  "application/jose": { "source": "iana" },
  "application/jose+json": { "source": "iana", "compressible": true },
  "application/jrd+json": { "source": "iana", "compressible": true },
  "application/jscalendar+json": { "source": "iana", "compressible": true },
  "application/json": { "source": "iana", "charset": "UTF-8", "compressible": true, "extensions": ["json", "map"] },
  "application/json-patch+json": { "source": "iana", "compressible": true },
  "application/json-seq": { "source": "iana" },
  "application/json5": { "extensions": ["json5"] },
  "application/jsonml+json": { "source": "apache", "compressible": true, "extensions": ["jsonml"] },
  "application/jwk+json": { "source": "iana", "compressible": true },
  "application/jwk-set+json": { "source": "iana", "compressible": true },
  "application/jwt": { "source": "iana" },
  "application/kpml-request+xml": { "source": "iana", "compressible": true },
  "application/kpml-response+xml": { "source": "iana", "compressible": true },
  "application/ld+json": { "source": "iana", "compressible": true, "extensions": ["jsonld"] },
  "application/lgr+xml": { "source": "iana", "compressible": true, "extensions": ["lgr"] },
  "application/link-format": { "source": "iana" },
  "application/load-control+xml": { "source": "iana", "compressible": true },
  "application/lost+xml": { "source": "iana", "compressible": true, "extensions": ["lostxml"] },
  "application/lostsync+xml": { "source": "iana", "compressible": true },
  "application/lpf+zip": { "source": "iana", "compressible": false },
  "application/lxf": { "source": "iana" },
  "application/mac-binhex40": { "source": "iana", "extensions": ["hqx"] },
  "application/mac-compactpro": { "source": "apache", "extensions": ["cpt"] },
  "application/macwriteii": { "source": "iana" },
  "application/mads+xml": { "source": "iana", "compressible": true, "extensions": ["mads"] },
  "application/manifest+json": { "source": "iana", "charset": "UTF-8", "compressible": true, "extensions": ["webmanifest"] },
  "application/marc": { "source": "iana", "extensions": ["mrc"] },
  "application/marcxml+xml": { "source": "iana", "compressible": true, "extensions": ["mrcx"] },
  "application/mathematica": { "source": "iana", "extensions": ["ma", "nb", "mb"] },
  "application/mathml+xml": { "source": "iana", "compressible": true, "extensions": ["mathml"] },
  "application/mathml-content+xml": { "source": "iana", "compressible": true },
  "application/mathml-presentation+xml": { "source": "iana", "compressible": true },
  "application/mbms-associated-procedure-description+xml": { "source": "iana", "compressible": true },
  "application/mbms-deregister+xml": { "source": "iana", "compressible": true },
  "application/mbms-envelope+xml": { "source": "iana", "compressible": true },
  "application/mbms-msk+xml": { "source": "iana", "compressible": true },
  "application/mbms-msk-response+xml": { "source": "iana", "compressible": true },
  "application/mbms-protection-description+xml": { "source": "iana", "compressible": true },
  "application/mbms-reception-report+xml": { "source": "iana", "compressible": true },
  "application/mbms-register+xml": { "source": "iana", "compressible": true },
  "application/mbms-register-response+xml": { "source": "iana", "compressible": true },
  "application/mbms-schedule+xml": { "source": "iana", "compressible": true },
  "application/mbms-user-service-description+xml": { "source": "iana", "compressible": true },
  "application/mbox": { "source": "iana", "extensions": ["mbox"] },
  "application/media-policy-dataset+xml": { "source": "iana", "compressible": true, "extensions": ["mpf"] },
  "application/media_control+xml": { "source": "iana", "compressible": true },
  "application/mediaservercontrol+xml": { "source": "iana", "compressible": true, "extensions": ["mscml"] },
  "application/merge-patch+json": { "source": "iana", "compressible": true },
  "application/metalink+xml": { "source": "apache", "compressible": true, "extensions": ["metalink"] },
  "application/metalink4+xml": { "source": "iana", "compressible": true, "extensions": ["meta4"] },
  "application/mets+xml": { "source": "iana", "compressible": true, "extensions": ["mets"] },
  "application/mf4": { "source": "iana" },
  "application/mikey": { "source": "iana" },
  "application/mipc": { "source": "iana" },
  "application/missing-blocks+cbor-seq": { "source": "iana" },
  "application/mmt-aei+xml": { "source": "iana", "compressible": true, "extensions": ["maei"] },
  "application/mmt-usd+xml": { "source": "iana", "compressible": true, "extensions": ["musd"] },
  "application/mods+xml": { "source": "iana", "compressible": true, "extensions": ["mods"] },
  "application/moss-keys": { "source": "iana" },
  "application/moss-signature": { "source": "iana" },
  "application/mosskey-data": { "source": "iana" },
  "application/mosskey-request": { "source": "iana" },
  "application/mp21": { "source": "iana", "extensions": ["m21", "mp21"] },
  "application/mp4": { "source": "iana", "extensions": ["mp4s", "m4p"] },
  "application/mpeg4-generic": { "source": "iana" },
  "application/mpeg4-iod": { "source": "iana" },
  "application/mpeg4-iod-xmt": { "source": "iana" },
  "application/mrb-consumer+xml": { "source": "iana", "compressible": true },
  "application/mrb-publish+xml": { "source": "iana", "compressible": true },
  "application/msc-ivr+xml": { "source": "iana", "charset": "UTF-8", "compressible": true },
  "application/msc-mixer+xml": { "source": "iana", "charset": "UTF-8", "compressible": true },
  "application/msword": { "source": "iana", "compressible": false, "extensions": ["doc", "dot"] },
  "application/mud+json": { "source": "iana", "compressible": true },
  "application/multipart-core": { "source": "iana" },
  "application/mxf": { "source": "iana", "extensions": ["mxf"] },
  "application/n-quads": { "source": "iana", "extensions": ["nq"] },
  "application/n-triples": { "source": "iana", "extensions": ["nt"] },
  "application/nasdata": { "source": "iana" },
  "application/news-checkgroups": { "source": "iana", "charset": "US-ASCII" },
  "application/news-groupinfo": { "source": "iana", "charset": "US-ASCII" },
  "application/news-transmission": { "source": "iana" },
  "application/nlsml+xml": { "source": "iana", "compressible": true },
  "application/node": { "source": "iana", "extensions": ["cjs"] },
  "application/nss": { "source": "iana" },
  "application/oauth-authz-req+jwt": { "source": "iana" },
  "application/oblivious-dns-message": { "source": "iana" },
  "application/ocsp-request": { "source": "iana" },
  "application/ocsp-response": { "source": "iana" },
  "application/octet-stream": { "source": "iana", "compressible": false, "extensions": ["bin", "dms", "lrf", "mar", "so", "dist", "distz", "pkg", "bpk", "dump", "elc", "deploy", "exe", "dll", "deb", "dmg", "iso", "img", "msi", "msp", "msm", "buffer"] },
  "application/oda": { "source": "iana", "extensions": ["oda"] },
  "application/odm+xml": { "source": "iana", "compressible": true },
  "application/odx": { "source": "iana" },
  "application/oebps-package+xml": { "source": "iana", "compressible": true, "extensions": ["opf"] },
  "application/ogg": { "source": "iana", "compressible": false, "extensions": ["ogx"] },
  "application/omdoc+xml": { "source": "apache", "compressible": true, "extensions": ["omdoc"] },
  "application/onenote": { "source": "apache", "extensions": ["onetoc", "onetoc2", "onetmp", "onepkg"] },
  "application/opc-nodeset+xml": { "source": "iana", "compressible": true },
  "application/oscore": { "source": "iana" },
  "application/oxps": { "source": "iana", "extensions": ["oxps"] },
  "application/p21": { "source": "iana" },
  "application/p21+zip": { "source": "iana", "compressible": false },
  "application/p2p-overlay+xml": { "source": "iana", "compressible": true, "extensions": ["relo"] },
  "application/parityfec": { "source": "iana" },
  "application/passport": { "source": "iana" },
  "application/patch-ops-error+xml": { "source": "iana", "compressible": true, "extensions": ["xer"] },
  "application/pdf": { "source": "iana", "compressible": false, "extensions": ["pdf"] },
  "application/pdx": { "source": "iana" },
  "application/pem-certificate-chain": { "source": "iana" },
  "application/pgp-encrypted": { "source": "iana", "compressible": false, "extensions": ["pgp"] },
  "application/pgp-keys": { "source": "iana", "extensions": ["asc"] },
  "application/pgp-signature": { "source": "iana", "extensions": ["asc", "sig"] },
  "application/pics-rules": { "source": "apache", "extensions": ["prf"] },
  "application/pidf+xml": { "source": "iana", "charset": "UTF-8", "compressible": true },
  "application/pidf-diff+xml": { "source": "iana", "charset": "UTF-8", "compressible": true },
  "application/pkcs10": { "source": "iana", "extensions": ["p10"] },
  "application/pkcs12": { "source": "iana" },
  "application/pkcs7-mime": { "source": "iana", "extensions": ["p7m", "p7c"] },
  "application/pkcs7-signature": { "source": "iana", "extensions": ["p7s"] },
  "application/pkcs8": { "source": "iana", "extensions": ["p8"] },
  "application/pkcs8-encrypted": { "source": "iana" },
  "application/pkix-attr-cert": { "source": "iana", "extensions": ["ac"] },
  "application/pkix-cert": { "source": "iana", "extensions": ["cer"] },
  "application/pkix-crl": { "source": "iana", "extensions": ["crl"] },
  "application/pkix-pkipath": { "source": "iana", "extensions": ["pkipath"] },
  "application/pkixcmp": { "source": "iana", "extensions": ["pki"] },
  "application/pls+xml": { "source": "iana", "compressible": true, "extensions": ["pls"] },
  "application/poc-settings+xml": { "source": "iana", "charset": "UTF-8", "compressible": true },
  "application/postscript": { "source": "iana", "compressible": true, "extensions": ["ai", "eps", "ps"] },
  "application/ppsp-tracker+json": { "source": "iana", "compressible": true },
  "application/problem+json": { "source": "iana", "compressible": true },
  "application/problem+xml": { "source": "iana", "compressible": true },
  "application/provenance+xml": { "source": "iana", "compressible": true, "extensions": ["provx"] },
  "application/prs.alvestrand.titrax-sheet": { "source": "iana" },
  "application/prs.cww": { "source": "iana", "extensions": ["cww"] },
  "application/prs.cyn": { "source": "iana", "charset": "7-BIT" },
  "application/prs.hpub+zip": { "source": "iana", "compressible": false },
  "application/prs.nprend": { "source": "iana" },
  "application/prs.plucker": { "source": "iana" },
  "application/prs.rdf-xml-crypt": { "source": "iana" },
  "application/prs.xsf+xml": { "source": "iana", "compressible": true },
  "application/pskc+xml": { "source": "iana", "compressible": true, "extensions": ["pskcxml"] },
  "application/pvd+json": { "source": "iana", "compressible": true },
  "application/qsig": { "source": "iana" },
  "application/raml+yaml": { "compressible": true, "extensions": ["raml"] },
  "application/raptorfec": { "source": "iana" },
  "application/rdap+json": { "source": "iana", "compressible": true },
  "application/rdf+xml": { "source": "iana", "compressible": true, "extensions": ["rdf", "owl"] },
  "application/reginfo+xml": { "source": "iana", "compressible": true, "extensions": ["rif"] },
  "application/relax-ng-compact-syntax": { "source": "iana", "extensions": ["rnc"] },
  "application/remote-printing": { "source": "iana" },
  "application/reputon+json": { "source": "iana", "compressible": true },
  "application/resource-lists+xml": { "source": "iana", "compressible": true, "extensions": ["rl"] },
  "application/resource-lists-diff+xml": { "source": "iana", "compressible": true, "extensions": ["rld"] },
  "application/rfc+xml": { "source": "iana", "compressible": true },
  "application/riscos": { "source": "iana" },
  "application/rlmi+xml": { "source": "iana", "compressible": true },
  "application/rls-services+xml": { "source": "iana", "compressible": true, "extensions": ["rs"] },
  "application/route-apd+xml": { "source": "iana", "compressible": true, "extensions": ["rapd"] },
  "application/route-s-tsid+xml": { "source": "iana", "compressible": true, "extensions": ["sls"] },
  "application/route-usd+xml": { "source": "iana", "compressible": true, "extensions": ["rusd"] },
  "application/rpki-ghostbusters": { "source": "iana", "extensions": ["gbr"] },
  "application/rpki-manifest": { "source": "iana", "extensions": ["mft"] },
  "application/rpki-publication": { "source": "iana" },
  "application/rpki-roa": { "source": "iana", "extensions": ["roa"] },
  "application/rpki-updown": { "source": "iana" },
  "application/rsd+xml": { "source": "apache", "compressible": true, "extensions": ["rsd"] },
  "application/rss+xml": { "source": "apache", "compressible": true, "extensions": ["rss"] },
  "application/rtf": { "source": "iana", "compressible": true, "extensions": ["rtf"] },
  "application/rtploopback": { "source": "iana" },
  "application/rtx": { "source": "iana" },
  "application/samlassertion+xml": { "source": "iana", "compressible": true },
  "application/samlmetadata+xml": { "source": "iana", "compressible": true },
  "application/sarif+json": { "source": "iana", "compressible": true },
  "application/sarif-external-properties+json": { "source": "iana", "compressible": true },
  "application/sbe": { "source": "iana" },
  "application/sbml+xml": { "source": "iana", "compressible": true, "extensions": ["sbml"] },
  "application/scaip+xml": { "source": "iana", "compressible": true },
  "application/scim+json": { "source": "iana", "compressible": true },
  "application/scvp-cv-request": { "source": "iana", "extensions": ["scq"] },
  "application/scvp-cv-response": { "source": "iana", "extensions": ["scs"] },
  "application/scvp-vp-request": { "source": "iana", "extensions": ["spq"] },
  "application/scvp-vp-response": { "source": "iana", "extensions": ["spp"] },
  "application/sdp": { "source": "iana", "extensions": ["sdp"] },
  "application/secevent+jwt": { "source": "iana" },
  "application/senml+cbor": { "source": "iana" },
  "application/senml+json": { "source": "iana", "compressible": true },
  "application/senml+xml": { "source": "iana", "compressible": true, "extensions": ["senmlx"] },
  "application/senml-etch+cbor": { "source": "iana" },
  "application/senml-etch+json": { "source": "iana", "compressible": true },
  "application/senml-exi": { "source": "iana" },
  "application/sensml+cbor": { "source": "iana" },
  "application/sensml+json": { "source": "iana", "compressible": true },
  "application/sensml+xml": { "source": "iana", "compressible": true, "extensions": ["sensmlx"] },
  "application/sensml-exi": { "source": "iana" },
  "application/sep+xml": { "source": "iana", "compressible": true },
  "application/sep-exi": { "source": "iana" },
  "application/session-info": { "source": "iana" },
  "application/set-payment": { "source": "iana" },
  "application/set-payment-initiation": { "source": "iana", "extensions": ["setpay"] },
  "application/set-registration": { "source": "iana" },
  "application/set-registration-initiation": { "source": "iana", "extensions": ["setreg"] },
  "application/sgml": { "source": "iana" },
  "application/sgml-open-catalog": { "source": "iana" },
  "application/shf+xml": { "source": "iana", "compressible": true, "extensions": ["shf"] },
  "application/sieve": { "source": "iana", "extensions": ["siv", "sieve"] },
  "application/simple-filter+xml": { "source": "iana", "compressible": true },
  "application/simple-message-summary": { "source": "iana" },
  "application/simplesymbolcontainer": { "source": "iana" },
  "application/sipc": { "source": "iana" },
  "application/slate": { "source": "iana" },
  "application/smil": { "source": "iana" },
  "application/smil+xml": { "source": "iana", "compressible": true, "extensions": ["smi", "smil"] },
  "application/smpte336m": { "source": "iana" },
  "application/soap+fastinfoset": { "source": "iana" },
  "application/soap+xml": { "source": "iana", "compressible": true },
  "application/sparql-query": { "source": "iana", "extensions": ["rq"] },
  "application/sparql-results+xml": { "source": "iana", "compressible": true, "extensions": ["srx"] },
  "application/spdx+json": { "source": "iana", "compressible": true },
  "application/spirits-event+xml": { "source": "iana", "compressible": true },
  "application/sql": { "source": "iana" },
  "application/srgs": { "source": "iana", "extensions": ["gram"] },
  "application/srgs+xml": { "source": "iana", "compressible": true, "extensions": ["grxml"] },
  "application/sru+xml": { "source": "iana", "compressible": true, "extensions": ["sru"] },
  "application/ssdl+xml": { "source": "apache", "compressible": true, "extensions": ["ssdl"] },
  "application/ssml+xml": { "source": "iana", "compressible": true, "extensions": ["ssml"] },
  "application/stix+json": { "source": "iana", "compressible": true },
  "application/swid+xml": { "source": "iana", "compressible": true, "extensions": ["swidtag"] },
  "application/tamp-apex-update": { "source": "iana" },
  "application/tamp-apex-update-confirm": { "source": "iana" },
  "application/tamp-community-update": { "source": "iana" },
  "application/tamp-community-update-confirm": { "source": "iana" },
  "application/tamp-error": { "source": "iana" },
  "application/tamp-sequence-adjust": { "source": "iana" },
  "application/tamp-sequence-adjust-confirm": { "source": "iana" },
  "application/tamp-status-query": { "source": "iana" },
  "application/tamp-status-response": { "source": "iana" },
  "application/tamp-update": { "source": "iana" },
  "application/tamp-update-confirm": { "source": "iana" },
  "application/tar": { "compressible": true },
  "application/taxii+json": { "source": "iana", "compressible": true },
  "application/td+json": { "source": "iana", "compressible": true },
  "application/tei+xml": { "source": "iana", "compressible": true, "extensions": ["tei", "teicorpus"] },
  "application/tetra_isi": { "source": "iana" },
  "application/thraud+xml": { "source": "iana", "compressible": true, "extensions": ["tfi"] },
  "application/timestamp-query": { "source": "iana" },
  "application/timestamp-reply": { "source": "iana" },
  "application/timestamped-data": { "source": "iana", "extensions": ["tsd"] },
  "application/tlsrpt+gzip": { "source": "iana" },
  "application/tlsrpt+json": { "source": "iana", "compressible": true },
  "application/tnauthlist": { "source": "iana" },
  "application/token-introspection+jwt": { "source": "iana" },
  "application/toml": { "compressible": true, "extensions": ["toml"] },
  "application/trickle-ice-sdpfrag": { "source": "iana" },
  "application/trig": { "source": "iana", "extensions": ["trig"] },
  "application/ttml+xml": { "source": "iana", "compressible": true, "extensions": ["ttml"] },
  "application/tve-trigger": { "source": "iana" },
  "application/tzif": { "source": "iana" },
  "application/tzif-leap": { "source": "iana" },
  "application/ubjson": { "compressible": false, "extensions": ["ubj"] },
  "application/ulpfec": { "source": "iana" },
  "application/urc-grpsheet+xml": { "source": "iana", "compressible": true },
  "application/urc-ressheet+xml": { "source": "iana", "compressible": true, "extensions": ["rsheet"] },
  "application/urc-targetdesc+xml": { "source": "iana", "compressible": true, "extensions": ["td"] },
  "application/urc-uisocketdesc+xml": { "source": "iana", "compressible": true },
  "application/vcard+json": { "source": "iana", "compressible": true },
  "application/vcard+xml": { "source": "iana", "compressible": true },
  "application/vemmi": { "source": "iana" },
  "application/vividence.scriptfile": { "source": "apache" },
  "application/vnd.1000minds.decision-model+xml": { "source": "iana", "compressible": true, "extensions": ["1km"] },
  "application/vnd.3gpp-prose+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp-prose-pc3ch+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp-v2x-local-service-information": { "source": "iana" },
  "application/vnd.3gpp.5gnas": { "source": "iana" },
  "application/vnd.3gpp.access-transfer-events+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.bsf+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.gmop+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.gtpc": { "source": "iana" },
  "application/vnd.3gpp.interworking-data": { "source": "iana" },
  "application/vnd.3gpp.lpp": { "source": "iana" },
  "application/vnd.3gpp.mc-signalling-ear": { "source": "iana" },
  "application/vnd.3gpp.mcdata-affiliation-command+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcdata-info+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcdata-payload": { "source": "iana" },
  "application/vnd.3gpp.mcdata-service-config+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcdata-signalling": { "source": "iana" },
  "application/vnd.3gpp.mcdata-ue-config+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcdata-user-profile+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcptt-affiliation-command+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcptt-floor-request+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcptt-info+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcptt-location-info+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcptt-mbms-usage-info+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcptt-service-config+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcptt-signed+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcptt-ue-config+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcptt-ue-init-config+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcptt-user-profile+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcvideo-affiliation-command+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcvideo-affiliation-info+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcvideo-info+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcvideo-location-info+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcvideo-mbms-usage-info+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcvideo-service-config+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcvideo-transmission-request+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcvideo-ue-config+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mcvideo-user-profile+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.mid-call+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.ngap": { "source": "iana" },
  "application/vnd.3gpp.pfcp": { "source": "iana" },
  "application/vnd.3gpp.pic-bw-large": { "source": "iana", "extensions": ["plb"] },
  "application/vnd.3gpp.pic-bw-small": { "source": "iana", "extensions": ["psb"] },
  "application/vnd.3gpp.pic-bw-var": { "source": "iana", "extensions": ["pvb"] },
  "application/vnd.3gpp.s1ap": { "source": "iana" },
  "application/vnd.3gpp.sms": { "source": "iana" },
  "application/vnd.3gpp.sms+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.srvcc-ext+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.srvcc-info+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.state-and-event-info+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp.ussd+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp2.bcmcsinfo+xml": { "source": "iana", "compressible": true },
  "application/vnd.3gpp2.sms": { "source": "iana" },
  "application/vnd.3gpp2.tcap": { "source": "iana", "extensions": ["tcap"] },
  "application/vnd.3lightssoftware.imagescal": { "source": "iana" },
  "application/vnd.3m.post-it-notes": { "source": "iana", "extensions": ["pwn"] },
  "application/vnd.accpac.simply.aso": { "source": "iana", "extensions": ["aso"] },
  "application/vnd.accpac.simply.imp": { "source": "iana", "extensions": ["imp"] },
  "application/vnd.acucobol": { "source": "iana", "extensions": ["acu"] },
  "application/vnd.acucorp": { "source": "iana", "extensions": ["atc", "acutc"] },
  "application/vnd.adobe.air-application-installer-package+zip": { "source": "apache", "compressible": false, "extensions": ["air"] },
  "application/vnd.adobe.flash.movie": { "source": "iana" },
  "application/vnd.adobe.formscentral.fcdt": { "source": "iana", "extensions": ["fcdt"] },
  "application/vnd.adobe.fxp": { "source": "iana", "extensions": ["fxp", "fxpl"] },
  "application/vnd.adobe.partial-upload": { "source": "iana" },
  "application/vnd.adobe.xdp+xml": { "source": "iana", "compressible": true, "extensions": ["xdp"] },
  "application/vnd.adobe.xfdf": { "source": "iana", "extensions": ["xfdf"] },
  "application/vnd.aether.imp": { "source": "iana" },
  "application/vnd.afpc.afplinedata": { "source": "iana" },
  "application/vnd.afpc.afplinedata-pagedef": { "source": "iana" },
  "application/vnd.afpc.cmoca-cmresource": { "source": "iana" },
  "application/vnd.afpc.foca-charset": { "source": "iana" },
  "application/vnd.afpc.foca-codedfont": { "source": "iana" },
  "application/vnd.afpc.foca-codepage": { "source": "iana" },
  "application/vnd.afpc.modca": { "source": "iana" },
  "application/vnd.afpc.modca-cmtable": { "source": "iana" },
  "application/vnd.afpc.modca-formdef": { "source": "iana" },
  "application/vnd.afpc.modca-mediummap": { "source": "iana" },
  "application/vnd.afpc.modca-objectcontainer": { "source": "iana" },
  "application/vnd.afpc.modca-overlay": { "source": "iana" },
  "application/vnd.afpc.modca-pagesegment": { "source": "iana" },
  "application/vnd.age": { "source": "iana", "extensions": ["age"] },
  "application/vnd.ah-barcode": { "source": "iana" },
  "application/vnd.ahead.space": { "source": "iana", "extensions": ["ahead"] },
  "application/vnd.airzip.filesecure.azf": { "source": "iana", "extensions": ["azf"] },
  "application/vnd.airzip.filesecure.azs": { "source": "iana", "extensions": ["azs"] },
  "application/vnd.amadeus+json": { "source": "iana", "compressible": true },
  "application/vnd.amazon.ebook": { "source": "apache", "extensions": ["azw"] },
  "application/vnd.amazon.mobi8-ebook": { "source": "iana" },
  "application/vnd.americandynamics.acc": { "source": "iana", "extensions": ["acc"] },
  "application/vnd.amiga.ami": { "source": "iana", "extensions": ["ami"] },
  "application/vnd.amundsen.maze+xml": { "source": "iana", "compressible": true },
  "application/vnd.android.ota": { "source": "iana" },
  "application/vnd.android.package-archive": { "source": "apache", "compressible": false, "extensions": ["apk"] },
  "application/vnd.anki": { "source": "iana" },
  "application/vnd.anser-web-certificate-issue-initiation": { "source": "iana", "extensions": ["cii"] },
  "application/vnd.anser-web-funds-transfer-initiation": { "source": "apache", "extensions": ["fti"] },
  "application/vnd.antix.game-component": { "source": "iana", "extensions": ["atx"] },
  "application/vnd.apache.arrow.file": { "source": "iana" },
  "application/vnd.apache.arrow.stream": { "source": "iana" },
  "application/vnd.apache.thrift.binary": { "source": "iana" },
  "application/vnd.apache.thrift.compact": { "source": "iana" },
  "application/vnd.apache.thrift.json": { "source": "iana" },
  "application/vnd.api+json": { "source": "iana", "compressible": true },
  "application/vnd.aplextor.warrp+json": { "source": "iana", "compressible": true },
  "application/vnd.apothekende.reservation+json": { "source": "iana", "compressible": true },
  "application/vnd.apple.installer+xml": { "source": "iana", "compressible": true, "extensions": ["mpkg"] },
  "application/vnd.apple.keynote": { "source": "iana", "extensions": ["key"] },
  "application/vnd.apple.mpegurl": { "source": "iana", "extensions": ["m3u8"] },
  "application/vnd.apple.numbers": { "source": "iana", "extensions": ["numbers"] },
  "application/vnd.apple.pages": { "source": "iana", "extensions": ["pages"] },
  "application/vnd.apple.pkpass": { "compressible": false, "extensions": ["pkpass"] },
  "application/vnd.arastra.swi": { "source": "iana" },
  "application/vnd.aristanetworks.swi": { "source": "iana", "extensions": ["swi"] },
  "application/vnd.artisan+json": { "source": "iana", "compressible": true },
  "application/vnd.artsquare": { "source": "iana" },
  "application/vnd.astraea-software.iota": { "source": "iana", "extensions": ["iota"] },
  "application/vnd.audiograph": { "source": "iana", "extensions": ["aep"] },
  "application/vnd.autopackage": { "source": "iana" },
  "application/vnd.avalon+json": { "source": "iana", "compressible": true },
  "application/vnd.avistar+xml": { "source": "iana", "compressible": true },
  "application/vnd.balsamiq.bmml+xml": { "source": "iana", "compressible": true, "extensions": ["bmml"] },
  "application/vnd.balsamiq.bmpr": { "source": "iana" },
  "application/vnd.banana-accounting": { "source": "iana" },
  "application/vnd.bbf.usp.error": { "source": "iana" },
  "application/vnd.bbf.usp.msg": { "source": "iana" },
  "application/vnd.bbf.usp.msg+json": { "source": "iana", "compressible": true },
  "application/vnd.bekitzur-stech+json": { "source": "iana", "compressible": true },
  "application/vnd.bint.med-content": { "source": "iana" },
  "application/vnd.biopax.rdf+xml": { "source": "iana", "compressible": true },
  "application/vnd.blink-idb-value-wrapper": { "source": "iana" },
  "application/vnd.blueice.multipass": { "source": "iana", "extensions": ["mpm"] },
  "application/vnd.bluetooth.ep.oob": { "source": "iana" },
  "application/vnd.bluetooth.le.oob": { "source": "iana" },
  "application/vnd.bmi": { "source": "iana", "extensions": ["bmi"] },
  "application/vnd.bpf": { "source": "iana" },
  "application/vnd.bpf3": { "source": "iana" },
  "application/vnd.businessobjects": { "source": "iana", "extensions": ["rep"] },
  "application/vnd.byu.uapi+json": { "source": "iana", "compressible": true },
  "application/vnd.cab-jscript": { "source": "iana" },
  "application/vnd.canon-cpdl": { "source": "iana" },
  "application/vnd.canon-lips": { "source": "iana" },
  "application/vnd.capasystems-pg+json": { "source": "iana", "compressible": true },
  "application/vnd.cendio.thinlinc.clientconf": { "source": "iana" },
  "application/vnd.century-systems.tcp_stream": { "source": "iana" },
  "application/vnd.chemdraw+xml": { "source": "iana", "compressible": true, "extensions": ["cdxml"] },
  "application/vnd.chess-pgn": { "source": "iana" },
  "application/vnd.chipnuts.karaoke-mmd": { "source": "iana", "extensions": ["mmd"] },
  "application/vnd.ciedi": { "source": "iana" },
  "application/vnd.cinderella": { "source": "iana", "extensions": ["cdy"] },
  "application/vnd.cirpack.isdn-ext": { "source": "iana" },
  "application/vnd.citationstyles.style+xml": { "source": "iana", "compressible": true, "extensions": ["csl"] },
  "application/vnd.claymore": { "source": "iana", "extensions": ["cla"] },
  "application/vnd.cloanto.rp9": { "source": "iana", "extensions": ["rp9"] },
  "application/vnd.clonk.c4group": { "source": "iana", "extensions": ["c4g", "c4d", "c4f", "c4p", "c4u"] },
  "application/vnd.cluetrust.cartomobile-config": { "source": "iana", "extensions": ["c11amc"] },
  "application/vnd.cluetrust.cartomobile-config-pkg": { "source": "iana", "extensions": ["c11amz"] },
  "application/vnd.coffeescript": { "source": "iana" },
  "application/vnd.collabio.xodocuments.document": { "source": "iana" },
  "application/vnd.collabio.xodocuments.document-template": { "source": "iana" },
  "application/vnd.collabio.xodocuments.presentation": { "source": "iana" },
  "application/vnd.collabio.xodocuments.presentation-template": { "source": "iana" },
  "application/vnd.collabio.xodocuments.spreadsheet": { "source": "iana" },
  "application/vnd.collabio.xodocuments.spreadsheet-template": { "source": "iana" },
  "application/vnd.collection+json": { "source": "iana", "compressible": true },
  "application/vnd.collection.doc+json": { "source": "iana", "compressible": true },
  "application/vnd.collection.next+json": { "source": "iana", "compressible": true },
  "application/vnd.comicbook+zip": { "source": "iana", "compressible": false },
  "application/vnd.comicbook-rar": { "source": "iana" },
  "application/vnd.commerce-battelle": { "source": "iana" },
  "application/vnd.commonspace": { "source": "iana", "extensions": ["csp"] },
  "application/vnd.contact.cmsg": { "source": "iana", "extensions": ["cdbcmsg"] },
  "application/vnd.coreos.ignition+json": { "source": "iana", "compressible": true },
  "application/vnd.cosmocaller": { "source": "iana", "extensions": ["cmc"] },
  "application/vnd.crick.clicker": { "source": "iana", "extensions": ["clkx"] },
  "application/vnd.crick.clicker.keyboard": { "source": "iana", "extensions": ["clkk"] },
  "application/vnd.crick.clicker.palette": { "source": "iana", "extensions": ["clkp"] },
  "application/vnd.crick.clicker.template": { "source": "iana", "extensions": ["clkt"] },
  "application/vnd.crick.clicker.wordbank": { "source": "iana", "extensions": ["clkw"] },
  "application/vnd.criticaltools.wbs+xml": { "source": "iana", "compressible": true, "extensions": ["wbs"] },
  "application/vnd.cryptii.pipe+json": { "source": "iana", "compressible": true },
  "application/vnd.crypto-shade-file": { "source": "iana" },
  "application/vnd.cryptomator.encrypted": { "source": "iana" },
  "application/vnd.cryptomator.vault": { "source": "iana" },
  "application/vnd.ctc-posml": { "source": "iana", "extensions": ["pml"] },
  "application/vnd.ctct.ws+xml": { "source": "iana", "compressible": true },
  "application/vnd.cups-pdf": { "source": "iana" },
  "application/vnd.cups-postscript": { "source": "iana" },
  "application/vnd.cups-ppd": { "source": "iana", "extensions": ["ppd"] },
  "application/vnd.cups-raster": { "source": "iana" },
  "application/vnd.cups-raw": { "source": "iana" },
  "application/vnd.curl": { "source": "iana" },
  "application/vnd.curl.car": { "source": "apache", "extensions": ["car"] },
  "application/vnd.curl.pcurl": { "source": "apache", "extensions": ["pcurl"] },
  "application/vnd.cyan.dean.root+xml": { "source": "iana", "compressible": true },
  "application/vnd.cybank": { "source": "iana" },
  "application/vnd.cyclonedx+json": { "source": "iana", "compressible": true },
  "application/vnd.cyclonedx+xml": { "source": "iana", "compressible": true },
  "application/vnd.d2l.coursepackage1p0+zip": { "source": "iana", "compressible": false },
  "application/vnd.d3m-dataset": { "source": "iana" },
  "application/vnd.d3m-problem": { "source": "iana" },
  "application/vnd.dart": { "source": "iana", "compressible": true, "extensions": ["dart"] },
  "application/vnd.data-vision.rdz": { "source": "iana", "extensions": ["rdz"] },
  "application/vnd.datapackage+json": { "source": "iana", "compressible": true },
  "application/vnd.dataresource+json": { "source": "iana", "compressible": true },
  "application/vnd.dbf": { "source": "iana", "extensions": ["dbf"] },
  "application/vnd.debian.binary-package": { "source": "iana" },
  "application/vnd.dece.data": { "source": "iana", "extensions": ["uvf", "uvvf", "uvd", "uvvd"] },
  "application/vnd.dece.ttml+xml": { "source": "iana", "compressible": true, "extensions": ["uvt", "uvvt"] },
  "application/vnd.dece.unspecified": { "source": "iana", "extensions": ["uvx", "uvvx"] },
  "application/vnd.dece.zip": { "source": "iana", "extensions": ["uvz", "uvvz"] },
  "application/vnd.denovo.fcselayout-link": { "source": "iana", "extensions": ["fe_launch"] },
  "application/vnd.desmume.movie": { "source": "iana" },
  "application/vnd.dir-bi.plate-dl-nosuffix": { "source": "iana" },
  "application/vnd.dm.delegation+xml": { "source": "iana", "compressible": true },
  "application/vnd.dna": { "source": "iana", "extensions": ["dna"] },
  "application/vnd.document+json": { "source": "iana", "compressible": true },
  "application/vnd.dolby.mlp": { "source": "apache", "extensions": ["mlp"] },
  "application/vnd.dolby.mobile.1": { "source": "iana" },
  "application/vnd.dolby.mobile.2": { "source": "iana" },
  "application/vnd.doremir.scorecloud-binary-document": { "source": "iana" },
  "application/vnd.dpgraph": { "source": "iana", "extensions": ["dpg"] },
  "application/vnd.dreamfactory": { "source": "iana", "extensions": ["dfac"] },
  "application/vnd.drive+json": { "source": "iana", "compressible": true },
  "application/vnd.ds-keypoint": { "source": "apache", "extensions": ["kpxx"] },
  "application/vnd.dtg.local": { "source": "iana" },
  "application/vnd.dtg.local.flash": { "source": "iana" },
  "application/vnd.dtg.local.html": { "source": "iana" },
  "application/vnd.dvb.ait": { "source": "iana", "extensions": ["ait"] },
  "application/vnd.dvb.dvbisl+xml": { "source": "iana", "compressible": true },
  "application/vnd.dvb.dvbj": { "source": "iana" },
  "application/vnd.dvb.esgcontainer": { "source": "iana" },
  "application/vnd.dvb.ipdcdftnotifaccess": { "source": "iana" },
  "application/vnd.dvb.ipdcesgaccess": { "source": "iana" },
  "application/vnd.dvb.ipdcesgaccess2": { "source": "iana" },
  "application/vnd.dvb.ipdcesgpdd": { "source": "iana" },
  "application/vnd.dvb.ipdcroaming": { "source": "iana" },
  "application/vnd.dvb.iptv.alfec-base": { "source": "iana" },
  "application/vnd.dvb.iptv.alfec-enhancement": { "source": "iana" },
  "application/vnd.dvb.notif-aggregate-root+xml": { "source": "iana", "compressible": true },
  "application/vnd.dvb.notif-container+xml": { "source": "iana", "compressible": true },
  "application/vnd.dvb.notif-generic+xml": { "source": "iana", "compressible": true },
  "application/vnd.dvb.notif-ia-msglist+xml": { "source": "iana", "compressible": true },
  "application/vnd.dvb.notif-ia-registration-request+xml": { "source": "iana", "compressible": true },
  "application/vnd.dvb.notif-ia-registration-response+xml": { "source": "iana", "compressible": true },
  "application/vnd.dvb.notif-init+xml": { "source": "iana", "compressible": true },
  "application/vnd.dvb.pfr": { "source": "iana" },
  "application/vnd.dvb.service": { "source": "iana", "extensions": ["svc"] },
  "application/vnd.dxr": { "source": "iana" },
  "application/vnd.dynageo": { "source": "iana", "extensions": ["geo"] },
  "application/vnd.dzr": { "source": "iana" },
  "application/vnd.easykaraoke.cdgdownload": { "source": "iana" },
  "application/vnd.ecdis-update": { "source": "iana" },
  "application/vnd.ecip.rlp": { "source": "iana" },
  "application/vnd.eclipse.ditto+json": { "source": "iana", "compressible": true },
  "application/vnd.ecowin.chart": { "source": "iana", "extensions": ["mag"] },
  "application/vnd.ecowin.filerequest": { "source": "iana" },
  "application/vnd.ecowin.fileupdate": { "source": "iana" },
  "application/vnd.ecowin.series": { "source": "iana" },
  "application/vnd.ecowin.seriesrequest": { "source": "iana" },
  "application/vnd.ecowin.seriesupdate": { "source": "iana" },
  "application/vnd.efi.img": { "source": "iana" },
  "application/vnd.efi.iso": { "source": "iana" },
  "application/vnd.emclient.accessrequest+xml": { "source": "iana", "compressible": true },
  "application/vnd.enliven": { "source": "iana", "extensions": ["nml"] },
  "application/vnd.enphase.envoy": { "source": "iana" },
  "application/vnd.eprints.data+xml": { "source": "iana", "compressible": true },
  "application/vnd.epson.esf": { "source": "iana", "extensions": ["esf"] },
  "application/vnd.epson.msf": { "source": "iana", "extensions": ["msf"] },
  "application/vnd.epson.quickanime": { "source": "iana", "extensions": ["qam"] },
  "application/vnd.epson.salt": { "source": "iana", "extensions": ["slt"] },
  "application/vnd.epson.ssf": { "source": "iana", "extensions": ["ssf"] },
  "application/vnd.ericsson.quickcall": { "source": "iana" },
  "application/vnd.espass-espass+zip": { "source": "iana", "compressible": false },
  "application/vnd.eszigno3+xml": { "source": "iana", "compressible": true, "extensions": ["es3", "et3"] },
  "application/vnd.etsi.aoc+xml": { "source": "iana", "compressible": true },
  "application/vnd.etsi.asic-e+zip": { "source": "iana", "compressible": false },
  "application/vnd.etsi.asic-s+zip": { "source": "iana", "compressible": false },
  "application/vnd.etsi.cug+xml": { "source": "iana", "compressible": true },
  "application/vnd.etsi.iptvcommand+xml": { "source": "iana", "compressible": true },
  "application/vnd.etsi.iptvdiscovery+xml": { "source": "iana", "compressible": true },
  "application/vnd.etsi.iptvprofile+xml": { "source": "iana", "compressible": true },
  "application/vnd.etsi.iptvsad-bc+xml": { "source": "iana", "compressible": true },
  "application/vnd.etsi.iptvsad-cod+xml": { "source": "iana", "compressible": true },
  "application/vnd.etsi.iptvsad-npvr+xml": { "source": "iana", "compressible": true },
  "application/vnd.etsi.iptvservice+xml": { "source": "iana", "compressible": true },
  "application/vnd.etsi.iptvsync+xml": { "source": "iana", "compressible": true },
  "application/vnd.etsi.iptvueprofile+xml": { "source": "iana", "compressible": true },
  "application/vnd.etsi.mcid+xml": { "source": "iana", "compressible": true },
  "application/vnd.etsi.mheg5": { "source": "iana" },
  "application/vnd.etsi.overload-control-policy-dataset+xml": { "source": "iana", "compressible": true },
  "application/vnd.etsi.pstn+xml": { "source": "iana", "compressible": true },
  "application/vnd.etsi.sci+xml": { "source": "iana", "compressible": true },
  "application/vnd.etsi.simservs+xml": { "source": "iana", "compressible": true },
  "application/vnd.etsi.timestamp-token": { "source": "iana" },
  "application/vnd.etsi.tsl+xml": { "source": "iana", "compressible": true },
  "application/vnd.etsi.tsl.der": { "source": "iana" },
  "application/vnd.eu.kasparian.car+json": { "source": "iana", "compressible": true },
  "application/vnd.eudora.data": { "source": "iana" },
  "application/vnd.evolv.ecig.profile": { "source": "iana" },
  "application/vnd.evolv.ecig.settings": { "source": "iana" },
  "application/vnd.evolv.ecig.theme": { "source": "iana" },
  "application/vnd.exstream-empower+zip": { "source": "iana", "compressible": false },
  "application/vnd.exstream-package": { "source": "iana" },
  "application/vnd.ezpix-album": { "source": "iana", "extensions": ["ez2"] },
  "application/vnd.ezpix-package": { "source": "iana", "extensions": ["ez3"] },
  "application/vnd.f-secure.mobile": { "source": "iana" },
  "application/vnd.familysearch.gedcom+zip": { "source": "iana", "compressible": false },
  "application/vnd.fastcopy-disk-image": { "source": "iana" },
  "application/vnd.fdf": { "source": "iana", "extensions": ["fdf"] },
  "application/vnd.fdsn.mseed": { "source": "iana", "extensions": ["mseed"] },
  "application/vnd.fdsn.seed": { "source": "iana", "extensions": ["seed", "dataless"] },
  "application/vnd.ffsns": { "source": "iana" },
  "application/vnd.ficlab.flb+zip": { "source": "iana", "compressible": false },
  "application/vnd.filmit.zfc": { "source": "iana" },
  "application/vnd.fints": { "source": "iana" },
  "application/vnd.firemonkeys.cloudcell": { "source": "iana" },
  "application/vnd.flographit": { "source": "iana", "extensions": ["gph"] },
  "application/vnd.fluxtime.clip": { "source": "iana", "extensions": ["ftc"] },
  "application/vnd.font-fontforge-sfd": { "source": "iana" },
  "application/vnd.framemaker": { "source": "iana", "extensions": ["fm", "frame", "maker", "book"] },
  "application/vnd.frogans.fnc": { "source": "iana", "extensions": ["fnc"] },
  "application/vnd.frogans.ltf": { "source": "iana", "extensions": ["ltf"] },
  "application/vnd.fsc.weblaunch": { "source": "iana", "extensions": ["fsc"] },
  "application/vnd.fujifilm.fb.docuworks": { "source": "iana" },
  "application/vnd.fujifilm.fb.docuworks.binder": { "source": "iana" },
  "application/vnd.fujifilm.fb.docuworks.container": { "source": "iana" },
  "application/vnd.fujifilm.fb.jfi+xml": { "source": "iana", "compressible": true },
  "application/vnd.fujitsu.oasys": { "source": "iana", "extensions": ["oas"] },
  "application/vnd.fujitsu.oasys2": { "source": "iana", "extensions": ["oa2"] },
  "application/vnd.fujitsu.oasys3": { "source": "iana", "extensions": ["oa3"] },
  "application/vnd.fujitsu.oasysgp": { "source": "iana", "extensions": ["fg5"] },
  "application/vnd.fujitsu.oasysprs": { "source": "iana", "extensions": ["bh2"] },
  "application/vnd.fujixerox.art-ex": { "source": "iana" },
  "application/vnd.fujixerox.art4": { "source": "iana" },
  "application/vnd.fujixerox.ddd": { "source": "iana", "extensions": ["ddd"] },
  "application/vnd.fujixerox.docuworks": { "source": "iana", "extensions": ["xdw"] },
  "application/vnd.fujixerox.docuworks.binder": { "source": "iana", "extensions": ["xbd"] },
  "application/vnd.fujixerox.docuworks.container": { "source": "iana" },
  "application/vnd.fujixerox.hbpl": { "source": "iana" },
  "application/vnd.fut-misnet": { "source": "iana" },
  "application/vnd.futoin+cbor": { "source": "iana" },
  "application/vnd.futoin+json": { "source": "iana", "compressible": true },
  "application/vnd.fuzzysheet": { "source": "iana", "extensions": ["fzs"] },
  "application/vnd.genomatix.tuxedo": { "source": "iana", "extensions": ["txd"] },
  "application/vnd.gentics.grd+json": { "source": "iana", "compressible": true },
  "application/vnd.geo+json": { "source": "iana", "compressible": true },
  "application/vnd.geocube+xml": { "source": "iana", "compressible": true },
  "application/vnd.geogebra.file": { "source": "iana", "extensions": ["ggb"] },
  "application/vnd.geogebra.slides": { "source": "iana" },
  "application/vnd.geogebra.tool": { "source": "iana", "extensions": ["ggt"] },
  "application/vnd.geometry-explorer": { "source": "iana", "extensions": ["gex", "gre"] },
  "application/vnd.geonext": { "source": "iana", "extensions": ["gxt"] },
  "application/vnd.geoplan": { "source": "iana", "extensions": ["g2w"] },
  "application/vnd.geospace": { "source": "iana", "extensions": ["g3w"] },
  "application/vnd.gerber": { "source": "iana" },
  "application/vnd.globalplatform.card-content-mgt": { "source": "iana" },
  "application/vnd.globalplatform.card-content-mgt-response": { "source": "iana" },
  "application/vnd.gmx": { "source": "iana", "extensions": ["gmx"] },
  "application/vnd.google-apps.document": { "compressible": false, "extensions": ["gdoc"] },
  "application/vnd.google-apps.presentation": { "compressible": false, "extensions": ["gslides"] },
  "application/vnd.google-apps.spreadsheet": { "compressible": false, "extensions": ["gsheet"] },
  "application/vnd.google-earth.kml+xml": { "source": "iana", "compressible": true, "extensions": ["kml"] },
  "application/vnd.google-earth.kmz": { "source": "iana", "compressible": false, "extensions": ["kmz"] },
  "application/vnd.gov.sk.e-form+xml": { "source": "iana", "compressible": true },
  "application/vnd.gov.sk.e-form+zip": { "source": "iana", "compressible": false },
  "application/vnd.gov.sk.xmldatacontainer+xml": { "source": "iana", "compressible": true },
  "application/vnd.grafeq": { "source": "iana", "extensions": ["gqf", "gqs"] },
  "application/vnd.gridmp": { "source": "iana" },
  "application/vnd.groove-account": { "source": "iana", "extensions": ["gac"] },
  "application/vnd.groove-help": { "source": "iana", "extensions": ["ghf"] },
  "application/vnd.groove-identity-message": { "source": "iana", "extensions": ["gim"] },
  "application/vnd.groove-injector": { "source": "iana", "extensions": ["grv"] },
  "application/vnd.groove-tool-message": { "source": "iana", "extensions": ["gtm"] },
  "application/vnd.groove-tool-template": { "source": "iana", "extensions": ["tpl"] },
  "application/vnd.groove-vcard": { "source": "iana", "extensions": ["vcg"] },
  "application/vnd.hal+json": { "source": "iana", "compressible": true },
  "application/vnd.hal+xml": { "source": "iana", "compressible": true, "extensions": ["hal"] },
  "application/vnd.handheld-entertainment+xml": { "source": "iana", "compressible": true, "extensions": ["zmm"] },
  "application/vnd.hbci": { "source": "iana", "extensions": ["hbci"] },
  "application/vnd.hc+json": { "source": "iana", "compressible": true },
  "application/vnd.hcl-bireports": { "source": "iana" },
  "application/vnd.hdt": { "source": "iana" },
  "application/vnd.heroku+json": { "source": "iana", "compressible": true },
  "application/vnd.hhe.lesson-player": { "source": "iana", "extensions": ["les"] },
  "application/vnd.hl7cda+xml": { "source": "iana", "charset": "UTF-8", "compressible": true },
  "application/vnd.hl7v2+xml": { "source": "iana", "charset": "UTF-8", "compressible": true },
  "application/vnd.hp-hpgl": { "source": "iana", "extensions": ["hpgl"] },
  "application/vnd.hp-hpid": { "source": "iana", "extensions": ["hpid"] },
  "application/vnd.hp-hps": { "source": "iana", "extensions": ["hps"] },
  "application/vnd.hp-jlyt": { "source": "iana", "extensions": ["jlt"] },
  "application/vnd.hp-pcl": { "source": "iana", "extensions": ["pcl"] },
  "application/vnd.hp-pclxl": { "source": "iana", "extensions": ["pclxl"] },
  "application/vnd.httphone": { "source": "iana" },
  "application/vnd.hydrostatix.sof-data": { "source": "iana", "extensions": ["sfd-hdstx"] },
  "application/vnd.hyper+json": { "source": "iana", "compressible": true },
  "application/vnd.hyper-item+json": { "source": "iana", "compressible": true },
  "application/vnd.hyperdrive+json": { "source": "iana", "compressible": true },
  "application/vnd.hzn-3d-crossword": { "source": "iana" },
  "application/vnd.ibm.afplinedata": { "source": "iana" },
  "application/vnd.ibm.electronic-media": { "source": "iana" },
  "application/vnd.ibm.minipay": { "source": "iana", "extensions": ["mpy"] },
  "application/vnd.ibm.modcap": { "source": "iana", "extensions": ["afp", "listafp", "list3820"] },
  "application/vnd.ibm.rights-management": { "source": "iana", "extensions": ["irm"] },
  "application/vnd.ibm.secure-container": { "source": "iana", "extensions": ["sc"] },
  "application/vnd.iccprofile": { "source": "iana", "extensions": ["icc", "icm"] },
  "application/vnd.ieee.1905": { "source": "iana" },
  "application/vnd.igloader": { "source": "iana", "extensions": ["igl"] },
  "application/vnd.imagemeter.folder+zip": { "source": "iana", "compressible": false },
  "application/vnd.imagemeter.image+zip": { "source": "iana", "compressible": false },
  "application/vnd.immervision-ivp": { "source": "iana", "extensions": ["ivp"] },
  "application/vnd.immervision-ivu": { "source": "iana", "extensions": ["ivu"] },
  "application/vnd.ims.imsccv1p1": { "source": "iana" },
  "application/vnd.ims.imsccv1p2": { "source": "iana" },
  "application/vnd.ims.imsccv1p3": { "source": "iana" },
  "application/vnd.ims.lis.v2.result+json": { "source": "iana", "compressible": true },
  "application/vnd.ims.lti.v2.toolconsumerprofile+json": { "source": "iana", "compressible": true },
  "application/vnd.ims.lti.v2.toolproxy+json": { "source": "iana", "compressible": true },
  "application/vnd.ims.lti.v2.toolproxy.id+json": { "source": "iana", "compressible": true },
  "application/vnd.ims.lti.v2.toolsettings+json": { "source": "iana", "compressible": true },
  "application/vnd.ims.lti.v2.toolsettings.simple+json": { "source": "iana", "compressible": true },
  "application/vnd.informedcontrol.rms+xml": { "source": "iana", "compressible": true },
  "application/vnd.informix-visionary": { "source": "iana" },
  "application/vnd.infotech.project": { "source": "iana" },
  "application/vnd.infotech.project+xml": { "source": "iana", "compressible": true },
  "application/vnd.innopath.wamp.notification": { "source": "iana" },
  "application/vnd.insors.igm": { "source": "iana", "extensions": ["igm"] },
  "application/vnd.intercon.formnet": { "source": "iana", "extensions": ["xpw", "xpx"] },
  "application/vnd.intergeo": { "source": "iana", "extensions": ["i2g"] },
  "application/vnd.intertrust.digibox": { "source": "iana" },
  "application/vnd.intertrust.nncp": { "source": "iana" },
  "application/vnd.intu.qbo": { "source": "iana", "extensions": ["qbo"] },
  "application/vnd.intu.qfx": { "source": "iana", "extensions": ["qfx"] },
  "application/vnd.iptc.g2.catalogitem+xml": { "source": "iana", "compressible": true },
  "application/vnd.iptc.g2.conceptitem+xml": { "source": "iana", "compressible": true },
  "application/vnd.iptc.g2.knowledgeitem+xml": { "source": "iana", "compressible": true },
  "application/vnd.iptc.g2.newsitem+xml": { "source": "iana", "compressible": true },
  "application/vnd.iptc.g2.newsmessage+xml": { "source": "iana", "compressible": true },
  "application/vnd.iptc.g2.packageitem+xml": { "source": "iana", "compressible": true },
  "application/vnd.iptc.g2.planningitem+xml": { "source": "iana", "compressible": true },
  "application/vnd.ipunplugged.rcprofile": { "source": "iana", "extensions": ["rcprofile"] },
  "application/vnd.irepository.package+xml": { "source": "iana", "compressible": true, "extensions": ["irp"] },
  "application/vnd.is-xpr": { "source": "iana", "extensions": ["xpr"] },
  "application/vnd.isac.fcs": { "source": "iana", "extensions": ["fcs"] },
  "application/vnd.iso11783-10+zip": { "source": "iana", "compressible": false },
  "application/vnd.jam": { "source": "iana", "extensions": ["jam"] },
  "application/vnd.japannet-directory-service": { "source": "iana" },
  "application/vnd.japannet-jpnstore-wakeup": { "source": "iana" },
  "application/vnd.japannet-payment-wakeup": { "source": "iana" },
  "application/vnd.japannet-registration": { "source": "iana" },
  "application/vnd.japannet-registration-wakeup": { "source": "iana" },
  "application/vnd.japannet-setstore-wakeup": { "source": "iana" },
  "application/vnd.japannet-verification": { "source": "iana" },
  "application/vnd.japannet-verification-wakeup": { "source": "iana" },
  "application/vnd.jcp.javame.midlet-rms": { "source": "iana", "extensions": ["rms"] },
  "application/vnd.jisp": { "source": "iana", "extensions": ["jisp"] },
  "application/vnd.joost.joda-archive": { "source": "iana", "extensions": ["joda"] },
  "application/vnd.jsk.isdn-ngn": { "source": "iana" },
  "application/vnd.kahootz": { "source": "iana", "extensions": ["ktz", "ktr"] },
  "application/vnd.kde.karbon": { "source": "iana", "extensions": ["karbon"] },
  "application/vnd.kde.kchart": { "source": "iana", "extensions": ["chrt"] },
  "application/vnd.kde.kformula": { "source": "iana", "extensions": ["kfo"] },
  "application/vnd.kde.kivio": { "source": "iana", "extensions": ["flw"] },
  "application/vnd.kde.kontour": { "source": "iana", "extensions": ["kon"] },
  "application/vnd.kde.kpresenter": { "source": "iana", "extensions": ["kpr", "kpt"] },
  "application/vnd.kde.kspread": { "source": "iana", "extensions": ["ksp"] },
  "application/vnd.kde.kword": { "source": "iana", "extensions": ["kwd", "kwt"] },
  "application/vnd.kenameaapp": { "source": "iana", "extensions": ["htke"] },
  "application/vnd.kidspiration": { "source": "iana", "extensions": ["kia"] },
  "application/vnd.kinar": { "source": "iana", "extensions": ["kne", "knp"] },
  "application/vnd.koan": { "source": "iana", "extensions": ["skp", "skd", "skt", "skm"] },
  "application/vnd.kodak-descriptor": { "source": "iana", "extensions": ["sse"] },
  "application/vnd.las": { "source": "iana" },
  "application/vnd.las.las+json": { "source": "iana", "compressible": true },
  "application/vnd.las.las+xml": { "source": "iana", "compressible": true, "extensions": ["lasxml"] },
  "application/vnd.laszip": { "source": "iana" },
  "application/vnd.leap+json": { "source": "iana", "compressible": true },
  "application/vnd.liberty-request+xml": { "source": "iana", "compressible": true },
  "application/vnd.llamagraphics.life-balance.desktop": { "source": "iana", "extensions": ["lbd"] },
  "application/vnd.llamagraphics.life-balance.exchange+xml": { "source": "iana", "compressible": true, "extensions": ["lbe"] },
  "application/vnd.logipipe.circuit+zip": { "source": "iana", "compressible": false },
  "application/vnd.loom": { "source": "iana" },
  "application/vnd.lotus-1-2-3": { "source": "iana", "extensions": ["123"] },
  "application/vnd.lotus-approach": { "source": "iana", "extensions": ["apr"] },
  "application/vnd.lotus-freelance": { "source": "iana", "extensions": ["pre"] },
  "application/vnd.lotus-notes": { "source": "iana", "extensions": ["nsf"] },
  "application/vnd.lotus-organizer": { "source": "iana", "extensions": ["org"] },
  "application/vnd.lotus-screencam": { "source": "iana", "extensions": ["scm"] },
  "application/vnd.lotus-wordpro": { "source": "iana", "extensions": ["lwp"] },
  "application/vnd.macports.portpkg": { "source": "iana", "extensions": ["portpkg"] },
  "application/vnd.mapbox-vector-tile": { "source": "iana", "extensions": ["mvt"] },
  "application/vnd.marlin.drm.actiontoken+xml": { "source": "iana", "compressible": true },
  "application/vnd.marlin.drm.conftoken+xml": { "source": "iana", "compressible": true },
  "application/vnd.marlin.drm.license+xml": { "source": "iana", "compressible": true },
  "application/vnd.marlin.drm.mdcf": { "source": "iana" },
  "application/vnd.mason+json": { "source": "iana", "compressible": true },
  "application/vnd.maxar.archive.3tz+zip": { "source": "iana", "compressible": false },
  "application/vnd.maxmind.maxmind-db": { "source": "iana" },
  "application/vnd.mcd": { "source": "iana", "extensions": ["mcd"] },
  "application/vnd.medcalcdata": { "source": "iana", "extensions": ["mc1"] },
  "application/vnd.mediastation.cdkey": { "source": "iana", "extensions": ["cdkey"] },
  "application/vnd.meridian-slingshot": { "source": "iana" },
  "application/vnd.mfer": { "source": "iana", "extensions": ["mwf"] },
  "application/vnd.mfmp": { "source": "iana", "extensions": ["mfm"] },
  "application/vnd.micro+json": { "source": "iana", "compressible": true },
  "application/vnd.micrografx.flo": { "source": "iana", "extensions": ["flo"] },
  "application/vnd.micrografx.igx": { "source": "iana", "extensions": ["igx"] },
  "application/vnd.microsoft.portable-executable": { "source": "iana" },
  "application/vnd.microsoft.windows.thumbnail-cache": { "source": "iana" },
  "application/vnd.miele+json": { "source": "iana", "compressible": true },
  "application/vnd.mif": { "source": "iana", "extensions": ["mif"] },
  "application/vnd.minisoft-hp3000-save": { "source": "iana" },
  "application/vnd.mitsubishi.misty-guard.trustweb": { "source": "iana" },
  "application/vnd.mobius.daf": { "source": "iana", "extensions": ["daf"] },
  "application/vnd.mobius.dis": { "source": "iana", "extensions": ["dis"] },
  "application/vnd.mobius.mbk": { "source": "iana", "extensions": ["mbk"] },
  "application/vnd.mobius.mqy": { "source": "iana", "extensions": ["mqy"] },
  "application/vnd.mobius.msl": { "source": "iana", "extensions": ["msl"] },
  "application/vnd.mobius.plc": { "source": "iana", "extensions": ["plc"] },
  "application/vnd.mobius.txf": { "source": "iana", "extensions": ["txf"] },
  "application/vnd.mophun.application": { "source": "iana", "extensions": ["mpn"] },
  "application/vnd.mophun.certificate": { "source": "iana", "extensions": ["mpc"] },
  "application/vnd.motorola.flexsuite": { "source": "iana" },
  "application/vnd.motorola.flexsuite.adsi": { "source": "iana" },
  "application/vnd.motorola.flexsuite.fis": { "source": "iana" },
  "application/vnd.motorola.flexsuite.gotap": { "source": "iana" },
  "application/vnd.motorola.flexsuite.kmr": { "source": "iana" },
  "application/vnd.motorola.flexsuite.ttc": { "source": "iana" },
  "application/vnd.motorola.flexsuite.wem": { "source": "iana" },
  "application/vnd.motorola.iprm": { "source": "iana" },
  "application/vnd.mozilla.xul+xml": { "source": "iana", "compressible": true, "extensions": ["xul"] },
  "application/vnd.ms-3mfdocument": { "source": "iana" },
  "application/vnd.ms-artgalry": { "source": "iana", "extensions": ["cil"] },
  "application/vnd.ms-asf": { "source": "iana" },
  "application/vnd.ms-cab-compressed": { "source": "iana", "extensions": ["cab"] },
  "application/vnd.ms-color.iccprofile": { "source": "apache" },
  "application/vnd.ms-excel": { "source": "iana", "compressible": false, "extensions": ["xls", "xlm", "xla", "xlc", "xlt", "xlw"] },
  "application/vnd.ms-excel.addin.macroenabled.12": { "source": "iana", "extensions": ["xlam"] },
  "application/vnd.ms-excel.sheet.binary.macroenabled.12": { "source": "iana", "extensions": ["xlsb"] },
  "application/vnd.ms-excel.sheet.macroenabled.12": { "source": "iana", "extensions": ["xlsm"] },
  "application/vnd.ms-excel.template.macroenabled.12": { "source": "iana", "extensions": ["xltm"] },
  "application/vnd.ms-fontobject": { "source": "iana", "compressible": true, "extensions": ["eot"] },
  "application/vnd.ms-htmlhelp": { "source": "iana", "extensions": ["chm"] },
  "application/vnd.ms-ims": { "source": "iana", "extensions": ["ims"] },
  "application/vnd.ms-lrm": { "source": "iana", "extensions": ["lrm"] },
  "application/vnd.ms-office.activex+xml": { "source": "iana", "compressible": true },
  "application/vnd.ms-officetheme": { "source": "iana", "extensions": ["thmx"] },
  "application/vnd.ms-opentype": { "source": "apache", "compressible": true },
  "application/vnd.ms-outlook": { "compressible": false, "extensions": ["msg"] },
  "application/vnd.ms-package.obfuscated-opentype": { "source": "apache" },
  "application/vnd.ms-pki.seccat": { "source": "apache", "extensions": ["cat"] },
  "application/vnd.ms-pki.stl": { "source": "apache", "extensions": ["stl"] },
  "application/vnd.ms-playready.initiator+xml": { "source": "iana", "compressible": true },
  "application/vnd.ms-powerpoint": { "source": "iana", "compressible": false, "extensions": ["ppt", "pps", "pot"] },
  "application/vnd.ms-powerpoint.addin.macroenabled.12": { "source": "iana", "extensions": ["ppam"] },
  "application/vnd.ms-powerpoint.presentation.macroenabled.12": { "source": "iana", "extensions": ["pptm"] },
  "application/vnd.ms-powerpoint.slide.macroenabled.12": { "source": "iana", "extensions": ["sldm"] },
  "application/vnd.ms-powerpoint.slideshow.macroenabled.12": { "source": "iana", "extensions": ["ppsm"] },
  "application/vnd.ms-powerpoint.template.macroenabled.12": { "source": "iana", "extensions": ["potm"] },
  "application/vnd.ms-printdevicecapabilities+xml": { "source": "iana", "compressible": true },
  "application/vnd.ms-printing.printticket+xml": { "source": "apache", "compressible": true },
  "application/vnd.ms-printschematicket+xml": { "source": "iana", "compressible": true },
  "application/vnd.ms-project": { "source": "iana", "extensions": ["mpp", "mpt"] },
  "application/vnd.ms-tnef": { "source": "iana" },
  "application/vnd.ms-windows.devicepairing": { "source": "iana" },
  "application/vnd.ms-windows.nwprinting.oob": { "source": "iana" },
  "application/vnd.ms-windows.printerpairing": { "source": "iana" },
  "application/vnd.ms-windows.wsd.oob": { "source": "iana" },
  "application/vnd.ms-wmdrm.lic-chlg-req": { "source": "iana" },
  "application/vnd.ms-wmdrm.lic-resp": { "source": "iana" },
  "application/vnd.ms-wmdrm.meter-chlg-req": { "source": "iana" },
  "application/vnd.ms-wmdrm.meter-resp": { "source": "iana" },
  "application/vnd.ms-word.document.macroenabled.12": { "source": "iana", "extensions": ["docm"] },
  "application/vnd.ms-word.template.macroenabled.12": { "source": "iana", "extensions": ["dotm"] },
  "application/vnd.ms-works": { "source": "iana", "extensions": ["wps", "wks", "wcm", "wdb"] },
  "application/vnd.ms-wpl": { "source": "iana", "extensions": ["wpl"] },
  "application/vnd.ms-xpsdocument": { "source": "iana", "compressible": false, "extensions": ["xps"] },
  "application/vnd.msa-disk-image": { "source": "iana" },
  "application/vnd.mseq": { "source": "iana", "extensions": ["mseq"] },
  "application/vnd.msign": { "source": "iana" },
  "application/vnd.multiad.creator": { "source": "iana" },
  "application/vnd.multiad.creator.cif": { "source": "iana" },
  "application/vnd.music-niff": { "source": "iana" },
  "application/vnd.musician": { "source": "iana", "extensions": ["mus"] },
  "application/vnd.muvee.style": { "source": "iana", "extensions": ["msty"] },
  "application/vnd.mynfc": { "source": "iana", "extensions": ["taglet"] },
  "application/vnd.nacamar.ybrid+json": { "source": "iana", "compressible": true },
  "application/vnd.ncd.control": { "source": "iana" },
  "application/vnd.ncd.reference": { "source": "iana" },
  "application/vnd.nearst.inv+json": { "source": "iana", "compressible": true },
  "application/vnd.nebumind.line": { "source": "iana" },
  "application/vnd.nervana": { "source": "iana" },
  "application/vnd.netfpx": { "source": "iana" },
  "application/vnd.neurolanguage.nlu": { "source": "iana", "extensions": ["nlu"] },
  "application/vnd.nimn": { "source": "iana" },
  "application/vnd.nintendo.nitro.rom": { "source": "iana" },
  "application/vnd.nintendo.snes.rom": { "source": "iana" },
  "application/vnd.nitf": { "source": "iana", "extensions": ["ntf", "nitf"] },
  "application/vnd.noblenet-directory": { "source": "iana", "extensions": ["nnd"] },
  "application/vnd.noblenet-sealer": { "source": "iana", "extensions": ["nns"] },
  "application/vnd.noblenet-web": { "source": "iana", "extensions": ["nnw"] },
  "application/vnd.nokia.catalogs": { "source": "iana" },
  "application/vnd.nokia.conml+wbxml": { "source": "iana" },
  "application/vnd.nokia.conml+xml": { "source": "iana", "compressible": true },
  "application/vnd.nokia.iptv.config+xml": { "source": "iana", "compressible": true },
  "application/vnd.nokia.isds-radio-presets": { "source": "iana" },
  "application/vnd.nokia.landmark+wbxml": { "source": "iana" },
  "application/vnd.nokia.landmark+xml": { "source": "iana", "compressible": true },
  "application/vnd.nokia.landmarkcollection+xml": { "source": "iana", "compressible": true },
  "application/vnd.nokia.n-gage.ac+xml": { "source": "iana", "compressible": true, "extensions": ["ac"] },
  "application/vnd.nokia.n-gage.data": { "source": "iana", "extensions": ["ngdat"] },
  "application/vnd.nokia.n-gage.symbian.install": { "source": "iana", "extensions": ["n-gage"] },
  "application/vnd.nokia.ncd": { "source": "iana" },
  "application/vnd.nokia.pcd+wbxml": { "source": "iana" },
  "application/vnd.nokia.pcd+xml": { "source": "iana", "compressible": true },
  "application/vnd.nokia.radio-preset": { "source": "iana", "extensions": ["rpst"] },
  "application/vnd.nokia.radio-presets": { "source": "iana", "extensions": ["rpss"] },
  "application/vnd.novadigm.edm": { "source": "iana", "extensions": ["edm"] },
  "application/vnd.novadigm.edx": { "source": "iana", "extensions": ["edx"] },
  "application/vnd.novadigm.ext": { "source": "iana", "extensions": ["ext"] },
  "application/vnd.ntt-local.content-share": { "source": "iana" },
  "application/vnd.ntt-local.file-transfer": { "source": "iana" },
  "application/vnd.ntt-local.ogw_remote-access": { "source": "iana" },
  "application/vnd.ntt-local.sip-ta_remote": { "source": "iana" },
  "application/vnd.ntt-local.sip-ta_tcp_stream": { "source": "iana" },
  "application/vnd.oasis.opendocument.chart": { "source": "iana", "extensions": ["odc"] },
  "application/vnd.oasis.opendocument.chart-template": { "source": "iana", "extensions": ["otc"] },
  "application/vnd.oasis.opendocument.database": { "source": "iana", "extensions": ["odb"] },
  "application/vnd.oasis.opendocument.formula": { "source": "iana", "extensions": ["odf"] },
  "application/vnd.oasis.opendocument.formula-template": { "source": "iana", "extensions": ["odft"] },
  "application/vnd.oasis.opendocument.graphics": { "source": "iana", "compressible": false, "extensions": ["odg"] },
  "application/vnd.oasis.opendocument.graphics-template": { "source": "iana", "extensions": ["otg"] },
  "application/vnd.oasis.opendocument.image": { "source": "iana", "extensions": ["odi"] },
  "application/vnd.oasis.opendocument.image-template": { "source": "iana", "extensions": ["oti"] },
  "application/vnd.oasis.opendocument.presentation": { "source": "iana", "compressible": false, "extensions": ["odp"] },
  "application/vnd.oasis.opendocument.presentation-template": { "source": "iana", "extensions": ["otp"] },
  "application/vnd.oasis.opendocument.spreadsheet": { "source": "iana", "compressible": false, "extensions": ["ods"] },
  "application/vnd.oasis.opendocument.spreadsheet-template": { "source": "iana", "extensions": ["ots"] },
  "application/vnd.oasis.opendocument.text": { "source": "iana", "compressible": false, "extensions": ["odt"] },
  "application/vnd.oasis.opendocument.text-master": { "source": "iana", "extensions": ["odm"] },
  "application/vnd.oasis.opendocument.text-template": { "source": "iana", "extensions": ["ott"] },
  "application/vnd.oasis.opendocument.text-web": { "source": "iana", "extensions": ["oth"] },
  "application/vnd.obn": { "source": "iana" },
  "application/vnd.ocf+cbor": { "source": "iana" },
  "application/vnd.oci.image.manifest.v1+json": { "source": "iana", "compressible": true },
  "application/vnd.oftn.l10n+json": { "source": "iana", "compressible": true },
  "application/vnd.oipf.contentaccessdownload+xml": { "source": "iana", "compressible": true },
  "application/vnd.oipf.contentaccessstreaming+xml": { "source": "iana", "compressible": true },
  "application/vnd.oipf.cspg-hexbinary": { "source": "iana" },
  "application/vnd.oipf.dae.svg+xml": { "source": "iana", "compressible": true },
  "application/vnd.oipf.dae.xhtml+xml": { "source": "iana", "compressible": true },
  "application/vnd.oipf.mippvcontrolmessage+xml": { "source": "iana", "compressible": true },
  "application/vnd.oipf.pae.gem": { "source": "iana" },
  "application/vnd.oipf.spdiscovery+xml": { "source": "iana", "compressible": true },
  "application/vnd.oipf.spdlist+xml": { "source": "iana", "compressible": true },
  "application/vnd.oipf.ueprofile+xml": { "source": "iana", "compressible": true },
  "application/vnd.oipf.userprofile+xml": { "source": "iana", "compressible": true },
  "application/vnd.olpc-sugar": { "source": "iana", "extensions": ["xo"] },
  "application/vnd.oma-scws-config": { "source": "iana" },
  "application/vnd.oma-scws-http-request": { "source": "iana" },
  "application/vnd.oma-scws-http-response": { "source": "iana" },
  "application/vnd.oma.bcast.associated-procedure-parameter+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.bcast.drm-trigger+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.bcast.imd+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.bcast.ltkm": { "source": "iana" },
  "application/vnd.oma.bcast.notification+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.bcast.provisioningtrigger": { "source": "iana" },
  "application/vnd.oma.bcast.sgboot": { "source": "iana" },
  "application/vnd.oma.bcast.sgdd+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.bcast.sgdu": { "source": "iana" },
  "application/vnd.oma.bcast.simple-symbol-container": { "source": "iana" },
  "application/vnd.oma.bcast.smartcard-trigger+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.bcast.sprov+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.bcast.stkm": { "source": "iana" },
  "application/vnd.oma.cab-address-book+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.cab-feature-handler+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.cab-pcc+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.cab-subs-invite+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.cab-user-prefs+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.dcd": { "source": "iana" },
  "application/vnd.oma.dcdc": { "source": "iana" },
  "application/vnd.oma.dd2+xml": { "source": "iana", "compressible": true, "extensions": ["dd2"] },
  "application/vnd.oma.drm.risd+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.group-usage-list+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.lwm2m+cbor": { "source": "iana" },
  "application/vnd.oma.lwm2m+json": { "source": "iana", "compressible": true },
  "application/vnd.oma.lwm2m+tlv": { "source": "iana" },
  "application/vnd.oma.pal+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.poc.detailed-progress-report+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.poc.final-report+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.poc.groups+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.poc.invocation-descriptor+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.poc.optimized-progress-report+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.push": { "source": "iana" },
  "application/vnd.oma.scidm.messages+xml": { "source": "iana", "compressible": true },
  "application/vnd.oma.xcap-directory+xml": { "source": "iana", "compressible": true },
  "application/vnd.omads-email+xml": { "source": "iana", "charset": "UTF-8", "compressible": true },
  "application/vnd.omads-file+xml": { "source": "iana", "charset": "UTF-8", "compressible": true },
  "application/vnd.omads-folder+xml": { "source": "iana", "charset": "UTF-8", "compressible": true },
  "application/vnd.omaloc-supl-init": { "source": "iana" },
  "application/vnd.onepager": { "source": "iana" },
  "application/vnd.onepagertamp": { "source": "iana" },
  "application/vnd.onepagertamx": { "source": "iana" },
  "application/vnd.onepagertat": { "source": "iana" },
  "application/vnd.onepagertatp": { "source": "iana" },
  "application/vnd.onepagertatx": { "source": "iana" },
  "application/vnd.openblox.game+xml": { "source": "iana", "compressible": true, "extensions": ["obgx"] },
  "application/vnd.openblox.game-binary": { "source": "iana" },
  "application/vnd.openeye.oeb": { "source": "iana" },
  "application/vnd.openofficeorg.extension": { "source": "apache", "extensions": ["oxt"] },
  "application/vnd.openstreetmap.data+xml": { "source": "iana", "compressible": true, "extensions": ["osm"] },
  "application/vnd.opentimestamps.ots": { "source": "iana" },
  "application/vnd.openxmlformats-officedocument.custom-properties+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.customxmlproperties+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.drawing+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.drawingml.chart+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramcolors+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramdata+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramlayout+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramstyle+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.extended-properties+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.presentationml.commentauthors+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.presentationml.comments+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.presentationml.handoutmaster+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.presentationml.notesmaster+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.presentationml.notesslide+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { "source": "iana", "compressible": false, "extensions": ["pptx"] },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.presentationml.presprops+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.presentationml.slide": { "source": "iana", "extensions": ["sldx"] },
  "application/vnd.openxmlformats-officedocument.presentationml.slide+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.presentationml.slidelayout+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.presentationml.slidemaster+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow": { "source": "iana", "extensions": ["ppsx"] },
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.presentationml.slideupdateinfo+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.presentationml.tablestyles+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.presentationml.tags+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.presentationml.template": { "source": "iana", "extensions": ["potx"] },
  "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.presentationml.viewprops+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.calcchain+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.dialogsheet+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.externallink+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcachedefinition+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcacherecords+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivottable+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.querytable+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionheaders+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionlog+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedstrings+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { "source": "iana", "compressible": false, "extensions": ["xlsx"] },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheetmetadata+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.tablesinglecells+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template": { "source": "iana", "extensions": ["xltx"] },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.usernames+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.volatiledependencies+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.theme+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.themeoverride+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.vmldrawing": { "source": "iana" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { "source": "iana", "compressible": false, "extensions": ["docx"] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.fonttable+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template": { "source": "iana", "extensions": ["dotx"] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.websettings+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-package.core-properties+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-package.digital-signature-xmlsignature+xml": { "source": "iana", "compressible": true },
  "application/vnd.openxmlformats-package.relationships+xml": { "source": "iana", "compressible": true },
  "application/vnd.oracle.resource+json": { "source": "iana", "compressible": true },
  "application/vnd.orange.indata": { "source": "iana" },
  "application/vnd.osa.netdeploy": { "source": "iana" },
  "application/vnd.osgeo.mapguide.package": { "source": "iana", "extensions": ["mgp"] },
  "application/vnd.osgi.bundle": { "source": "iana" },
  "application/vnd.osgi.dp": { "source": "iana", "extensions": ["dp"] },
  "application/vnd.osgi.subsystem": { "source": "iana", "extensions": ["esa"] },
  "application/vnd.otps.ct-kip+xml": { "source": "iana", "compressible": true },
  "application/vnd.oxli.countgraph": { "source": "iana" },
  "application/vnd.pagerduty+json": { "source": "iana", "compressible": true },
  "application/vnd.palm": { "source": "iana", "extensions": ["pdb", "pqa", "oprc"] },
  "application/vnd.panoply": { "source": "iana" },
  "application/vnd.paos.xml": { "source": "iana" },
  "application/vnd.patentdive": { "source": "iana" },
  "application/vnd.patientecommsdoc": { "source": "iana" },
  "application/vnd.pawaafile": { "source": "iana", "extensions": ["paw"] },
  "application/vnd.pcos": { "source": "iana" },
  "application/vnd.pg.format": { "source": "iana", "extensions": ["str"] },
  "application/vnd.pg.osasli": { "source": "iana", "extensions": ["ei6"] },
  "application/vnd.piaccess.application-licence": { "source": "iana" },
  "application/vnd.picsel": { "source": "iana", "extensions": ["efif"] },
  "application/vnd.pmi.widget": { "source": "iana", "extensions": ["wg"] },
  "application/vnd.poc.group-advertisement+xml": { "source": "iana", "compressible": true },
  "application/vnd.pocketlearn": { "source": "iana", "extensions": ["plf"] },
  "application/vnd.powerbuilder6": { "source": "iana", "extensions": ["pbd"] },
  "application/vnd.powerbuilder6-s": { "source": "iana" },
  "application/vnd.powerbuilder7": { "source": "iana" },
  "application/vnd.powerbuilder7-s": { "source": "iana" },
  "application/vnd.powerbuilder75": { "source": "iana" },
  "application/vnd.powerbuilder75-s": { "source": "iana" },
  "application/vnd.preminet": { "source": "iana" },
  "application/vnd.previewsystems.box": { "source": "iana", "extensions": ["box"] },
  "application/vnd.proteus.magazine": { "source": "iana", "extensions": ["mgz"] },
  "application/vnd.psfs": { "source": "iana" },
  "application/vnd.publishare-delta-tree": { "source": "iana", "extensions": ["qps"] },
  "application/vnd.pvi.ptid1": { "source": "iana", "extensions": ["ptid"] },
  "application/vnd.pwg-multiplexed": { "source": "iana" },
  "application/vnd.pwg-xhtml-print+xml": { "source": "iana", "compressible": true },
  "application/vnd.qualcomm.brew-app-res": { "source": "iana" },
  "application/vnd.quarantainenet": { "source": "iana" },
  "application/vnd.quark.quarkxpress": { "source": "iana", "extensions": ["qxd", "qxt", "qwd", "qwt", "qxl", "qxb"] },
  "application/vnd.quobject-quoxdocument": { "source": "iana" },
  "application/vnd.radisys.moml+xml": { "source": "iana", "compressible": true },
  "application/vnd.radisys.msml+xml": { "source": "iana", "compressible": true },
  "application/vnd.radisys.msml-audit+xml": { "source": "iana", "compressible": true },
  "application/vnd.radisys.msml-audit-conf+xml": { "source": "iana", "compressible": true },
  "application/vnd.radisys.msml-audit-conn+xml": { "source": "iana", "compressible": true },
  "application/vnd.radisys.msml-audit-dialog+xml": { "source": "iana", "compressible": true },
  "application/vnd.radisys.msml-audit-stream+xml": { "source": "iana", "compressible": true },
  "application/vnd.radisys.msml-conf+xml": { "source": "iana", "compressible": true },
  "application/vnd.radisys.msml-dialog+xml": { "source": "iana", "compressible": true },
  "application/vnd.radisys.msml-dialog-base+xml": { "source": "iana", "compressible": true },
  "application/vnd.radisys.msml-dialog-fax-detect+xml": { "source": "iana", "compressible": true },
  "application/vnd.radisys.msml-dialog-fax-sendrecv+xml": { "source": "iana", "compressible": true },
  "application/vnd.radisys.msml-dialog-group+xml": { "source": "iana", "compressible": true },
  "application/vnd.radisys.msml-dialog-speech+xml": { "source": "iana", "compressible": true },
  "application/vnd.radisys.msml-dialog-transform+xml": { "source": "iana", "compressible": true },
  "application/vnd.rainstor.data": { "source": "iana" },
  "application/vnd.rapid": { "source": "iana" },
  "application/vnd.rar": { "source": "iana", "extensions": ["rar"] },
  "application/vnd.realvnc.bed": { "source": "iana", "extensions": ["bed"] },
  "application/vnd.recordare.musicxml": { "source": "iana", "extensions": ["mxl"] },
  "application/vnd.recordare.musicxml+xml": { "source": "iana", "compressible": true, "extensions": ["musicxml"] },
  "application/vnd.renlearn.rlprint": { "source": "iana" },
  "application/vnd.resilient.logic": { "source": "iana" },
  "application/vnd.restful+json": { "source": "iana", "compressible": true },
  "application/vnd.rig.cryptonote": { "source": "iana", "extensions": ["cryptonote"] },
  "application/vnd.rim.cod": { "source": "apache", "extensions": ["cod"] },
  "application/vnd.rn-realmedia": { "source": "apache", "extensions": ["rm"] },
  "application/vnd.rn-realmedia-vbr": { "source": "apache", "extensions": ["rmvb"] },
  "application/vnd.route66.link66+xml": { "source": "iana", "compressible": true, "extensions": ["link66"] },
  "application/vnd.rs-274x": { "source": "iana" },
  "application/vnd.ruckus.download": { "source": "iana" },
  "application/vnd.s3sms": { "source": "iana" },
  "application/vnd.sailingtracker.track": { "source": "iana", "extensions": ["st"] },
  "application/vnd.sar": { "source": "iana" },
  "application/vnd.sbm.cid": { "source": "iana" },
  "application/vnd.sbm.mid2": { "source": "iana" },
  "application/vnd.scribus": { "source": "iana" },
  "application/vnd.sealed.3df": { "source": "iana" },
  "application/vnd.sealed.csf": { "source": "iana" },
  "application/vnd.sealed.doc": { "source": "iana" },
  "application/vnd.sealed.eml": { "source": "iana" },
  "application/vnd.sealed.mht": { "source": "iana" },
  "application/vnd.sealed.net": { "source": "iana" },
  "application/vnd.sealed.ppt": { "source": "iana" },
  "application/vnd.sealed.tiff": { "source": "iana" },
  "application/vnd.sealed.xls": { "source": "iana" },
  "application/vnd.sealedmedia.softseal.html": { "source": "iana" },
  "application/vnd.sealedmedia.softseal.pdf": { "source": "iana" },
  "application/vnd.seemail": { "source": "iana", "extensions": ["see"] },
  "application/vnd.seis+json": { "source": "iana", "compressible": true },
  "application/vnd.sema": { "source": "iana", "extensions": ["sema"] },
  "application/vnd.semd": { "source": "iana", "extensions": ["semd"] },
  "application/vnd.semf": { "source": "iana", "extensions": ["semf"] },
  "application/vnd.shade-save-file": { "source": "iana" },
  "application/vnd.shana.informed.formdata": { "source": "iana", "extensions": ["ifm"] },
  "application/vnd.shana.informed.formtemplate": { "source": "iana", "extensions": ["itp"] },
  "application/vnd.shana.informed.interchange": { "source": "iana", "extensions": ["iif"] },
  "application/vnd.shana.informed.package": { "source": "iana", "extensions": ["ipk"] },
  "application/vnd.shootproof+json": { "source": "iana", "compressible": true },
  "application/vnd.shopkick+json": { "source": "iana", "compressible": true },
  "application/vnd.shp": { "source": "iana" },
  "application/vnd.shx": { "source": "iana" },
  "application/vnd.sigrok.session": { "source": "iana" },
  "application/vnd.simtech-mindmapper": { "source": "iana", "extensions": ["twd", "twds"] },
  "application/vnd.siren+json": { "source": "iana", "compressible": true },
  "application/vnd.smaf": { "source": "iana", "extensions": ["mmf"] },
  "application/vnd.smart.notebook": { "source": "iana" },
  "application/vnd.smart.teacher": { "source": "iana", "extensions": ["teacher"] },
  "application/vnd.snesdev-page-table": { "source": "iana" },
  "application/vnd.software602.filler.form+xml": { "source": "iana", "compressible": true, "extensions": ["fo"] },
  "application/vnd.software602.filler.form-xml-zip": { "source": "iana" },
  "application/vnd.solent.sdkm+xml": { "source": "iana", "compressible": true, "extensions": ["sdkm", "sdkd"] },
  "application/vnd.spotfire.dxp": { "source": "iana", "extensions": ["dxp"] },
  "application/vnd.spotfire.sfs": { "source": "iana", "extensions": ["sfs"] },
  "application/vnd.sqlite3": { "source": "iana" },
  "application/vnd.sss-cod": { "source": "iana" },
  "application/vnd.sss-dtf": { "source": "iana" },
  "application/vnd.sss-ntf": { "source": "iana" },
  "application/vnd.stardivision.calc": { "source": "apache", "extensions": ["sdc"] },
  "application/vnd.stardivision.draw": { "source": "apache", "extensions": ["sda"] },
  "application/vnd.stardivision.impress": { "source": "apache", "extensions": ["sdd"] },
  "application/vnd.stardivision.math": { "source": "apache", "extensions": ["smf"] },
  "application/vnd.stardivision.writer": { "source": "apache", "extensions": ["sdw", "vor"] },
  "application/vnd.stardivision.writer-global": { "source": "apache", "extensions": ["sgl"] },
  "application/vnd.stepmania.package": { "source": "iana", "extensions": ["smzip"] },
  "application/vnd.stepmania.stepchart": { "source": "iana", "extensions": ["sm"] },
  "application/vnd.street-stream": { "source": "iana" },
  "application/vnd.sun.wadl+xml": { "source": "iana", "compressible": true, "extensions": ["wadl"] },
  "application/vnd.sun.xml.calc": { "source": "apache", "extensions": ["sxc"] },
  "application/vnd.sun.xml.calc.template": { "source": "apache", "extensions": ["stc"] },
  "application/vnd.sun.xml.draw": { "source": "apache", "extensions": ["sxd"] },
  "application/vnd.sun.xml.draw.template": { "source": "apache", "extensions": ["std"] },
  "application/vnd.sun.xml.impress": { "source": "apache", "extensions": ["sxi"] },
  "application/vnd.sun.xml.impress.template": { "source": "apache", "extensions": ["sti"] },
  "application/vnd.sun.xml.math": { "source": "apache", "extensions": ["sxm"] },
  "application/vnd.sun.xml.writer": { "source": "apache", "extensions": ["sxw"] },
  "application/vnd.sun.xml.writer.global": { "source": "apache", "extensions": ["sxg"] },
  "application/vnd.sun.xml.writer.template": { "source": "apache", "extensions": ["stw"] },
  "application/vnd.sus-calendar": { "source": "iana", "extensions": ["sus", "susp"] },
  "application/vnd.svd": { "source": "iana", "extensions": ["svd"] },
  "application/vnd.swiftview-ics": { "source": "iana" },
  "application/vnd.sycle+xml": { "source": "iana", "compressible": true },
  "application/vnd.syft+json": { "source": "iana", "compressible": true },
  "application/vnd.symbian.install": { "source": "apache", "extensions": ["sis", "sisx"] },
  "application/vnd.syncml+xml": { "source": "iana", "charset": "UTF-8", "compressible": true, "extensions": ["xsm"] },
  "application/vnd.syncml.dm+wbxml": { "source": "iana", "charset": "UTF-8", "extensions": ["bdm"] },
  "application/vnd.syncml.dm+xml": { "source": "iana", "charset": "UTF-8", "compressible": true, "extensions": ["xdm"] },
  "application/vnd.syncml.dm.notification": { "source": "iana" },
  "application/vnd.syncml.dmddf+wbxml": { "source": "iana" },
  "application/vnd.syncml.dmddf+xml": { "source": "iana", "charset": "UTF-8", "compressible": true, "extensions": ["ddf"] },
  "application/vnd.syncml.dmtnds+wbxml": { "source": "iana" },
  "application/vnd.syncml.dmtnds+xml": { "source": "iana", "charset": "UTF-8", "compressible": true },
  "application/vnd.syncml.ds.notification": { "source": "iana" },
  "application/vnd.tableschema+json": { "source": "iana", "compressible": true },
  "application/vnd.tao.intent-module-archive": { "source": "iana", "extensions": ["tao"] },
  "application/vnd.tcpdump.pcap": { "source": "iana", "extensions": ["pcap", "cap", "dmp"] },
  "application/vnd.think-cell.ppttc+json": { "source": "iana", "compressible": true },
  "application/vnd.tmd.mediaflex.api+xml": { "source": "iana", "compressible": true },
  "application/vnd.tml": { "source": "iana" },
  "application/vnd.tmobile-livetv": { "source": "iana", "extensions": ["tmo"] },
  "application/vnd.tri.onesource": { "source": "iana" },
  "application/vnd.trid.tpt": { "source": "iana", "extensions": ["tpt"] },
  "application/vnd.triscape.mxs": { "source": "iana", "extensions": ["mxs"] },
  "application/vnd.trueapp": { "source": "iana", "extensions": ["tra"] },
  "application/vnd.truedoc": { "source": "iana" },
  "application/vnd.ubisoft.webplayer": { "source": "iana" },
  "application/vnd.ufdl": { "source": "iana", "extensions": ["ufd", "ufdl"] },
  "application/vnd.uiq.theme": { "source": "iana", "extensions": ["utz"] },
  "application/vnd.umajin": { "source": "iana", "extensions": ["umj"] },
  "application/vnd.unity": { "source": "iana", "extensions": ["unityweb"] },
  "application/vnd.uoml+xml": { "source": "iana", "compressible": true, "extensions": ["uoml"] },
  "application/vnd.uplanet.alert": { "source": "iana" },
  "application/vnd.uplanet.alert-wbxml": { "source": "iana" },
  "application/vnd.uplanet.bearer-choice": { "source": "iana" },
  "application/vnd.uplanet.bearer-choice-wbxml": { "source": "iana" },
  "application/vnd.uplanet.cacheop": { "source": "iana" },
  "application/vnd.uplanet.cacheop-wbxml": { "source": "iana" },
  "application/vnd.uplanet.channel": { "source": "iana" },
  "application/vnd.uplanet.channel-wbxml": { "source": "iana" },
  "application/vnd.uplanet.list": { "source": "iana" },
  "application/vnd.uplanet.list-wbxml": { "source": "iana" },
  "application/vnd.uplanet.listcmd": { "source": "iana" },
  "application/vnd.uplanet.listcmd-wbxml": { "source": "iana" },
  "application/vnd.uplanet.signal": { "source": "iana" },
  "application/vnd.uri-map": { "source": "iana" },
  "application/vnd.valve.source.material": { "source": "iana" },
  "application/vnd.vcx": { "source": "iana", "extensions": ["vcx"] },
  "application/vnd.vd-study": { "source": "iana" },
  "application/vnd.vectorworks": { "source": "iana" },
  "application/vnd.vel+json": { "source": "iana", "compressible": true },
  "application/vnd.verimatrix.vcas": { "source": "iana" },
  "application/vnd.veritone.aion+json": { "source": "iana", "compressible": true },
  "application/vnd.veryant.thin": { "source": "iana" },
  "application/vnd.ves.encrypted": { "source": "iana" },
  "application/vnd.vidsoft.vidconference": { "source": "iana" },
  "application/vnd.visio": { "source": "iana", "extensions": ["vsd", "vst", "vss", "vsw"] },
  "application/vnd.visionary": { "source": "iana", "extensions": ["vis"] },
  "application/vnd.vividence.scriptfile": { "source": "iana" },
  "application/vnd.vsf": { "source": "iana", "extensions": ["vsf"] },
  "application/vnd.wap.sic": { "source": "iana" },
  "application/vnd.wap.slc": { "source": "iana" },
  "application/vnd.wap.wbxml": { "source": "iana", "charset": "UTF-8", "extensions": ["wbxml"] },
  "application/vnd.wap.wmlc": { "source": "iana", "extensions": ["wmlc"] },
  "application/vnd.wap.wmlscriptc": { "source": "iana", "extensions": ["wmlsc"] },
  "application/vnd.webturbo": { "source": "iana", "extensions": ["wtb"] },
  "application/vnd.wfa.dpp": { "source": "iana" },
  "application/vnd.wfa.p2p": { "source": "iana" },
  "application/vnd.wfa.wsc": { "source": "iana" },
  "application/vnd.windows.devicepairing": { "source": "iana" },
  "application/vnd.wmc": { "source": "iana" },
  "application/vnd.wmf.bootstrap": { "source": "iana" },
  "application/vnd.wolfram.mathematica": { "source": "iana" },
  "application/vnd.wolfram.mathematica.package": { "source": "iana" },
  "application/vnd.wolfram.player": { "source": "iana", "extensions": ["nbp"] },
  "application/vnd.wordperfect": { "source": "iana", "extensions": ["wpd"] },
  "application/vnd.wqd": { "source": "iana", "extensions": ["wqd"] },
  "application/vnd.wrq-hp3000-labelled": { "source": "iana" },
  "application/vnd.wt.stf": { "source": "iana", "extensions": ["stf"] },
  "application/vnd.wv.csp+wbxml": { "source": "iana" },
  "application/vnd.wv.csp+xml": { "source": "iana", "compressible": true },
  "application/vnd.wv.ssp+xml": { "source": "iana", "compressible": true },
  "application/vnd.xacml+json": { "source": "iana", "compressible": true },
  "application/vnd.xara": { "source": "iana", "extensions": ["xar"] },
  "application/vnd.xfdl": { "source": "iana", "extensions": ["xfdl"] },
  "application/vnd.xfdl.webform": { "source": "iana" },
  "application/vnd.xmi+xml": { "source": "iana", "compressible": true },
  "application/vnd.xmpie.cpkg": { "source": "iana" },
  "application/vnd.xmpie.dpkg": { "source": "iana" },
  "application/vnd.xmpie.plan": { "source": "iana" },
  "application/vnd.xmpie.ppkg": { "source": "iana" },
  "application/vnd.xmpie.xlim": { "source": "iana" },
  "application/vnd.yamaha.hv-dic": { "source": "iana", "extensions": ["hvd"] },
  "application/vnd.yamaha.hv-script": { "source": "iana", "extensions": ["hvs"] },
  "application/vnd.yamaha.hv-voice": { "source": "iana", "extensions": ["hvp"] },
  "application/vnd.yamaha.openscoreformat": { "source": "iana", "extensions": ["osf"] },
  "application/vnd.yamaha.openscoreformat.osfpvg+xml": { "source": "iana", "compressible": true, "extensions": ["osfpvg"] },
  "application/vnd.yamaha.remote-setup": { "source": "iana" },
  "application/vnd.yamaha.smaf-audio": { "source": "iana", "extensions": ["saf"] },
  "application/vnd.yamaha.smaf-phrase": { "source": "iana", "extensions": ["spf"] },
  "application/vnd.yamaha.through-ngn": { "source": "iana" },
  "application/vnd.yamaha.tunnel-udpencap": { "source": "iana" },
  "application/vnd.yaoweme": { "source": "iana" },
  "application/vnd.yellowriver-custom-menu": { "source": "iana", "extensions": ["cmp"] },
  "application/vnd.youtube.yt": { "source": "iana" },
  "application/vnd.zul": { "source": "iana", "extensions": ["zir", "zirz"] },
  "application/vnd.zzazz.deck+xml": { "source": "iana", "compressible": true, "extensions": ["zaz"] },
  "application/voicexml+xml": { "source": "iana", "compressible": true, "extensions": ["vxml"] },
  "application/voucher-cms+json": { "source": "iana", "compressible": true },
  "application/vq-rtcpxr": { "source": "iana" },
  "application/wasm": { "source": "iana", "compressible": true, "extensions": ["wasm"] },
  "application/watcherinfo+xml": { "source": "iana", "compressible": true, "extensions": ["wif"] },
  "application/webpush-options+json": { "source": "iana", "compressible": true },
  "application/whoispp-query": { "source": "iana" },
  "application/whoispp-response": { "source": "iana" },
  "application/widget": { "source": "iana", "extensions": ["wgt"] },
  "application/winhlp": { "source": "apache", "extensions": ["hlp"] },
  "application/wita": { "source": "iana" },
  "application/wordperfect5.1": { "source": "iana" },
  "application/wsdl+xml": { "source": "iana", "compressible": true, "extensions": ["wsdl"] },
  "application/wspolicy+xml": { "source": "iana", "compressible": true, "extensions": ["wspolicy"] },
  "application/x-7z-compressed": { "source": "apache", "compressible": false, "extensions": ["7z"] },
  "application/x-abiword": { "source": "apache", "extensions": ["abw"] },
  "application/x-ace-compressed": { "source": "apache", "extensions": ["ace"] },
  "application/x-amf": { "source": "apache" },
  "application/x-apple-diskimage": { "source": "apache", "extensions": ["dmg"] },
  "application/x-arj": { "compressible": false, "extensions": ["arj"] },
  "application/x-authorware-bin": { "source": "apache", "extensions": ["aab", "x32", "u32", "vox"] },
  "application/x-authorware-map": { "source": "apache", "extensions": ["aam"] },
  "application/x-authorware-seg": { "source": "apache", "extensions": ["aas"] },
  "application/x-bcpio": { "source": "apache", "extensions": ["bcpio"] },
  "application/x-bdoc": { "compressible": false, "extensions": ["bdoc"] },
  "application/x-bittorrent": { "source": "apache", "extensions": ["torrent"] },
  "application/x-blorb": { "source": "apache", "extensions": ["blb", "blorb"] },
  "application/x-bzip": { "source": "apache", "compressible": false, "extensions": ["bz"] },
  "application/x-bzip2": { "source": "apache", "compressible": false, "extensions": ["bz2", "boz"] },
  "application/x-cbr": { "source": "apache", "extensions": ["cbr", "cba", "cbt", "cbz", "cb7"] },
  "application/x-cdlink": { "source": "apache", "extensions": ["vcd"] },
  "application/x-cfs-compressed": { "source": "apache", "extensions": ["cfs"] },
  "application/x-chat": { "source": "apache", "extensions": ["chat"] },
  "application/x-chess-pgn": { "source": "apache", "extensions": ["pgn"] },
  "application/x-chrome-extension": { "extensions": ["crx"] },
  "application/x-cocoa": { "source": "nginx", "extensions": ["cco"] },
  "application/x-compress": { "source": "apache" },
  "application/x-conference": { "source": "apache", "extensions": ["nsc"] },
  "application/x-cpio": { "source": "apache", "extensions": ["cpio"] },
  "application/x-csh": { "source": "apache", "extensions": ["csh"] },
  "application/x-deb": { "compressible": false },
  "application/x-debian-package": { "source": "apache", "extensions": ["deb", "udeb"] },
  "application/x-dgc-compressed": { "source": "apache", "extensions": ["dgc"] },
  "application/x-director": { "source": "apache", "extensions": ["dir", "dcr", "dxr", "cst", "cct", "cxt", "w3d", "fgd", "swa"] },
  "application/x-doom": { "source": "apache", "extensions": ["wad"] },
  "application/x-dtbncx+xml": { "source": "apache", "compressible": true, "extensions": ["ncx"] },
  "application/x-dtbook+xml": { "source": "apache", "compressible": true, "extensions": ["dtb"] },
  "application/x-dtbresource+xml": { "source": "apache", "compressible": true, "extensions": ["res"] },
  "application/x-dvi": { "source": "apache", "compressible": false, "extensions": ["dvi"] },
  "application/x-envoy": { "source": "apache", "extensions": ["evy"] },
  "application/x-eva": { "source": "apache", "extensions": ["eva"] },
  "application/x-font-bdf": { "source": "apache", "extensions": ["bdf"] },
  "application/x-font-dos": { "source": "apache" },
  "application/x-font-framemaker": { "source": "apache" },
  "application/x-font-ghostscript": { "source": "apache", "extensions": ["gsf"] },
  "application/x-font-libgrx": { "source": "apache" },
  "application/x-font-linux-psf": { "source": "apache", "extensions": ["psf"] },
  "application/x-font-pcf": { "source": "apache", "extensions": ["pcf"] },
  "application/x-font-snf": { "source": "apache", "extensions": ["snf"] },
  "application/x-font-speedo": { "source": "apache" },
  "application/x-font-sunos-news": { "source": "apache" },
  "application/x-font-type1": { "source": "apache", "extensions": ["pfa", "pfb", "pfm", "afm"] },
  "application/x-font-vfont": { "source": "apache" },
  "application/x-freearc": { "source": "apache", "extensions": ["arc"] },
  "application/x-futuresplash": { "source": "apache", "extensions": ["spl"] },
  "application/x-gca-compressed": { "source": "apache", "extensions": ["gca"] },
  "application/x-glulx": { "source": "apache", "extensions": ["ulx"] },
  "application/x-gnumeric": { "source": "apache", "extensions": ["gnumeric"] },
  "application/x-gramps-xml": { "source": "apache", "extensions": ["gramps"] },
  "application/x-gtar": { "source": "apache", "extensions": ["gtar"] },
  "application/x-gzip": { "source": "apache" },
  "application/x-hdf": { "source": "apache", "extensions": ["hdf"] },
  "application/x-httpd-php": { "compressible": true, "extensions": ["php"] },
  "application/x-install-instructions": { "source": "apache", "extensions": ["install"] },
  "application/x-iso9660-image": { "source": "apache", "extensions": ["iso"] },
  "application/x-iwork-keynote-sffkey": { "extensions": ["key"] },
  "application/x-iwork-numbers-sffnumbers": { "extensions": ["numbers"] },
  "application/x-iwork-pages-sffpages": { "extensions": ["pages"] },
  "application/x-java-archive-diff": { "source": "nginx", "extensions": ["jardiff"] },
  "application/x-java-jnlp-file": { "source": "apache", "compressible": false, "extensions": ["jnlp"] },
  "application/x-javascript": { "compressible": true },
  "application/x-keepass2": { "extensions": ["kdbx"] },
  "application/x-latex": { "source": "apache", "compressible": false, "extensions": ["latex"] },
  "application/x-lua-bytecode": { "extensions": ["luac"] },
  "application/x-lzh-compressed": { "source": "apache", "extensions": ["lzh", "lha"] },
  "application/x-makeself": { "source": "nginx", "extensions": ["run"] },
  "application/x-mie": { "source": "apache", "extensions": ["mie"] },
  "application/x-mobipocket-ebook": { "source": "apache", "extensions": ["prc", "mobi"] },
  "application/x-mpegurl": { "compressible": false },
  "application/x-ms-application": { "source": "apache", "extensions": ["application"] },
  "application/x-ms-shortcut": { "source": "apache", "extensions": ["lnk"] },
  "application/x-ms-wmd": { "source": "apache", "extensions": ["wmd"] },
  "application/x-ms-wmz": { "source": "apache", "extensions": ["wmz"] },
  "application/x-ms-xbap": { "source": "apache", "extensions": ["xbap"] },
  "application/x-msaccess": { "source": "apache", "extensions": ["mdb"] },
  "application/x-msbinder": { "source": "apache", "extensions": ["obd"] },
  "application/x-mscardfile": { "source": "apache", "extensions": ["crd"] },
  "application/x-msclip": { "source": "apache", "extensions": ["clp"] },
  "application/x-msdos-program": { "extensions": ["exe"] },
  "application/x-msdownload": { "source": "apache", "extensions": ["exe", "dll", "com", "bat", "msi"] },
  "application/x-msmediaview": { "source": "apache", "extensions": ["mvb", "m13", "m14"] },
  "application/x-msmetafile": { "source": "apache", "extensions": ["wmf", "wmz", "emf", "emz"] },
  "application/x-msmoney": { "source": "apache", "extensions": ["mny"] },
  "application/x-mspublisher": { "source": "apache", "extensions": ["pub"] },
  "application/x-msschedule": { "source": "apache", "extensions": ["scd"] },
  "application/x-msterminal": { "source": "apache", "extensions": ["trm"] },
  "application/x-mswrite": { "source": "apache", "extensions": ["wri"] },
  "application/x-netcdf": { "source": "apache", "extensions": ["nc", "cdf"] },
  "application/x-ns-proxy-autoconfig": { "compressible": true, "extensions": ["pac"] },
  "application/x-nzb": { "source": "apache", "extensions": ["nzb"] },
  "application/x-perl": { "source": "nginx", "extensions": ["pl", "pm"] },
  "application/x-pilot": { "source": "nginx", "extensions": ["prc", "pdb"] },
  "application/x-pkcs12": { "source": "apache", "compressible": false, "extensions": ["p12", "pfx"] },
  "application/x-pkcs7-certificates": { "source": "apache", "extensions": ["p7b", "spc"] },
  "application/x-pkcs7-certreqresp": { "source": "apache", "extensions": ["p7r"] },
  "application/x-pki-message": { "source": "iana" },
  "application/x-rar-compressed": { "source": "apache", "compressible": false, "extensions": ["rar"] },
  "application/x-redhat-package-manager": { "source": "nginx", "extensions": ["rpm"] },
  "application/x-research-info-systems": { "source": "apache", "extensions": ["ris"] },
  "application/x-sea": { "source": "nginx", "extensions": ["sea"] },
  "application/x-sh": { "source": "apache", "compressible": true, "extensions": ["sh"] },
  "application/x-shar": { "source": "apache", "extensions": ["shar"] },
  "application/x-shockwave-flash": { "source": "apache", "compressible": false, "extensions": ["swf"] },
  "application/x-silverlight-app": { "source": "apache", "extensions": ["xap"] },
  "application/x-sql": { "source": "apache", "extensions": ["sql"] },
  "application/x-stuffit": { "source": "apache", "compressible": false, "extensions": ["sit"] },
  "application/x-stuffitx": { "source": "apache", "extensions": ["sitx"] },
  "application/x-subrip": { "source": "apache", "extensions": ["srt"] },
  "application/x-sv4cpio": { "source": "apache", "extensions": ["sv4cpio"] },
  "application/x-sv4crc": { "source": "apache", "extensions": ["sv4crc"] },
  "application/x-t3vm-image": { "source": "apache", "extensions": ["t3"] },
  "application/x-tads": { "source": "apache", "extensions": ["gam"] },
  "application/x-tar": { "source": "apache", "compressible": true, "extensions": ["tar"] },
  "application/x-tcl": { "source": "apache", "extensions": ["tcl", "tk"] },
  "application/x-tex": { "source": "apache", "extensions": ["tex"] },
  "application/x-tex-tfm": { "source": "apache", "extensions": ["tfm"] },
  "application/x-texinfo": { "source": "apache", "extensions": ["texinfo", "texi"] },
  "application/x-tgif": { "source": "apache", "extensions": ["obj"] },
  "application/x-ustar": { "source": "apache", "extensions": ["ustar"] },
  "application/x-virtualbox-hdd": { "compressible": true, "extensions": ["hdd"] },
  "application/x-virtualbox-ova": { "compressible": true, "extensions": ["ova"] },
  "application/x-virtualbox-ovf": { "compressible": true, "extensions": ["ovf"] },
  "application/x-virtualbox-vbox": { "compressible": true, "extensions": ["vbox"] },
  "application/x-virtualbox-vbox-extpack": { "compressible": false, "extensions": ["vbox-extpack"] },
  "application/x-virtualbox-vdi": { "compressible": true, "extensions": ["vdi"] },
  "application/x-virtualbox-vhd": { "compressible": true, "extensions": ["vhd"] },
  "application/x-virtualbox-vmdk": { "compressible": true, "extensions": ["vmdk"] },
  "application/x-wais-source": { "source": "apache", "extensions": ["src"] },
  "application/x-web-app-manifest+json": { "compressible": true, "extensions": ["webapp"] },
  "application/x-www-form-urlencoded": { "source": "iana", "compressible": true },
  "application/x-x509-ca-cert": { "source": "iana", "extensions": ["der", "crt", "pem"] },
  "application/x-x509-ca-ra-cert": { "source": "iana" },
  "application/x-x509-next-ca-cert": { "source": "iana" },
  "application/x-xfig": { "source": "apache", "extensions": ["fig"] },
  "application/x-xliff+xml": { "source": "apache", "compressible": true, "extensions": ["xlf"] },
  "application/x-xpinstall": { "source": "apache", "compressible": false, "extensions": ["xpi"] },
  "application/x-xz": { "source": "apache", "extensions": ["xz"] },
  "application/x-zmachine": { "source": "apache", "extensions": ["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8"] },
  "application/x400-bp": { "source": "iana" },
  "application/xacml+xml": { "source": "iana", "compressible": true },
  "application/xaml+xml": { "source": "apache", "compressible": true, "extensions": ["xaml"] },
  "application/xcap-att+xml": { "source": "iana", "compressible": true, "extensions": ["xav"] },
  "application/xcap-caps+xml": { "source": "iana", "compressible": true, "extensions": ["xca"] },
  "application/xcap-diff+xml": { "source": "iana", "compressible": true, "extensions": ["xdf"] },
  "application/xcap-el+xml": { "source": "iana", "compressible": true, "extensions": ["xel"] },
  "application/xcap-error+xml": { "source": "iana", "compressible": true },
  "application/xcap-ns+xml": { "source": "iana", "compressible": true, "extensions": ["xns"] },
  "application/xcon-conference-info+xml": { "source": "iana", "compressible": true },
  "application/xcon-conference-info-diff+xml": { "source": "iana", "compressible": true },
  "application/xenc+xml": { "source": "iana", "compressible": true, "extensions": ["xenc"] },
  "application/xhtml+xml": { "source": "iana", "compressible": true, "extensions": ["xhtml", "xht"] },
  "application/xhtml-voice+xml": { "source": "apache", "compressible": true },
  "application/xliff+xml": { "source": "iana", "compressible": true, "extensions": ["xlf"] },
  "application/xml": { "source": "iana", "compressible": true, "extensions": ["xml", "xsl", "xsd", "rng"] },
  "application/xml-dtd": { "source": "iana", "compressible": true, "extensions": ["dtd"] },
  "application/xml-external-parsed-entity": { "source": "iana" },
  "application/xml-patch+xml": { "source": "iana", "compressible": true },
  "application/xmpp+xml": { "source": "iana", "compressible": true },
  "application/xop+xml": { "source": "iana", "compressible": true, "extensions": ["xop"] },
  "application/xproc+xml": { "source": "apache", "compressible": true, "extensions": ["xpl"] },
  "application/xslt+xml": { "source": "iana", "compressible": true, "extensions": ["xsl", "xslt"] },
  "application/xspf+xml": { "source": "apache", "compressible": true, "extensions": ["xspf"] },
  "application/xv+xml": { "source": "iana", "compressible": true, "extensions": ["mxml", "xhvml", "xvml", "xvm"] },
  "application/yang": { "source": "iana", "extensions": ["yang"] },
  "application/yang-data+json": { "source": "iana", "compressible": true },
  "application/yang-data+xml": { "source": "iana", "compressible": true },
  "application/yang-patch+json": { "source": "iana", "compressible": true },
  "application/yang-patch+xml": { "source": "iana", "compressible": true },
  "application/yin+xml": { "source": "iana", "compressible": true, "extensions": ["yin"] },
  "application/zip": { "source": "iana", "compressible": false, "extensions": ["zip"] },
  "application/zlib": { "source": "iana" },
  "application/zstd": { "source": "iana" },
  "audio/1d-interleaved-parityfec": { "source": "iana" },
  "audio/32kadpcm": { "source": "iana" },
  "audio/3gpp": { "source": "iana", "compressible": false, "extensions": ["3gpp"] },
  "audio/3gpp2": { "source": "iana" },
  "audio/aac": { "source": "iana" },
  "audio/ac3": { "source": "iana" },
  "audio/adpcm": { "source": "apache", "extensions": ["adp"] },
  "audio/amr": { "source": "iana", "extensions": ["amr"] },
  "audio/amr-wb": { "source": "iana" },
  "audio/amr-wb+": { "source": "iana" },
  "audio/aptx": { "source": "iana" },
  "audio/asc": { "source": "iana" },
  "audio/atrac-advanced-lossless": { "source": "iana" },
  "audio/atrac-x": { "source": "iana" },
  "audio/atrac3": { "source": "iana" },
  "audio/basic": { "source": "iana", "compressible": false, "extensions": ["au", "snd"] },
  "audio/bv16": { "source": "iana" },
  "audio/bv32": { "source": "iana" },
  "audio/clearmode": { "source": "iana" },
  "audio/cn": { "source": "iana" },
  "audio/dat12": { "source": "iana" },
  "audio/dls": { "source": "iana" },
  "audio/dsr-es201108": { "source": "iana" },
  "audio/dsr-es202050": { "source": "iana" },
  "audio/dsr-es202211": { "source": "iana" },
  "audio/dsr-es202212": { "source": "iana" },
  "audio/dv": { "source": "iana" },
  "audio/dvi4": { "source": "iana" },
  "audio/eac3": { "source": "iana" },
  "audio/encaprtp": { "source": "iana" },
  "audio/evrc": { "source": "iana" },
  "audio/evrc-qcp": { "source": "iana" },
  "audio/evrc0": { "source": "iana" },
  "audio/evrc1": { "source": "iana" },
  "audio/evrcb": { "source": "iana" },
  "audio/evrcb0": { "source": "iana" },
  "audio/evrcb1": { "source": "iana" },
  "audio/evrcnw": { "source": "iana" },
  "audio/evrcnw0": { "source": "iana" },
  "audio/evrcnw1": { "source": "iana" },
  "audio/evrcwb": { "source": "iana" },
  "audio/evrcwb0": { "source": "iana" },
  "audio/evrcwb1": { "source": "iana" },
  "audio/evs": { "source": "iana" },
  "audio/flexfec": { "source": "iana" },
  "audio/fwdred": { "source": "iana" },
  "audio/g711-0": { "source": "iana" },
  "audio/g719": { "source": "iana" },
  "audio/g722": { "source": "iana" },
  "audio/g7221": { "source": "iana" },
  "audio/g723": { "source": "iana" },
  "audio/g726-16": { "source": "iana" },
  "audio/g726-24": { "source": "iana" },
  "audio/g726-32": { "source": "iana" },
  "audio/g726-40": { "source": "iana" },
  "audio/g728": { "source": "iana" },
  "audio/g729": { "source": "iana" },
  "audio/g7291": { "source": "iana" },
  "audio/g729d": { "source": "iana" },
  "audio/g729e": { "source": "iana" },
  "audio/gsm": { "source": "iana" },
  "audio/gsm-efr": { "source": "iana" },
  "audio/gsm-hr-08": { "source": "iana" },
  "audio/ilbc": { "source": "iana" },
  "audio/ip-mr_v2.5": { "source": "iana" },
  "audio/isac": { "source": "apache" },
  "audio/l16": { "source": "iana" },
  "audio/l20": { "source": "iana" },
  "audio/l24": { "source": "iana", "compressible": false },
  "audio/l8": { "source": "iana" },
  "audio/lpc": { "source": "iana" },
  "audio/melp": { "source": "iana" },
  "audio/melp1200": { "source": "iana" },
  "audio/melp2400": { "source": "iana" },
  "audio/melp600": { "source": "iana" },
  "audio/mhas": { "source": "iana" },
  "audio/midi": { "source": "apache", "extensions": ["mid", "midi", "kar", "rmi"] },
  "audio/mobile-xmf": { "source": "iana", "extensions": ["mxmf"] },
  "audio/mp3": { "compressible": false, "extensions": ["mp3"] },
  "audio/mp4": { "source": "iana", "compressible": false, "extensions": ["m4a", "mp4a"] },
  "audio/mp4a-latm": { "source": "iana" },
  "audio/mpa": { "source": "iana" },
  "audio/mpa-robust": { "source": "iana" },
  "audio/mpeg": { "source": "iana", "compressible": false, "extensions": ["mpga", "mp2", "mp2a", "mp3", "m2a", "m3a"] },
  "audio/mpeg4-generic": { "source": "iana" },
  "audio/musepack": { "source": "apache" },
  "audio/ogg": { "source": "iana", "compressible": false, "extensions": ["oga", "ogg", "spx", "opus"] },
  "audio/opus": { "source": "iana" },
  "audio/parityfec": { "source": "iana" },
  "audio/pcma": { "source": "iana" },
  "audio/pcma-wb": { "source": "iana" },
  "audio/pcmu": { "source": "iana" },
  "audio/pcmu-wb": { "source": "iana" },
  "audio/prs.sid": { "source": "iana" },
  "audio/qcelp": { "source": "iana" },
  "audio/raptorfec": { "source": "iana" },
  "audio/red": { "source": "iana" },
  "audio/rtp-enc-aescm128": { "source": "iana" },
  "audio/rtp-midi": { "source": "iana" },
  "audio/rtploopback": { "source": "iana" },
  "audio/rtx": { "source": "iana" },
  "audio/s3m": { "source": "apache", "extensions": ["s3m"] },
  "audio/scip": { "source": "iana" },
  "audio/silk": { "source": "apache", "extensions": ["sil"] },
  "audio/smv": { "source": "iana" },
  "audio/smv-qcp": { "source": "iana" },
  "audio/smv0": { "source": "iana" },
  "audio/sofa": { "source": "iana" },
  "audio/sp-midi": { "source": "iana" },
  "audio/speex": { "source": "iana" },
  "audio/t140c": { "source": "iana" },
  "audio/t38": { "source": "iana" },
  "audio/telephone-event": { "source": "iana" },
  "audio/tetra_acelp": { "source": "iana" },
  "audio/tetra_acelp_bb": { "source": "iana" },
  "audio/tone": { "source": "iana" },
  "audio/tsvcis": { "source": "iana" },
  "audio/uemclip": { "source": "iana" },
  "audio/ulpfec": { "source": "iana" },
  "audio/usac": { "source": "iana" },
  "audio/vdvi": { "source": "iana" },
  "audio/vmr-wb": { "source": "iana" },
  "audio/vnd.3gpp.iufp": { "source": "iana" },
  "audio/vnd.4sb": { "source": "iana" },
  "audio/vnd.audiokoz": { "source": "iana" },
  "audio/vnd.celp": { "source": "iana" },
  "audio/vnd.cisco.nse": { "source": "iana" },
  "audio/vnd.cmles.radio-events": { "source": "iana" },
  "audio/vnd.cns.anp1": { "source": "iana" },
  "audio/vnd.cns.inf1": { "source": "iana" },
  "audio/vnd.dece.audio": { "source": "iana", "extensions": ["uva", "uvva"] },
  "audio/vnd.digital-winds": { "source": "iana", "extensions": ["eol"] },
  "audio/vnd.dlna.adts": { "source": "iana" },
  "audio/vnd.dolby.heaac.1": { "source": "iana" },
  "audio/vnd.dolby.heaac.2": { "source": "iana" },
  "audio/vnd.dolby.mlp": { "source": "iana" },
  "audio/vnd.dolby.mps": { "source": "iana" },
  "audio/vnd.dolby.pl2": { "source": "iana" },
  "audio/vnd.dolby.pl2x": { "source": "iana" },
  "audio/vnd.dolby.pl2z": { "source": "iana" },
  "audio/vnd.dolby.pulse.1": { "source": "iana" },
  "audio/vnd.dra": { "source": "iana", "extensions": ["dra"] },
  "audio/vnd.dts": { "source": "iana", "extensions": ["dts"] },
  "audio/vnd.dts.hd": { "source": "iana", "extensions": ["dtshd"] },
  "audio/vnd.dts.uhd": { "source": "iana" },
  "audio/vnd.dvb.file": { "source": "iana" },
  "audio/vnd.everad.plj": { "source": "iana" },
  "audio/vnd.hns.audio": { "source": "iana" },
  "audio/vnd.lucent.voice": { "source": "iana", "extensions": ["lvp"] },
  "audio/vnd.ms-playready.media.pya": { "source": "iana", "extensions": ["pya"] },
  "audio/vnd.nokia.mobile-xmf": { "source": "iana" },
  "audio/vnd.nortel.vbk": { "source": "iana" },
  "audio/vnd.nuera.ecelp4800": { "source": "iana", "extensions": ["ecelp4800"] },
  "audio/vnd.nuera.ecelp7470": { "source": "iana", "extensions": ["ecelp7470"] },
  "audio/vnd.nuera.ecelp9600": { "source": "iana", "extensions": ["ecelp9600"] },
  "audio/vnd.octel.sbc": { "source": "iana" },
  "audio/vnd.presonus.multitrack": { "source": "iana" },
  "audio/vnd.qcelp": { "source": "iana" },
  "audio/vnd.rhetorex.32kadpcm": { "source": "iana" },
  "audio/vnd.rip": { "source": "iana", "extensions": ["rip"] },
  "audio/vnd.rn-realaudio": { "compressible": false },
  "audio/vnd.sealedmedia.softseal.mpeg": { "source": "iana" },
  "audio/vnd.vmx.cvsd": { "source": "iana" },
  "audio/vnd.wave": { "compressible": false },
  "audio/vorbis": { "source": "iana", "compressible": false },
  "audio/vorbis-config": { "source": "iana" },
  "audio/wav": { "compressible": false, "extensions": ["wav"] },
  "audio/wave": { "compressible": false, "extensions": ["wav"] },
  "audio/webm": { "source": "apache", "compressible": false, "extensions": ["weba"] },
  "audio/x-aac": { "source": "apache", "compressible": false, "extensions": ["aac"] },
  "audio/x-aiff": { "source": "apache", "extensions": ["aif", "aiff", "aifc"] },
  "audio/x-caf": { "source": "apache", "compressible": false, "extensions": ["caf"] },
  "audio/x-flac": { "source": "apache", "extensions": ["flac"] },
  "audio/x-m4a": { "source": "nginx", "extensions": ["m4a"] },
  "audio/x-matroska": { "source": "apache", "extensions": ["mka"] },
  "audio/x-mpegurl": { "source": "apache", "extensions": ["m3u"] },
  "audio/x-ms-wax": { "source": "apache", "extensions": ["wax"] },
  "audio/x-ms-wma": { "source": "apache", "extensions": ["wma"] },
  "audio/x-pn-realaudio": { "source": "apache", "extensions": ["ram", "ra"] },
  "audio/x-pn-realaudio-plugin": { "source": "apache", "extensions": ["rmp"] },
  "audio/x-realaudio": { "source": "nginx", "extensions": ["ra"] },
  "audio/x-tta": { "source": "apache" },
  "audio/x-wav": { "source": "apache", "extensions": ["wav"] },
  "audio/xm": { "source": "apache", "extensions": ["xm"] },
  "chemical/x-cdx": { "source": "apache", "extensions": ["cdx"] },
  "chemical/x-cif": { "source": "apache", "extensions": ["cif"] },
  "chemical/x-cmdf": { "source": "apache", "extensions": ["cmdf"] },
  "chemical/x-cml": { "source": "apache", "extensions": ["cml"] },
  "chemical/x-csml": { "source": "apache", "extensions": ["csml"] },
  "chemical/x-pdb": { "source": "apache" },
  "chemical/x-xyz": { "source": "apache", "extensions": ["xyz"] },
  "font/collection": { "source": "iana", "extensions": ["ttc"] },
  "font/otf": { "source": "iana", "compressible": true, "extensions": ["otf"] },
  "font/sfnt": { "source": "iana" },
  "font/ttf": { "source": "iana", "compressible": true, "extensions": ["ttf"] },
  "font/woff": { "source": "iana", "extensions": ["woff"] },
  "font/woff2": { "source": "iana", "extensions": ["woff2"] },
  "image/aces": { "source": "iana", "extensions": ["exr"] },
  "image/apng": { "compressible": false, "extensions": ["apng"] },
  "image/avci": { "source": "iana", "extensions": ["avci"] },
  "image/avcs": { "source": "iana", "extensions": ["avcs"] },
  "image/avif": { "source": "iana", "compressible": false, "extensions": ["avif"] },
  "image/bmp": { "source": "iana", "compressible": true, "extensions": ["bmp"] },
  "image/cgm": { "source": "iana", "extensions": ["cgm"] },
  "image/dicom-rle": { "source": "iana", "extensions": ["drle"] },
  "image/emf": { "source": "iana", "extensions": ["emf"] },
  "image/fits": { "source": "iana", "extensions": ["fits"] },
  "image/g3fax": { "source": "iana", "extensions": ["g3"] },
  "image/gif": { "source": "iana", "compressible": false, "extensions": ["gif"] },
  "image/heic": { "source": "iana", "extensions": ["heic"] },
  "image/heic-sequence": { "source": "iana", "extensions": ["heics"] },
  "image/heif": { "source": "iana", "extensions": ["heif"] },
  "image/heif-sequence": { "source": "iana", "extensions": ["heifs"] },
  "image/hej2k": { "source": "iana", "extensions": ["hej2"] },
  "image/hsj2": { "source": "iana", "extensions": ["hsj2"] },
  "image/ief": { "source": "iana", "extensions": ["ief"] },
  "image/jls": { "source": "iana", "extensions": ["jls"] },
  "image/jp2": { "source": "iana", "compressible": false, "extensions": ["jp2", "jpg2"] },
  "image/jpeg": { "source": "iana", "compressible": false, "extensions": ["jpeg", "jpg", "jpe"] },
  "image/jph": { "source": "iana", "extensions": ["jph"] },
  "image/jphc": { "source": "iana", "extensions": ["jhc"] },
  "image/jpm": { "source": "iana", "compressible": false, "extensions": ["jpm"] },
  "image/jpx": { "source": "iana", "compressible": false, "extensions": ["jpx", "jpf"] },
  "image/jxr": { "source": "iana", "extensions": ["jxr"] },
  "image/jxra": { "source": "iana", "extensions": ["jxra"] },
  "image/jxrs": { "source": "iana", "extensions": ["jxrs"] },
  "image/jxs": { "source": "iana", "extensions": ["jxs"] },
  "image/jxsc": { "source": "iana", "extensions": ["jxsc"] },
  "image/jxsi": { "source": "iana", "extensions": ["jxsi"] },
  "image/jxss": { "source": "iana", "extensions": ["jxss"] },
  "image/ktx": { "source": "iana", "extensions": ["ktx"] },
  "image/ktx2": { "source": "iana", "extensions": ["ktx2"] },
  "image/naplps": { "source": "iana" },
  "image/pjpeg": { "compressible": false },
  "image/png": { "source": "iana", "compressible": false, "extensions": ["png"] },
  "image/prs.btif": { "source": "iana", "extensions": ["btif"] },
  "image/prs.pti": { "source": "iana", "extensions": ["pti"] },
  "image/pwg-raster": { "source": "iana" },
  "image/sgi": { "source": "apache", "extensions": ["sgi"] },
  "image/svg+xml": { "source": "iana", "compressible": true, "extensions": ["svg", "svgz"] },
  "image/t38": { "source": "iana", "extensions": ["t38"] },
  "image/tiff": { "source": "iana", "compressible": false, "extensions": ["tif", "tiff"] },
  "image/tiff-fx": { "source": "iana", "extensions": ["tfx"] },
  "image/vnd.adobe.photoshop": { "source": "iana", "compressible": true, "extensions": ["psd"] },
  "image/vnd.airzip.accelerator.azv": { "source": "iana", "extensions": ["azv"] },
  "image/vnd.cns.inf2": { "source": "iana" },
  "image/vnd.dece.graphic": { "source": "iana", "extensions": ["uvi", "uvvi", "uvg", "uvvg"] },
  "image/vnd.djvu": { "source": "iana", "extensions": ["djvu", "djv"] },
  "image/vnd.dvb.subtitle": { "source": "iana", "extensions": ["sub"] },
  "image/vnd.dwg": { "source": "iana", "extensions": ["dwg"] },
  "image/vnd.dxf": { "source": "iana", "extensions": ["dxf"] },
  "image/vnd.fastbidsheet": { "source": "iana", "extensions": ["fbs"] },
  "image/vnd.fpx": { "source": "iana", "extensions": ["fpx"] },
  "image/vnd.fst": { "source": "iana", "extensions": ["fst"] },
  "image/vnd.fujixerox.edmics-mmr": { "source": "iana", "extensions": ["mmr"] },
  "image/vnd.fujixerox.edmics-rlc": { "source": "iana", "extensions": ["rlc"] },
  "image/vnd.globalgraphics.pgb": { "source": "iana" },
  "image/vnd.microsoft.icon": { "source": "iana", "compressible": true, "extensions": ["ico"] },
  "image/vnd.mix": { "source": "iana" },
  "image/vnd.mozilla.apng": { "source": "iana" },
  "image/vnd.ms-dds": { "compressible": true, "extensions": ["dds"] },
  "image/vnd.ms-modi": { "source": "iana", "extensions": ["mdi"] },
  "image/vnd.ms-photo": { "source": "apache", "extensions": ["wdp"] },
  "image/vnd.net-fpx": { "source": "iana", "extensions": ["npx"] },
  "image/vnd.pco.b16": { "source": "iana", "extensions": ["b16"] },
  "image/vnd.radiance": { "source": "iana" },
  "image/vnd.sealed.png": { "source": "iana" },
  "image/vnd.sealedmedia.softseal.gif": { "source": "iana" },
  "image/vnd.sealedmedia.softseal.jpg": { "source": "iana" },
  "image/vnd.svf": { "source": "iana" },
  "image/vnd.tencent.tap": { "source": "iana", "extensions": ["tap"] },
  "image/vnd.valve.source.texture": { "source": "iana", "extensions": ["vtf"] },
  "image/vnd.wap.wbmp": { "source": "iana", "extensions": ["wbmp"] },
  "image/vnd.xiff": { "source": "iana", "extensions": ["xif"] },
  "image/vnd.zbrush.pcx": { "source": "iana", "extensions": ["pcx"] },
  "image/webp": { "source": "apache", "extensions": ["webp"] },
  "image/wmf": { "source": "iana", "extensions": ["wmf"] },
  "image/x-3ds": { "source": "apache", "extensions": ["3ds"] },
  "image/x-cmu-raster": { "source": "apache", "extensions": ["ras"] },
  "image/x-cmx": { "source": "apache", "extensions": ["cmx"] },
  "image/x-freehand": { "source": "apache", "extensions": ["fh", "fhc", "fh4", "fh5", "fh7"] },
  "image/x-icon": { "source": "apache", "compressible": true, "extensions": ["ico"] },
  "image/x-jng": { "source": "nginx", "extensions": ["jng"] },
  "image/x-mrsid-image": { "source": "apache", "extensions": ["sid"] },
  "image/x-ms-bmp": { "source": "nginx", "compressible": true, "extensions": ["bmp"] },
  "image/x-pcx": { "source": "apache", "extensions": ["pcx"] },
  "image/x-pict": { "source": "apache", "extensions": ["pic", "pct"] },
  "image/x-portable-anymap": { "source": "apache", "extensions": ["pnm"] },
  "image/x-portable-bitmap": { "source": "apache", "extensions": ["pbm"] },
  "image/x-portable-graymap": { "source": "apache", "extensions": ["pgm"] },
  "image/x-portable-pixmap": { "source": "apache", "extensions": ["ppm"] },
  "image/x-rgb": { "source": "apache", "extensions": ["rgb"] },
  "image/x-tga": { "source": "apache", "extensions": ["tga"] },
  "image/x-xbitmap": { "source": "apache", "extensions": ["xbm"] },
  "image/x-xcf": { "compressible": false },
  "image/x-xpixmap": { "source": "apache", "extensions": ["xpm"] },
  "image/x-xwindowdump": { "source": "apache", "extensions": ["xwd"] },
  "message/cpim": { "source": "iana" },
  "message/delivery-status": { "source": "iana" },
  "message/disposition-notification": { "source": "iana", "extensions": ["disposition-notification"] },
  "message/external-body": { "source": "iana" },
  "message/feedback-report": { "source": "iana" },
  "message/global": { "source": "iana", "extensions": ["u8msg"] },
  "message/global-delivery-status": { "source": "iana", "extensions": ["u8dsn"] },
  "message/global-disposition-notification": { "source": "iana", "extensions": ["u8mdn"] },
  "message/global-headers": { "source": "iana", "extensions": ["u8hdr"] },
  "message/http": { "source": "iana", "compressible": false },
  "message/imdn+xml": { "source": "iana", "compressible": true },
  "message/news": { "source": "iana" },
  "message/partial": { "source": "iana", "compressible": false },
  "message/rfc822": { "source": "iana", "compressible": true, "extensions": ["eml", "mime"] },
  "message/s-http": { "source": "iana" },
  "message/sip": { "source": "iana" },
  "message/sipfrag": { "source": "iana" },
  "message/tracking-status": { "source": "iana" },
  "message/vnd.si.simp": { "source": "iana" },
  "message/vnd.wfa.wsc": { "source": "iana", "extensions": ["wsc"] },
  "model/3mf": { "source": "iana", "extensions": ["3mf"] },
  "model/e57": { "source": "iana" },
  "model/gltf+json": { "source": "iana", "compressible": true, "extensions": ["gltf"] },
  "model/gltf-binary": { "source": "iana", "compressible": true, "extensions": ["glb"] },
  "model/iges": { "source": "iana", "compressible": false, "extensions": ["igs", "iges"] },
  "model/mesh": { "source": "iana", "compressible": false, "extensions": ["msh", "mesh", "silo"] },
  "model/mtl": { "source": "iana", "extensions": ["mtl"] },
  "model/obj": { "source": "iana", "extensions": ["obj"] },
  "model/step": { "source": "iana" },
  "model/step+xml": { "source": "iana", "compressible": true, "extensions": ["stpx"] },
  "model/step+zip": { "source": "iana", "compressible": false, "extensions": ["stpz"] },
  "model/step-xml+zip": { "source": "iana", "compressible": false, "extensions": ["stpxz"] },
  "model/stl": { "source": "iana", "extensions": ["stl"] },
  "model/vnd.collada+xml": { "source": "iana", "compressible": true, "extensions": ["dae"] },
  "model/vnd.dwf": { "source": "iana", "extensions": ["dwf"] },
  "model/vnd.flatland.3dml": { "source": "iana" },
  "model/vnd.gdl": { "source": "iana", "extensions": ["gdl"] },
  "model/vnd.gs-gdl": { "source": "apache" },
  "model/vnd.gs.gdl": { "source": "iana" },
  "model/vnd.gtw": { "source": "iana", "extensions": ["gtw"] },
  "model/vnd.moml+xml": { "source": "iana", "compressible": true },
  "model/vnd.mts": { "source": "iana", "extensions": ["mts"] },
  "model/vnd.opengex": { "source": "iana", "extensions": ["ogex"] },
  "model/vnd.parasolid.transmit.binary": { "source": "iana", "extensions": ["x_b"] },
  "model/vnd.parasolid.transmit.text": { "source": "iana", "extensions": ["x_t"] },
  "model/vnd.pytha.pyox": { "source": "iana" },
  "model/vnd.rosette.annotated-data-model": { "source": "iana" },
  "model/vnd.sap.vds": { "source": "iana", "extensions": ["vds"] },
  "model/vnd.usdz+zip": { "source": "iana", "compressible": false, "extensions": ["usdz"] },
  "model/vnd.valve.source.compiled-map": { "source": "iana", "extensions": ["bsp"] },
  "model/vnd.vtu": { "source": "iana", "extensions": ["vtu"] },
  "model/vrml": { "source": "iana", "compressible": false, "extensions": ["wrl", "vrml"] },
  "model/x3d+binary": { "source": "apache", "compressible": false, "extensions": ["x3db", "x3dbz"] },
  "model/x3d+fastinfoset": { "source": "iana", "extensions": ["x3db"] },
  "model/x3d+vrml": { "source": "apache", "compressible": false, "extensions": ["x3dv", "x3dvz"] },
  "model/x3d+xml": { "source": "iana", "compressible": true, "extensions": ["x3d", "x3dz"] },
  "model/x3d-vrml": { "source": "iana", "extensions": ["x3dv"] },
  "multipart/alternative": { "source": "iana", "compressible": false },
  "multipart/appledouble": { "source": "iana" },
  "multipart/byteranges": { "source": "iana" },
  "multipart/digest": { "source": "iana" },
  "multipart/encrypted": { "source": "iana", "compressible": false },
  "multipart/form-data": { "source": "iana", "compressible": false },
  "multipart/header-set": { "source": "iana" },
  "multipart/mixed": { "source": "iana" },
  "multipart/multilingual": { "source": "iana" },
  "multipart/parallel": { "source": "iana" },
  "multipart/related": { "source": "iana", "compressible": false },
  "multipart/report": { "source": "iana" },
  "multipart/signed": { "source": "iana", "compressible": false },
  "multipart/vnd.bint.med-plus": { "source": "iana" },
  "multipart/voice-message": { "source": "iana" },
  "multipart/x-mixed-replace": { "source": "iana" },
  "text/1d-interleaved-parityfec": { "source": "iana" },
  "text/cache-manifest": { "source": "iana", "compressible": true, "extensions": ["appcache", "manifest"] },
  "text/calendar": { "source": "iana", "extensions": ["ics", "ifb"] },
  "text/calender": { "compressible": true },
  "text/cmd": { "compressible": true },
  "text/coffeescript": { "extensions": ["coffee", "litcoffee"] },
  "text/cql": { "source": "iana" },
  "text/cql-expression": { "source": "iana" },
  "text/cql-identifier": { "source": "iana" },
  "text/css": { "source": "iana", "charset": "UTF-8", "compressible": true, "extensions": ["css"] },
  "text/csv": { "source": "iana", "compressible": true, "extensions": ["csv"] },
  "text/csv-schema": { "source": "iana" },
  "text/directory": { "source": "iana" },
  "text/dns": { "source": "iana" },
  "text/ecmascript": { "source": "iana" },
  "text/encaprtp": { "source": "iana" },
  "text/enriched": { "source": "iana" },
  "text/fhirpath": { "source": "iana" },
  "text/flexfec": { "source": "iana" },
  "text/fwdred": { "source": "iana" },
  "text/gff3": { "source": "iana" },
  "text/grammar-ref-list": { "source": "iana" },
  "text/html": { "source": "iana", "compressible": true, "extensions": ["html", "htm", "shtml"] },
  "text/jade": { "extensions": ["jade"] },
  "text/javascript": { "source": "iana", "compressible": true },
  "text/jcr-cnd": { "source": "iana" },
  "text/jsx": { "compressible": true, "extensions": ["jsx"] },
  "text/less": { "compressible": true, "extensions": ["less"] },
  "text/markdown": { "source": "iana", "compressible": true, "extensions": ["markdown", "md"] },
  "text/mathml": { "source": "nginx", "extensions": ["mml"] },
  "text/mdx": { "compressible": true, "extensions": ["mdx"] },
  "text/mizar": { "source": "iana" },
  "text/n3": { "source": "iana", "charset": "UTF-8", "compressible": true, "extensions": ["n3"] },
  "text/parameters": { "source": "iana", "charset": "UTF-8" },
  "text/parityfec": { "source": "iana" },
  "text/plain": { "source": "iana", "compressible": true, "extensions": ["txt", "text", "conf", "def", "list", "log", "in", "ini"] },
  "text/provenance-notation": { "source": "iana", "charset": "UTF-8" },
  "text/prs.fallenstein.rst": { "source": "iana" },
  "text/prs.lines.tag": { "source": "iana", "extensions": ["dsc"] },
  "text/prs.prop.logic": { "source": "iana" },
  "text/raptorfec": { "source": "iana" },
  "text/red": { "source": "iana" },
  "text/rfc822-headers": { "source": "iana" },
  "text/richtext": { "source": "iana", "compressible": true, "extensions": ["rtx"] },
  "text/rtf": { "source": "iana", "compressible": true, "extensions": ["rtf"] },
  "text/rtp-enc-aescm128": { "source": "iana" },
  "text/rtploopback": { "source": "iana" },
  "text/rtx": { "source": "iana" },
  "text/sgml": { "source": "iana", "extensions": ["sgml", "sgm"] },
  "text/shaclc": { "source": "iana" },
  "text/shex": { "source": "iana", "extensions": ["shex"] },
  "text/slim": { "extensions": ["slim", "slm"] },
  "text/spdx": { "source": "iana", "extensions": ["spdx"] },
  "text/strings": { "source": "iana" },
  "text/stylus": { "extensions": ["stylus", "styl"] },
  "text/t140": { "source": "iana" },
  "text/tab-separated-values": { "source": "iana", "compressible": true, "extensions": ["tsv"] },
  "text/troff": { "source": "iana", "extensions": ["t", "tr", "roff", "man", "me", "ms"] },
  "text/turtle": { "source": "iana", "charset": "UTF-8", "extensions": ["ttl"] },
  "text/ulpfec": { "source": "iana" },
  "text/uri-list": { "source": "iana", "compressible": true, "extensions": ["uri", "uris", "urls"] },
  "text/vcard": { "source": "iana", "compressible": true, "extensions": ["vcard"] },
  "text/vnd.a": { "source": "iana" },
  "text/vnd.abc": { "source": "iana" },
  "text/vnd.ascii-art": { "source": "iana" },
  "text/vnd.curl": { "source": "iana", "extensions": ["curl"] },
  "text/vnd.curl.dcurl": { "source": "apache", "extensions": ["dcurl"] },
  "text/vnd.curl.mcurl": { "source": "apache", "extensions": ["mcurl"] },
  "text/vnd.curl.scurl": { "source": "apache", "extensions": ["scurl"] },
  "text/vnd.debian.copyright": { "source": "iana", "charset": "UTF-8" },
  "text/vnd.dmclientscript": { "source": "iana" },
  "text/vnd.dvb.subtitle": { "source": "iana", "extensions": ["sub"] },
  "text/vnd.esmertec.theme-descriptor": { "source": "iana", "charset": "UTF-8" },
  "text/vnd.familysearch.gedcom": { "source": "iana", "extensions": ["ged"] },
  "text/vnd.ficlab.flt": { "source": "iana" },
  "text/vnd.fly": { "source": "iana", "extensions": ["fly"] },
  "text/vnd.fmi.flexstor": { "source": "iana", "extensions": ["flx"] },
  "text/vnd.gml": { "source": "iana" },
  "text/vnd.graphviz": { "source": "iana", "extensions": ["gv"] },
  "text/vnd.hans": { "source": "iana" },
  "text/vnd.hgl": { "source": "iana" },
  "text/vnd.in3d.3dml": { "source": "iana", "extensions": ["3dml"] },
  "text/vnd.in3d.spot": { "source": "iana", "extensions": ["spot"] },
  "text/vnd.iptc.newsml": { "source": "iana" },
  "text/vnd.iptc.nitf": { "source": "iana" },
  "text/vnd.latex-z": { "source": "iana" },
  "text/vnd.motorola.reflex": { "source": "iana" },
  "text/vnd.ms-mediapackage": { "source": "iana" },
  "text/vnd.net2phone.commcenter.command": { "source": "iana" },
  "text/vnd.radisys.msml-basic-layout": { "source": "iana" },
  "text/vnd.senx.warpscript": { "source": "iana" },
  "text/vnd.si.uricatalogue": { "source": "iana" },
  "text/vnd.sosi": { "source": "iana" },
  "text/vnd.sun.j2me.app-descriptor": { "source": "iana", "charset": "UTF-8", "extensions": ["jad"] },
  "text/vnd.trolltech.linguist": { "source": "iana", "charset": "UTF-8" },
  "text/vnd.wap.si": { "source": "iana" },
  "text/vnd.wap.sl": { "source": "iana" },
  "text/vnd.wap.wml": { "source": "iana", "extensions": ["wml"] },
  "text/vnd.wap.wmlscript": { "source": "iana", "extensions": ["wmls"] },
  "text/vtt": { "source": "iana", "charset": "UTF-8", "compressible": true, "extensions": ["vtt"] },
  "text/x-asm": { "source": "apache", "extensions": ["s", "asm"] },
  "text/x-c": { "source": "apache", "extensions": ["c", "cc", "cxx", "cpp", "h", "hh", "dic"] },
  "text/x-component": { "source": "nginx", "extensions": ["htc"] },
  "text/x-fortran": { "source": "apache", "extensions": ["f", "for", "f77", "f90"] },
  "text/x-gwt-rpc": { "compressible": true },
  "text/x-handlebars-template": { "extensions": ["hbs"] },
  "text/x-java-source": { "source": "apache", "extensions": ["java"] },
  "text/x-jquery-tmpl": { "compressible": true },
  "text/x-lua": { "extensions": ["lua"] },
  "text/x-markdown": { "compressible": true, "extensions": ["mkd"] },
  "text/x-nfo": { "source": "apache", "extensions": ["nfo"] },
  "text/x-opml": { "source": "apache", "extensions": ["opml"] },
  "text/x-org": { "compressible": true, "extensions": ["org"] },
  "text/x-pascal": { "source": "apache", "extensions": ["p", "pas"] },
  "text/x-processing": { "compressible": true, "extensions": ["pde"] },
  "text/x-sass": { "extensions": ["sass"] },
  "text/x-scss": { "extensions": ["scss"] },
  "text/x-setext": { "source": "apache", "extensions": ["etx"] },
  "text/x-sfv": { "source": "apache", "extensions": ["sfv"] },
  "text/x-suse-ymp": { "compressible": true, "extensions": ["ymp"] },
  "text/x-uuencode": { "source": "apache", "extensions": ["uu"] },
  "text/x-vcalendar": { "source": "apache", "extensions": ["vcs"] },
  "text/x-vcard": { "source": "apache", "extensions": ["vcf"] },
  "text/xml": { "source": "iana", "compressible": true, "extensions": ["xml"] },
  "text/xml-external-parsed-entity": { "source": "iana" },
  "text/yaml": { "compressible": true, "extensions": ["yaml", "yml"] },
  "video/1d-interleaved-parityfec": { "source": "iana" },
  "video/3gpp": { "source": "iana", "extensions": ["3gp", "3gpp"] },
  "video/3gpp-tt": { "source": "iana" },
  "video/3gpp2": { "source": "iana", "extensions": ["3g2"] },
  "video/av1": { "source": "iana" },
  "video/bmpeg": { "source": "iana" },
  "video/bt656": { "source": "iana" },
  "video/celb": { "source": "iana" },
  "video/dv": { "source": "iana" },
  "video/encaprtp": { "source": "iana" },
  "video/ffv1": { "source": "iana" },
  "video/flexfec": { "source": "iana" },
  "video/h261": { "source": "iana", "extensions": ["h261"] },
  "video/h263": { "source": "iana", "extensions": ["h263"] },
  "video/h263-1998": { "source": "iana" },
  "video/h263-2000": { "source": "iana" },
  "video/h264": { "source": "iana", "extensions": ["h264"] },
  "video/h264-rcdo": { "source": "iana" },
  "video/h264-svc": { "source": "iana" },
  "video/h265": { "source": "iana" },
  "video/iso.segment": { "source": "iana", "extensions": ["m4s"] },
  "video/jpeg": { "source": "iana", "extensions": ["jpgv"] },
  "video/jpeg2000": { "source": "iana" },
  "video/jpm": { "source": "apache", "extensions": ["jpm", "jpgm"] },
  "video/jxsv": { "source": "iana" },
  "video/mj2": { "source": "iana", "extensions": ["mj2", "mjp2"] },
  "video/mp1s": { "source": "iana" },
  "video/mp2p": { "source": "iana" },
  "video/mp2t": { "source": "iana", "extensions": ["ts"] },
  "video/mp4": { "source": "iana", "compressible": false, "extensions": ["mp4", "mp4v", "mpg4"] },
  "video/mp4v-es": { "source": "iana" },
  "video/mpeg": { "source": "iana", "compressible": false, "extensions": ["mpeg", "mpg", "mpe", "m1v", "m2v"] },
  "video/mpeg4-generic": { "source": "iana" },
  "video/mpv": { "source": "iana" },
  "video/nv": { "source": "iana" },
  "video/ogg": { "source": "iana", "compressible": false, "extensions": ["ogv"] },
  "video/parityfec": { "source": "iana" },
  "video/pointer": { "source": "iana" },
  "video/quicktime": { "source": "iana", "compressible": false, "extensions": ["qt", "mov"] },
  "video/raptorfec": { "source": "iana" },
  "video/raw": { "source": "iana" },
  "video/rtp-enc-aescm128": { "source": "iana" },
  "video/rtploopback": { "source": "iana" },
  "video/rtx": { "source": "iana" },
  "video/scip": { "source": "iana" },
  "video/smpte291": { "source": "iana" },
  "video/smpte292m": { "source": "iana" },
  "video/ulpfec": { "source": "iana" },
  "video/vc1": { "source": "iana" },
  "video/vc2": { "source": "iana" },
  "video/vnd.cctv": { "source": "iana" },
  "video/vnd.dece.hd": { "source": "iana", "extensions": ["uvh", "uvvh"] },
  "video/vnd.dece.mobile": { "source": "iana", "extensions": ["uvm", "uvvm"] },
  "video/vnd.dece.mp4": { "source": "iana" },
  "video/vnd.dece.pd": { "source": "iana", "extensions": ["uvp", "uvvp"] },
  "video/vnd.dece.sd": { "source": "iana", "extensions": ["uvs", "uvvs"] },
  "video/vnd.dece.video": { "source": "iana", "extensions": ["uvv", "uvvv"] },
  "video/vnd.directv.mpeg": { "source": "iana" },
  "video/vnd.directv.mpeg-tts": { "source": "iana" },
  "video/vnd.dlna.mpeg-tts": { "source": "iana" },
  "video/vnd.dvb.file": { "source": "iana", "extensions": ["dvb"] },
  "video/vnd.fvt": { "source": "iana", "extensions": ["fvt"] },
  "video/vnd.hns.video": { "source": "iana" },
  "video/vnd.iptvforum.1dparityfec-1010": { "source": "iana" },
  "video/vnd.iptvforum.1dparityfec-2005": { "source": "iana" },
  "video/vnd.iptvforum.2dparityfec-1010": { "source": "iana" },
  "video/vnd.iptvforum.2dparityfec-2005": { "source": "iana" },
  "video/vnd.iptvforum.ttsavc": { "source": "iana" },
  "video/vnd.iptvforum.ttsmpeg2": { "source": "iana" },
  "video/vnd.motorola.video": { "source": "iana" },
  "video/vnd.motorola.videop": { "source": "iana" },
  "video/vnd.mpegurl": { "source": "iana", "extensions": ["mxu", "m4u"] },
  "video/vnd.ms-playready.media.pyv": { "source": "iana", "extensions": ["pyv"] },
  "video/vnd.nokia.interleaved-multimedia": { "source": "iana" },
  "video/vnd.nokia.mp4vr": { "source": "iana" },
  "video/vnd.nokia.videovoip": { "source": "iana" },
  "video/vnd.objectvideo": { "source": "iana" },
  "video/vnd.radgamettools.bink": { "source": "iana" },
  "video/vnd.radgamettools.smacker": { "source": "iana" },
  "video/vnd.sealed.mpeg1": { "source": "iana" },
  "video/vnd.sealed.mpeg4": { "source": "iana" },
  "video/vnd.sealed.swf": { "source": "iana" },
  "video/vnd.sealedmedia.softseal.mov": { "source": "iana" },
  "video/vnd.uvvu.mp4": { "source": "iana", "extensions": ["uvu", "uvvu"] },
  "video/vnd.vivo": { "source": "iana", "extensions": ["viv"] },
  "video/vnd.youtube.yt": { "source": "iana" },
  "video/vp8": { "source": "iana" },
  "video/vp9": { "source": "iana" },
  "video/webm": { "source": "apache", "compressible": false, "extensions": ["webm"] },
  "video/x-f4v": { "source": "apache", "extensions": ["f4v"] },
  "video/x-fli": { "source": "apache", "extensions": ["fli"] },
  "video/x-flv": { "source": "apache", "compressible": false, "extensions": ["flv"] },
  "video/x-m4v": { "source": "apache", "extensions": ["m4v"] },
  "video/x-matroska": { "source": "apache", "compressible": false, "extensions": ["mkv", "mk3d", "mks"] },
  "video/x-mng": { "source": "apache", "extensions": ["mng"] },
  "video/x-ms-asf": { "source": "apache", "extensions": ["asf", "asx"] },
  "video/x-ms-vob": { "source": "apache", "extensions": ["vob"] },
  "video/x-ms-wm": { "source": "apache", "extensions": ["wm"] },
  "video/x-ms-wmv": { "source": "apache", "compressible": false, "extensions": ["wmv"] },
  "video/x-ms-wmx": { "source": "apache", "extensions": ["wmx"] },
  "video/x-ms-wvx": { "source": "apache", "extensions": ["wvx"] },
  "video/x-msvideo": { "source": "apache", "extensions": ["avi"] },
  "video/x-sgi-movie": { "source": "apache", "extensions": ["movie"] },
  "video/x-smv": { "source": "apache", "extensions": ["smv"] },
  "x-conference/x-cooltalk": { "source": "apache", "extensions": ["ice"] },
  "x-shader/x-fragment": { "compressible": true },
  "x-shader/x-vertex": { "compressible": true }
};
/*!
 * mime-db
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015-2022 Douglas Christopher Wilson
 * MIT Licensed
 */
var mimeDb;
var hasRequiredMimeDb;
function requireMimeDb() {
  if (hasRequiredMimeDb) return mimeDb;
  hasRequiredMimeDb = 1;
  mimeDb = require$$0;
  return mimeDb;
}
/*!
 * mime-types
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */
var hasRequiredMimeTypes;
function requireMimeTypes() {
  if (hasRequiredMimeTypes) return mimeTypes;
  hasRequiredMimeTypes = 1;
  (function(exports) {
    var db2 = requireMimeDb();
    var extname = path.extname;
    var EXTRACT_TYPE_REGEXP = /^\s*([^;\s]*)(?:;|\s|$)/;
    var TEXT_TYPE_REGEXP = /^text\//i;
    exports.charset = charset;
    exports.charsets = { lookup: charset };
    exports.contentType = contentType;
    exports.extension = extension;
    exports.extensions = /* @__PURE__ */ Object.create(null);
    exports.lookup = lookup;
    exports.types = /* @__PURE__ */ Object.create(null);
    populateMaps(exports.extensions, exports.types);
    function charset(type) {
      if (!type || typeof type !== "string") {
        return false;
      }
      var match = EXTRACT_TYPE_REGEXP.exec(type);
      var mime2 = match && db2[match[1].toLowerCase()];
      if (mime2 && mime2.charset) {
        return mime2.charset;
      }
      if (match && TEXT_TYPE_REGEXP.test(match[1])) {
        return "UTF-8";
      }
      return false;
    }
    function contentType(str) {
      if (!str || typeof str !== "string") {
        return false;
      }
      var mime2 = str.indexOf("/") === -1 ? exports.lookup(str) : str;
      if (!mime2) {
        return false;
      }
      if (mime2.indexOf("charset") === -1) {
        var charset2 = exports.charset(mime2);
        if (charset2) mime2 += "; charset=" + charset2.toLowerCase();
      }
      return mime2;
    }
    function extension(type) {
      if (!type || typeof type !== "string") {
        return false;
      }
      var match = EXTRACT_TYPE_REGEXP.exec(type);
      var exts = match && exports.extensions[match[1].toLowerCase()];
      if (!exts || !exts.length) {
        return false;
      }
      return exts[0];
    }
    function lookup(path2) {
      if (!path2 || typeof path2 !== "string") {
        return false;
      }
      var extension2 = extname("x." + path2).toLowerCase().substr(1);
      if (!extension2) {
        return false;
      }
      return exports.types[extension2] || false;
    }
    function populateMaps(extensions, types) {
      var preference = ["nginx", "apache", void 0, "iana"];
      Object.keys(db2).forEach(function forEachMimeType(type) {
        var mime2 = db2[type];
        var exts = mime2.extensions;
        if (!exts || !exts.length) {
          return;
        }
        extensions[type] = exts;
        for (var i = 0; i < exts.length; i++) {
          var extension2 = exts[i];
          if (types[extension2]) {
            var from = preference.indexOf(db2[types[extension2]].source);
            var to = preference.indexOf(mime2.source);
            if (types[extension2] !== "application/octet-stream" && (from > to || from === to && types[extension2].substr(0, 12) === "application/")) {
              continue;
            }
          }
          types[extension2] = type;
        }
      });
    }
  })(mimeTypes);
  return mimeTypes;
}
var mimeTypesExports = requireMimeTypes();
const mime = /* @__PURE__ */ getDefaultExportFromCjs(mimeTypesExports);
dotenv.config();
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY
  }
});
const generateUploadUrl = async (userId, postId, fileType, type) => {
  const ext = mime.extension(fileType);
  const key = `uploads/${userId}/${type}/${postId}/${crypto.randomUUID()}.${ext}`;
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    ContentType: fileType,
    ACL: "private"
  });
  const url2 = await getSignedUrl(s3, command, { expiresIn: 60 });
  return { uploadUrl: url2, key };
};
const AI_CORE_URL$3 = process.env.AI_CORE_URL || "http://localhost:3000/api";
const PlanStepSchema = z.object({
  step: z.number().describe("The step number, starting from 1."),
  name: z.string().optional().describe("A variable name to store the result of this step."),
  tool: z.enum([
    "vector_search",
    "get_all_entries",
    "retrieve_challenge_data",
    "conversational_reply"
  ]).describe("The name of the tool to use for this step."),
  parameters: z.record(z.any()).describe("An object of parameters for the tool.")
});
const PlanSchema = z.object({
  plan: z.array(PlanStepSchema).describe("The array of steps to execute.")
});
const createPlannerPrompt = (userQuery) => {
  return `You are an expert query planner for a journaling app. Your task is to analyze the user's question and create a step-by-step JSON plan to answer it.

You must choose one or more of the following tools: "vector_search", "get_all_entries", "retrieve_challenge_data", "conversational_reply".
In parameters, you must include a query which contains the search query, and a date filter to limit the search to a specific time period.
Format for parameters (only this format is allowed): { "query": "query", "date_filter": {"from": ISO 8601 timestamp, "to": ISO 8601 timestamp} }
For reference current date and time is: ${(/* @__PURE__ */ new Date()).toISOString()}

If you can't find the answer, you must use the "conversational_reply" tool to ask the user for more information.

If you are using vector search, you must not send dateFilters, and you must not use the "get_all_entries" tool.
If you are using the "conversational_reply" tool, you must not use the "vector_search" tool.
If you are using the "get_all_entries" tool, you must not use the "vector_search" tool.

--- EXAMPLES ---
User Question: "How was I last year compared to now?"
Plan:
{
  "plan": [
    { "step": 1, "name": "past_context", "tool": "vector_search", "parameters": { "query": "my general mood and feelings" } },
    { "step": 2, "name": "present_context", "tool": "vector_search", "parameters": { "query": "my general mood and feelings" } }
  ]
}
User Question: "How was I last december?"
Plan:
{
  "plan": [
    { "step": 1, "name": "past_context", "tool": "get_all_entries", "parameters": {date_filter: { "from": "2023-12-01T00:00:00.000Z", "to": "2023-12-31T23:59:59.999Z" } },
  ]
}

User Question: "Cool, thanks"
Plan:
{
  "plan": [
    { "step": 1, "tool": "conversational_reply", "parameters": {} }
  ]
}
---

Now, create a JSON plan for the following user question. Return ONLY the valid JSON object.

User Question: "${userQuery}"
`;
};
const createPlan = async (userQuery) => {
  const prompt = createPlannerPrompt(userQuery);
  console.log((/* @__PURE__ */ new Date()).toISOString(), "currentDateandTime");
  try {
    const response = await axios.post(`${AI_CORE_URL$3}/chat`, {
      query: prompt,
      provider: "ollama",
      format: "json"
      // This still tells Ollama to guarantee JSON output
    });
    console.log("[Planner] AI Core raw response:", response.data);
    let planObject;
    try {
      planObject = JSON.parse(response.data);
    } catch (parseError) {
      console.error("[Planner] Failed to parse JSON from AI response.", parseError);
      throw new Error("The AI planner returned invalid JSON.");
    }
    PlanSchema.parse(planObject);
    return planObject;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("[Planner] Zod validation failed:", error.errors);
    } else {
      console.error("[Planner] Failed to create or validate a plan:", error);
    }
    throw new Error("The AI planner failed to create a valid plan.");
  }
};
const AI_CORE_URL$2 = process.env.AI_CORE_URL || "http://localhost:3000/api";
const vector_search = async ({ query, date_filter }) => {
  console.log(`[Tool: vector_search] Searching for: "${query}"`, { date_filter });
  const response = await axios.post(`${AI_CORE_URL$2}/search`, {
    query,
    provider: "ollama",
    // This could also be dynamic
    limit: 5,
    date_filter: date_filter || "all"
    // This is a placeholder for now
  });
  return response.data.map((point) => point.payload.document);
};
const get_all_entries = async ({ date_filter }, userId) => {
  console.log(`[Tool: get_all_entries] Fetching all entries for date range: ${JSON.stringify(date_filter)}`);
  const fromDate = new Date(date_filter.from);
  const toDate = new Date(date_filter.to);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    throw new Error("Invalid date_filter format. Expecting ISO 8601 timestamps.");
  }
  const result = await pool.query(
    `SELECT content FROM journal_entries 
         WHERE user_id = $1 AND created_at BETWEEN $2 AND $3
         ORDER BY created_at ASC`,
    [userId, fromDate.toISOString(), toDate.toISOString()]
  );
  console.log(`[Tool: get_all_entries] Found ${result.rowCount} entries.`);
  console.log(result.rows);
  return result.rows.map((row) => row.content);
};
const retrieve_challenge_data = async ({ date_filter, status }, userId) => {
  console.log(`[Tool: retrieve_challenge_data] Fetching challenges for: ${date_filter}`);
  const interval = date_filter.includes("week") ? "7 days" : "30 days";
  const result = await pool.query(
    `SELECT title, status FROM daily_challenges WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '${interval}' AND status = $2`,
    [userId, status]
  );
  return result.rows;
};
const toolKit = {
  vector_search,
  get_all_entries,
  retrieve_challenge_data
};
const toolKit$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  toolKit
}, Symbol.toStringTag, { value: "Module" }));
const AI_CORE_URL$1 = process.env.AI_CORE_URL || "http://localhost:3000/api";
const handleQuery = async (userQuery, userId) => {
  console.log("[Agent] Creating a plan...");
  const plan = await createPlan(userQuery);
  console.log("[Agent] Plan created:", JSON.stringify(plan, null, 2));
  if (plan.plan[0]?.tool === "conversational_reply") {
    console.log("[Agent] Detected conversational reply. Bypassing tool execution.");
    const conversationalPrompt = `You are MindSage, a personalized AI reflection. The user just said: "${userQuery}". Respond with a brief, natural, and affirming acknowledgement and nothing else.
        Please respond in a conversational tone, and end with a brief, natural, and affirming acknowledgement. Do not include any other text or instructions.`;
    const finalResponse2 = await axios.post(`${AI_CORE_URL$1}/chat`, {
      query: conversationalPrompt,
      provider: "ollama"
    });
    return finalResponse2.data;
  }
  console.log("[Agent] Executing complex plan...");
  const toolResults = {};
  for (const step of plan.plan) {
    if (toolKit$1[step.tool]) {
      const result = await toolKit$1[step.tool](step.parameters, userId);
      const resultKey = step.name || `step_${step.step}_result`;
      toolResults[resultKey] = result;
    } else {
      console.warn(`[Agent] Unknown tool: ${step.tool}`);
    }
  }
  console.log("[Agent] Plan execution complete. Results:", toolResults);
  console.log("[Agent] Synthesizing final answer...");
  const foundArray = Object.values(toolResults).find((value) => Array.isArray(value));
  if (foundArray.length === 0) {
    console.log("[Agent] No context to use. Giving conversation reply.");
    const conversationalPrompt = `You are MindSage, a personalized AI reflection. The user just said: "${userQuery}". Respond with a brief, natural, and affirming acknowledgement and nothing else.
        Please respond in a conversational tone, and end with a brief, natural, and affirming acknowledgement. Do not include any other text or instructions. You don't know the answer you just have to acknowledge the conversation and end with a brief, natural, and affirming .`;
    const finalResponse2 = await axios.post(`${AI_CORE_URL$1}/chat`, {
      query: conversationalPrompt,
      provider: "ollama"
    });
    return finalResponse2.data;
  }
  const finalContext = Object.entries(toolResults).map(([value]) => `${JSON.stringify(value, null, 2)}`).join("\n\n");
  const finalResponse = await axios.post(`${AI_CORE_URL$1}/rag`, {
    query: userQuery,
    context: finalContext,
    provider: "ollama"
  });
  console.log("[Agent] Final answer:", finalResponse.data);
  return finalResponse.data;
};
const router$7 = express.Router();
const sentiment$1 = new Sentiment();
const AI_CORE_URL = process.env.AI_CORE_URL || "http://localhost:3000/api";
const analyzeSentiment = (text) => {
  const result = sentiment$1.analyze(text);
  const score = Math.max(-1, Math.min(1, result.score / 10));
  console.log(score);
  return score;
};
router$7.post("/chat", authenticateToken, async (req, res) => {
  const { query } = req.body;
  const userId = req.user.id;
  if (!query) {
    return res.status(400).json({ error: "Missing required field: query" });
  }
  try {
    console.log(`[Chat Route] Handing off query to agent for user ${userId}`);
    const answer = await handleQuery(query, userId);
    res.status(200).json({ answer });
  } catch (err) {
    console.error("[Chat Route] Error during agent execution:", err);
    res.status(500).send("An error occurred while processing your request.");
  }
});
router$7.post("/", authenticateToken, async (req, res) => {
  const { title, content, mood_score, mood_tags, provider } = req.body;
  try {
    const sentiment_score = analyzeSentiment(content);
    const result = await pool.query(
      `INSERT INTO journal_entries 
       (user_id, title, content, mood_score, sentiment_score, mood_tags)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [req.user.id, title, content, mood_score, sentiment_score, mood_tags]
    );
    const journalId = result.rows[0].id;
    console.log(`[DB] Saved journal entry with ID: ${journalId}`);
    axios.post(`${AI_CORE_URL}/upsert`, {
      document: content,
      metadata: {
        user_id: req.user.id,
        journal_id: journalId,
        // Use the primary DB ID for linking
        date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        mood_score,
        mood_tags,
        full_title: title
      },
      provider
    }).catch((err) => {
      console.error(`[AI Core] Failed to upsert journal_id ${journalId}:`, err.response ? err.response.data : err.message);
    });
    res.status(201).json({ journalId, userId: req.user.id });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving journal entry");
  }
});
router$7.get(
  "/recent",
  authenticateToken,
  async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM journal_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3",
        [req.user.id]
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).send("Error fetching recent entries");
    }
  }
);
router$7.get("/upload", authenticateToken, async (req, res) => {
  const fileType = req.query.type;
  const postId = req.query.postId;
  console.log(postId);
  req.user.id;
  console.log(`[API] 🔐 User ID: ${req.user.id}`);
  console.log(`[API] 📁 Requested file type: ${fileType}`);
  if (!fileType) return res.status(400).json({ error: "Missing file type" });
  try {
    const result = await generateUploadUrl(req.user.id, postId, fileType, posts);
    console.log(`[API] ✅ Returning signed URL`);
    console.log(result, "result");
    res.json(result);
  } catch (err) {
    console.error(`[API] ❌ Error generating signed URL`, err);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});
router$7.get("/media/:key", authenticateToken, async (req, res) => {
  const key = decodeURIComponent(req.params.key);
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key
    });
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 60 });
    res.json({ url: signedUrl });
  } catch (err) {
    console.error("❌ Failed to get signed URL", err);
    res.status(500).json({ error: "Could not generate image URL" });
  }
});
router$7.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM journal_entries WHERE user_id = $1 ORDER BY created_at DESC", [req.user.id]);
    console.log(result.rows);
    res.json(result.rows.map((row) => {
      return {
        ...row,
        mood_tags: JSON.stringify(row.mood_tags)
      };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching entries");
  }
});
router$7.get("/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM journal_entries WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err });
  }
});
router$7.get("/mood_score/:id", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const rangeStr = req.params.id;
  const range = Number.isInteger(+rangeStr) ? parseInt(rangeStr) : 7;
  try {
    const result = await pool.query(
      `SELECT mood_score, created_at
       FROM journal_entries
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '${range} days'
       ORDER BY created_at ASC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching journal data:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
router$7.put("/:id", authenticateToken, async (req, res) => {
  const journalId = req.params.id;
  const { title, content, mood_score, mood_tags, provider } = req.body;
  try {
    const sentiment_score = analyzeSentiment(content);
    const result = await pool.query(
      `UPDATE journal_entries SET 
         title = $1, content = $2, mood_score = $3, sentiment_score = $4, mood_tags = $5
       WHERE id = $6 AND user_id = $7 RETURNING *`,
      [title, content, mood_score, sentiment_score, mood_tags, journalId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Journal entry not found" });
    }
    console.log(`[DB] Updated journal entry with ID: ${journalId}`);
    axios.put(`${AI_CORE_URL}/edit/${journalId}`, {
      document: content,
      metadata: {
        user_id: req.user.id,
        journal_id: journalId,
        date: result.rows[0].created_at.toISOString().split("T")[0],
        mood_score,
        mood_tags,
        full_title: title
      },
      provider
    }).catch((err) => {
      console.error(`[AI Core] Failed to update journal_id ${journalId}:`, err.response ? err.response.data : err.message);
    });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err });
  }
});
router$7.delete("/:id", authenticateToken, async (req, res) => {
  const journalId = req.params.id;
  try {
    const result = await pool.query(
      "DELETE FROM journal_analysis WHERE journal_id = $1 RETURNING *",
      [journalId]
    );
    const result2 = await pool.query(
      "DELETE FROM journal_entries WHERE id = $1 AND user_id = $2 RETURNING *",
      [journalId, req.user.id]
    );
    if (result2.rows.length === 0) {
      return res.status(404).json({ error: "Journal entry not found" });
    }
    console.log(`[DB] Deleted journal entry with ID: ${journalId}`);
    axios.delete(`${AI_CORE_URL}/delete/${journalId}`).catch((err) => {
      console.error(`[AI Core] Failed to delete journal_id ${journalId}:`, err.response ? err.response.data : err.message);
    });
    res.sendStatus(204);
  } catch (err) {
    console.log(err, "Error");
    res.status(500).json({ error: "Server error" });
  }
});
const checkCronAuth = (req, res, next) => {
  if (req.headers["x-cron-secret"] !== process.env.CRON_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  next();
};
const router$6 = express.Router();
router$6.get("/me", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching user info for ID:", req.user);
    const id = req.user.id || req.user.userId;
    const username = req.user.username;
    const result = await pool.query(
      "SELECT username, email, created_at, full_name, timezone FROM users WHERE id = $1 AND username = $2",
      [id, username]
    );
    const entriesThisMonth = await pool.query(
      `SELECT COUNT(*) FROM journal_entries 
       WHERE user_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE
      )`,
      [req.user.id]
    );
    const lastEntry = await pool.query(
      `SELECT created_at FROM journal_entries
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    const getstreaks = await pool.query(
      `SELECT COUNT(*) FROM user_streaks
        WHERE user_id = $1`,
      [req.user.id]
    );
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const entriesCount = parseInt(entriesThisMonth.rows[0].count, 10);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const user2 = result.rows[0];
    user2.entriesCount = entriesCount;
    user2.lastEntryDate = lastEntry.rows.length > 0 ? lastEntry.rows[0].created_at : null;
    console.log("User streaks:", getstreaks.rows[0].count);
    res.json(user2);
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
router$6.put("/me", authenticateToken, async (req, res) => {
  const { username, email } = req.body;
  try {
    await pool.query("UPDATE users SET username = $1, email = $2 WHERE id = $3", [username, email, req.user.id]);
    res.send("User profile updated");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});
router$6.get("/", checkCronAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id FROM users`);
    const userIds = rows.map((row) => row.id);
    res.json({ userIds });
  } catch (err) {
    console.error("Failed to fetch user IDs:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});
router$6.get("/no-journal-today", checkCronAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id FROM users
      WHERE id NOT IN (
        SELECT DISTINCT user_id
        FROM journal_entries
        WHERE created_at::date = CURRENT_DATE
      )
    `);
    res.json(rows.map((r) => r.id));
  } catch (err) {
    console.error("❌ Error fetching inactive users:", err.message);
    res.status(500).json({ error: "Failed to check user activity" });
  }
});
router$6.get("/inactive-3-days", checkCronAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id AS user_id
      FROM users
      WHERE id NOT IN (
        SELECT DISTINCT user_id
        FROM journal_entries
        WHERE created_at::date >= CURRENT_DATE - INTERVAL '3 days'
      );
    `);
    res.json(rows.map((r) => r.user_id));
  } catch (err) {
    console.error("Error fetching inactive users:", err.message);
    res.status(500).json({ error: "Failed to fetch inactive users" });
  }
});
router$6.get("/consistent-3-days", checkCronAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT user_id
      FROM (
        SELECT user_id, COUNT(DISTINCT created_at::date) AS days_written
        FROM journal_entries
        WHERE created_at::date >= CURRENT_DATE - INTERVAL '2 days'
        GROUP BY user_id
      ) AS recent
      WHERE days_written = 3;
    `);
    res.json(rows.map((r) => r.user_id));
  } catch (err) {
    console.error("Error fetching consistent users:", err.message);
    res.status(500).json({ error: "Failed to fetch consistent users" });
  }
});
router$6.get("/monthly-summary/:id", checkCronAuth, async (req, res) => {
  try {
    const currentMonth = (/* @__PURE__ */ new Date()).getMonth();
    const lastMonthStart = new Date((/* @__PURE__ */ new Date()).getFullYear(), currentMonth - 1, 1);
    const lastMonthEnd = new Date((/* @__PURE__ */ new Date()).getFullYear(), currentMonth, 0);
    const { rows } = await pool.query(`
        SELECT user_id,
             COUNT(*) as entry_count,
             ROUND(AVG(mood_score)) as avg_mood
      FROM journal_entries
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY user_id
    `, [lastMonthStart, lastMonthEnd]);
    res.status(200).json({ data: rows });
  } catch (err) {
    res.status(500).json({ err });
  }
});
router$6.get("/me/settings", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM user_settings WHERE user_id = $1", [req.user.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching user settings:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
router$6.put("/me/settings", authenticateToken, async (req, res) => {
  const allowedFields = [
    "dark_mode",
    "font_size",
    "auto_save_interval",
    "speech_language",
    "biometric_lock",
    "send_to_ai",
    "journal_reminder",
    "challenge_alert",
    "check_in_frequency",
    "ai_tone",
    "breathing_reminder",
    "daily_challenge_type",
    "auto_summarize",
    "ai_tags",
    "insight_tone",
    "enable_ai_image",
    "enable_voice_mood",
    "enable_smart_prompts",
    "auto_save_timer",
    "journal_streaks",
    "weekly_summary_email",
    "journaling_goal"
  ];
  const snakeCaseFields = allowedFields.map((field) => field.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase());
  const updates = [];
  const values = [];
  let idx = 1;
  snakeCaseFields.forEach((field) => {
    if (req.body.hasOwnProperty(field)) {
      updates.push(`${field} = $${idx++}`);
      values.push(req.body[field]);
    }
  });
  values.push(req.user.id);
  if (updates.length === 0) {
    return res.status(400).send("No valid settings provided");
  }
  try {
    await pool.query(
      `UPDATE user_settings SET ${updates.join(", ")} WHERE user_id = $${idx}`,
      values
    );
    const settingsResult = await pool.query(
      "SELECT * FROM user_settings WHERE user_id = $1",
      [req.user.id]
    );
    res.send(settingsResult.rows[0]);
  } catch (err) {
    console.error("Error updating user settings:", err);
    res.status(500).send("Internal server error");
  }
});
router$6.delete("/me", authenticateToken, async (req, res) => {
  const password_hash = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]).then((result) => result.rows[0].password_hash);
  const { password } = req.body;
  const match = await bcrypt.compare(password, password_hash);
  if (!match) {
    return res.status(403).send("Incorrect password");
  }
  try {
    await pool.query("DELETE FROM users WHERE id = $1", [req.user.id]);
    res.status(200).send("User account deleted successfully");
  } catch (err) {
    console.error("Error deleting user account:", err);
    res.status(500).send("Internal server error");
  }
});
router$6.put("/me/change-password", authenticateToken, async (req, res) => {
  console.log("Changing password", req.body, req.user);
  const { old_password, new_password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    const user2 = result.rows[0];
    if (!user2) return res.status(404).send("User not found");
    const match = await bcrypt.compare(old_password, user2.password_hash);
    if (!match) return res.status(403).send("Incorrect current password");
    const hashedNewPassword = await bcrypt.hash(new_password, 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hashedNewPassword, req.user.id]);
    res.send("Password updated successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});
const router$5 = express.Router();
router$5.post("/:id", checkCronAuth, async (req, res) => {
  try {
    const { title, body, type } = req.body;
    const userId = req.params.id;
    await pool.query(
      "INSERT INTO notifications (user_id, title, body, type) VALUES ($1, $2, $3, $4)",
      [userId, title, body, type]
    );
    res.status(201).json({ message: `notification sent to user id: ${userId}` });
  } catch (err) {
    res.status(500).send(err);
  }
});
router$5.post("/", checkCronAuth, async (req, res) => {
  try {
    const { title, body, type, user_id } = req.body;
    let targetUsers;
    if (Array.isArray(userid) && userid.length > 0) {
      targetUsers = userids.map((id) => ({ id }));
    } else {
      const allUsers = await pool.query("SELECT id FROM users");
      targetUsers = allUsers.rows;
    }
    const insertPromises = targetUsers.map((user2) => {
      console.log("Notification for user:", user2.id);
      return pool.query(
        "INSERT INTO notifications (user_id, title, body, type) VALUES ($1, $2, $3, $4)",
        [user2.id, title, body, type]
      );
    });
    await Promise.all(insertPromises);
    res.status(201).json({ message: "Notifications created successfully" });
  } catch (error) {
    console.error("🚨 Error creating notifications:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
router$5.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
router$5.put("/:id/read", authenticateToken, async (req, res) => {
  await pool.query(
    "UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2",
    [req.params.id, req.user.id]
  );
  res.json({ message: "Marked as read" });
});
router$5.put("/read-all", authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET "read" = TRUE WHERE user_id = $1',
      [req.user.id]
    );
    res.json({
      message: "All notifications marked as read"
    });
  } catch (err) {
    console.error("Error setting all to read:", err.message);
    res.status(500).json({
      error: "Failed to mark notifications as read"
    });
  }
});
const router$4 = express.Router();
router$4.get("/today", authenticateToken, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM daily_challenges WHERE challenge_date = CURRENT_DATE"
  );
  if (rows.length === 0) return res.status(404).json({ error: "No challenge today" });
  res.json(rows[0]);
});
router$4.post("/accept", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { rows } = await pool.query(
    "SELECT id FROM daily_challenges WHERE challenge_date = CURRENT_DATE"
  );
  if (rows.length === 0) return res.status(404).json({ error: "No challenge today" });
  const challengeId = rows[0].id;
  try {
    await pool.query(
      `INSERT INTO user_challenges (user_id, challenge_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, challengeId]
    );
    res.json({ message: "Challenge accepted" });
  } catch (err) {
    res.status(500).json({ error: "Could not accept challenge" });
  }
});
router$4.get(
  "/status",
  authenticateToken,
  async (req, res) => {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT dc.*, uc.accepted_at, uc.completed_at, uc.image_key
     FROM daily_challenges dc
     LEFT JOIN user_challenges uc
        ON dc.id = uc.challenge_id AND uc.user_id = $1
      WHERE dc.challenge_date = CURRENT_DATE`,
      [userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "No challenge today" });
    res.json(rows[0]);
  }
);
router$4.put("/complete", authenticateToken, async (req, res) => {
  const { image_key, challenge_id } = req.body;
  const userId = req.user.id;
  try {
    await pool.query(
      `UPDATE user_challenges
       SET completed_at = NOW(), image_key = $1
       WHERE user_id = $2 AND challenge_id = $3`,
      [image_key, userId, challenge_id]
    );
    res.json({ message: "Challenge completed" });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark as completed" });
  }
});
router$4.get("/user", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { rows } = await pool.query(`
    SELECT dc.*, uc.accepted_at, uc.completed_at, uc.image_key
    FROM daily_challenges dc
    LEFT JOIN user_challenges uc
      ON dc.id = uc.challenge_id AND uc.user_id = $1
    ORDER BY dc.date DESC
  `, [userId]);
  res.json(rows);
});
router$4.post("/create", checkCronAuth, async (req, res) => {
  const { title, description, date } = req.body;
  if (!title) {
    return res.status(400).json({ error: "Title is required" });
  }
  const challengeDate = date || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  try {
    const result = await pool.query(
      `INSERT INTO daily_challenges (title, description, challenge_date)
       VALUES ($1, $2, $3)
       ON CONFLICT (challenge_date) DO NOTHING
       RETURNING *`,
      [title, description || "", challengeDate]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ message: "Challenge already exists for this date" });
    }
    res.status(201).json({
      message: "Challenge created successfully",
      challenge: result.rows[0]
    });
  } catch (err) {
    console.error("Error creating challenge:", err.message);
    res.status(500).json({ error: "Failed to create challenge" });
  }
});
router$4.get("/upload", authenticateToken, async (req, res) => {
  const fileType = req.query.type;
  const challengeId = req.query.challengeId;
  console.log(challengeId);
  console.log(`[API] 🔐 User ID: ${req.user.id}`);
  console.log(`[API] 📁 Requested file type: ${fileType}`);
  if (!fileType) return res.status(400).json({ error: "Missing file type" });
  try {
    const result = await generateUploadUrl(req.user.id, challengeId, fileType, "challenge");
    console.log(`[API] ✅ Returning signed URL`);
    console.log(result, "result");
    res.json(result);
  } catch (err) {
    console.error(`[API] ❌ Error generating signed URL`, err);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});
router$4.get("/image-url", authenticateToken, async (req, res) => {
  const { key } = req.query;
  if (!key) return res.status(400).json({ error: "Missing image key" });
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key
    });
    const url2 = await getSignedUrl(s3, command, { expiresIn: 60 });
    res.json({ url: url2 });
  } catch (err) {
    console.error(`[API] ❌ Error generating signed URL`, err);
    res.status(500).json({ error: "Failed to generate image URL" });
  }
});
dotenv.config();
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});
async function textResponse(prompt, model) {
  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt
    });
    const result = response.candidates[0].content.parts[0].text;
    const usageMetadata = response.usageMetadata;
    return { result, usageMetadata };
  } catch (error) {
    console.error("Gemini error:", error);
    throw new Error("Failed to generate content");
  }
}
const router$3 = express.Router();
const __filename$2 = fileURLToPath(import.meta.url);
const __dirname$2 = dirname(__filename$2);
router$3.post("/text", authenticateToken, async (req, res) => {
  let { prompt, model } = req.body;
  if (!model) model = "gemini-2.5-flash";
  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }
  try {
    const data = await textResponse(prompt, model);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});
router$3.post("/analyze-journal", authenticateToken, async (req, res) => {
  let { content } = req.body;
  const model = "gemini-2.5-flash";
  if (!content) return res.status(400).json({ error: "content is required." });
  const prompt = `
    You are a mental health assistant that extracts structured behavioral insights from journal entries.

    Here’s a journal entry:
    """
${content}
"""

    Return the following structured JSON:
    {
    sentiment: "",
    mood: "",
    topics: [],
    recurring_thoughts: [],
    cognitive_distortions: [],
    suggested_therapy_technique: ""
    }

    Only return valid JSON. Do not explain.
    `;
  try {
    const rawData = await textResponse(prompt, model);
    const raw = rawData.result;
    console.log("Gemini raw output:", raw);
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}") + 1;
    const jsonString = raw.slice(jsonStart, jsonEnd);
    const data = JSON.parse(jsonString);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});
router$3.post("/analyze-user-patterns", authenticateToken, async (req, res) => {
  const model = "gemini-2.5-flash";
  const { file } = req.body;
  const journalPath = path.resolve(__dirname$2, "journals.json");
  fs.readFileSync(journalPath, "utf8");
  const prompt = [file, `
        Analyze the following list of journal entries from the past 4 weeks.

        Identify and summarize any meaningful patterns across the entries, including:

        1. **Recurring emotional themes** (e.g., anxiety, guilt, overwhelm)
        2. **Frequently mentioned topics or concerns** (e.g., self-worth, relationships, work stress)
        3. **Cognitive distortions** or negative thinking habits that repeat (e.g., catastrophizing, black-and-white thinking, overgeneralization)
        4. **Day-of-week correlations** — determine if certain emotions or thought patterns consistently appear on specific days
        5. **Time-of-day effects** if noticeable
        6. **Shifts or changes in mood, tone, or self-perception** over time

        Then, based on these patterns, suggest:

        - An **evidence-based psychological intervention** that may help the user gain insight or feel better (e.g., cognitive restructuring, mindfulness, journaling prompt, gratitude exercise, thought challenging).
        - A **suggested journaling prompt** or reflective question that would be helpful for the user to explore this pattern further.

        Return the result in the following structured JSON format only:

        {
        "insight": "<A natural language summary of the behavioral and emotional patterns detected>",
        "recurring_themes": ["<theme1>", "<theme2>", ...],
        "cognitive_distortions": ["<distortion1>", "<distortion2>", ...],
        "day_of_week": "<If a particular day is relevant, otherwise 'None'>",
        "time_of_day": "<Morning | Afternoon | Evening | None>",
        "suggested_intervention": "<Short name of the recommended technique>",
        "suggested_prompt": "<A reflective journaling question or exercise to address the pattern>"
        }

        Do not explain or introduce the output. Just return the JSON object.

    `];
  try {
    const rawData = await textResponse(prompt, model);
    const raw = rawData.result;
    console.log("Gemini raw output:", raw);
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}") + 1;
    const jsonString = raw.slice(jsonStart, jsonEnd);
    const data = JSON.parse(jsonString);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});
const router$2 = express.Router();
router$2.get("/types", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT DISTINCT pattern_type FROM ai_insights WHERE user_id = $1`,
      [userId]
    );
    const types = result.rows.map((row) => row.pattern_type);
    res.status(200).json({ types });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router$2.get("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      "SELECT * FROM ai_insights WHERE user_id = $1 ORDER BY detected_at DESC",
      [userId]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router$2.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT * FROM ai_insights WHERE id = $1 AND user_id = $2",
      [id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Insight not found" });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router$2.post("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      pattern_type,
      pattern_description,
      recurring_day,
      source_journal_ids
    } = req.body;
    const result = await pool.query(
      `INSERT INTO ai_insights 
            (user_id, pattern_type, pattern_description, recurring_day, source_journal_ids)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
      [userId, pattern_type, pattern_description, recurring_day, source_journal_ids]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router$2.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      pattern_type,
      pattern_description,
      recurring_day,
      source_journal_ids
    } = req.body;
    const result = await pool.query(
      `UPDATE ai_insights SET 
            pattern_type = $1,
            pattern_description = $2,
            recurring_day = $3,
            source_journal_ids = $4
            WHERE id = $5 AND user_id = $6
            RETURNING *`,
      [pattern_type, pattern_description, recurring_day, source_journal_ids, id, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Insight not found or unauthorized" });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router$2.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const result = await pool.query(
      "DELETE FROM ai_insights WHERE id = $1 AND user_id = $2 RETURNING *",
      [id, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Insight not found or unauthorized" });
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router$2.get("/by-type/:type", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { type } = req.params;
    const result = await pool.query(
      "SELECT * FROM ai_insights WHERE user_id = $1 AND pattern_type ILIKE $2",
      [userId, type]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
const router$1 = express.Router();
router$1.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM ai_interventions WHERE user_id = $1 ORDER BY recommended_at DESC`,
      [req.user.id]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router$1.get("/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM ai_interventions WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Intervention not found" });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router$1.post("/", authenticateToken, async (req, res) => {
  const {
    insight_id,
    title,
    description,
    type,
    recommended_at,
    status,
    completed_at
  } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO ai_interventions (
        user_id, insight_id, title, description, type,
        recommended_at, status, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        req.user.id,
        insight_id || null,
        title,
        description || null,
        type,
        recommended_at || /* @__PURE__ */ new Date(),
        status || "suggested",
        completed_at || null
      ]
    );
    res.status(201).json({ interventionId: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router$1.put("/:id", authenticateToken, async (req, res) => {
  const {
    title,
    description,
    type,
    status,
    completed_at
  } = req.body;
  try {
    const result = await pool.query(
      `UPDATE ai_interventions
       SET title = $1,
           description = $2,
           type = $3,
           status = $4,
           completed_at = $5
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [
        title,
        description,
        type,
        status,
        completed_at,
        req.params.id,
        req.user.id
      ]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Intervention not found or unauthorized" });
    }
    res.status(200).json({ message: "Updated successfully", intervention: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router$1.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM ai_interventions WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Intervention not found or unauthorized" });
    }
    res.status(200).json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
const router = express.Router();
router.get("/:id", authenticateToken, async (req, res) => {
  const id = req.params.id;
  try {
    const result = await pool.query(`
            SELECT * FROM journal_analysis WHERE journal_id = $1;
            `, [id]);
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err });
  }
});
router.post("/", authenticateToken, async (req, res) => {
  const { journal_id, sentiment: sentiment2, mood, topics, recurring_thoughts, cognitive_distortions, suggested_therapy_technique, analyzed_at } = req.body;
  try {
    const result = await pool.query(`
            INSERT INTO journal_analysis 
            (journal_id, sentiment, mood, topics, recurring_thoughts, cognitive_distortions, suggested_therapy_technique, analyzed_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
            `, [journal_id, sentiment2, mood, topics, recurring_thoughts, cognitive_distortions, suggested_therapy_technique, analyzed_at]);
    console.log(result);
    const analysisId = result.rows[0].id;
    res.status(200).json({ analysisId });
  } catch (err) {
    res.status(500).json({ error: err });
  }
});
router.delete("/:id", authenticateToken, async (req, res) => {
  const id = req.params.id;
  try {
    const result = await pool.query(
      `DELETE FROM journal_analysis WHERE id = $1 RETURNING *;`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Analysis not found" });
    }
    res.status(200).json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get("/user/:userId", authenticateToken, async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(`
            SELECT ja.*
            FROM journal_analysis ja
            JOIN journal_entries j ON ja.journal_id = j.id
            WHERE j.user_id = $1
            ORDER BY ja.analyzed_at DESC;
        `, [userId]);
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = path.dirname(__filename$1);
const envPath = path.resolve(__dirname$1, "../../.env");
dotenv.config({ path: envPath });
const app = express();
app.use(
  cors({
    origin: "http://localhost:5173",
    // frontend origin
    credentials: true,
    // allow cookies
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);
app.use(express.json());
app.use(cookieParser());
app.use("/api/ai/gemini", router$3);
app.use("/api/ai/insights", router$2);
app.use("/api/ai/interventions", router$1);
app.use("/api/auth", router$8);
app.use("/api/journals", router$7);
app.use("/api/journal-analysis", router);
app.use("/api/users", router$6);
app.use("/api/notifications", router$5);
app.use("/api/challenges", router$4);
const PORT = process.env.PORT || 4e3;
function startServer() {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}
const dbPath = path$1.join(process.env.APPDATA || (process.platform == "darwin" ? process.env.HOME + "/Library/Preferences" : process.env.HOME + "/.local/share"), "MindSage", "mind-sage.db");
fs$1.mkdirSync(path$1.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
function initDatabase() {
  db.exec(`
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            full_name TEXT,
            timezone TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        DROP TABLE IF EXISTS user_settings;
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id INTEGER PRIMARY KEY,
            dark_mode INTEGER DEFAULT 0,
            font_size TEXT DEFAULT 'medium',
            auto_save_interval INTEGER DEFAULT 60,
            speech_language TEXT DEFAULT 'en',
            biometric_lock INTEGER DEFAULT 0,
            send_to_ai INTEGER DEFAULT 1,
            journal_reminder INTEGER DEFAULT 1,
            challenge_alert INTEGER DEFAULT 1,
            check_in_frequency TEXT DEFAULT 'daily',
            ai_tone TEXT DEFAULT 'neutral',
            breathing_reminder INTEGER DEFAULT 0,
            daily_challenge_type TEXT DEFAULT 'default',
            auto_summarize INTEGER DEFAULT 1,
            ai_tags INTEGER DEFAULT 1,
            insight_tone TEXT DEFAULT 'supportive',
            enable_ai_image INTEGER DEFAULT 0,
            enable_voice_mood INTEGER DEFAULT 0,
            enable_smart_prompts INTEGER DEFAULT 1,
            auto_save_timer INTEGER DEFAULT 30,
            journal_streaks INTEGER DEFAULT 1,
            weekly_summary_email INTEGER DEFAULT 1,
            journaling_goal INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS journal_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT,
            content TEXT NOT NULL,
            mood_score INTEGER,
            sentiment_score REAL,
            mood_tags TEXT,
            image_key TEXT,
            audio_key TEXT,
            content_summary TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            -- Sync Columns --
            is_deleted INTEGER DEFAULT 0,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        -- This table is likely read-only from the server, but we add sync columns for completeness
        CREATE TABLE IF NOT EXISTS daily_challenges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            challenge_date TEXT NOT NULL UNIQUE,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_challenges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            challenge_id INTEGER,
            accepted INTEGER DEFAULT 0,
            completed INTEGER DEFAULT 0,
            image_key TEXT,
            accepted_at TEXT DEFAULT CURRENT_TIMESTAMP,
            completed_at TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            -- Sync Columns --
            is_deleted INTEGER DEFAULT 0,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (challenge_id) REFERENCES daily_challenges(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT NOT NULL,
            body TEXT,
            read INTEGER DEFAULT 0,
            type TEXT DEFAULT 'insight',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            -- Sync Columns --
            is_deleted INTEGER DEFAULT 0,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        -- This table is typically managed by the online backend and may not need sync columns
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            expires_at TEXT,
            is_revoked INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        -- AI-generated tables are likely read-only offline, but we add sync columns
        -- in case the user can interact with them (e.g., dismiss a nudge).

        CREATE TABLE IF NOT EXISTS journal_summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            summary_type TEXT NOT NULL,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            average_mood_score REAL,
            average_sentiment_score REAL,
            dominant_mood_tags TEXT,
            insights TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            -- Sync Columns --
            is_deleted INTEGER DEFAULT 0,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, summary_type, period_start)
        );

        CREATE TABLE IF NOT EXISTS ai_insights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            pattern_type TEXT NOT NULL,
            pattern_description TEXT NOT NULL,
            recurring_day TEXT,
            detected_at TEXT DEFAULT CURRENT_TIMESTAMP,
            source_journal_ids TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            -- Sync Columns --
            is_deleted INTEGER DEFAULT 0,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS ai_interventions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            insight_id INTEGER,
            title TEXT NOT NULL,
            description TEXT,
            recommended_at TEXT DEFAULT CURRENT_TIMESTAMP,
            type TEXT NOT NULL,
            status TEXT DEFAULT 'suggested',
            completed_at TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            -- Sync Columns --
            is_deleted INTEGER DEFAULT 0,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (insight_id) REFERENCES ai_insights(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS ai_nudges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT,
            message TEXT NOT NULL,
            nudge_type TEXT,
            related_insight_id INTEGER,
            read INTEGER DEFAULT 0,
            action_taken INTEGER DEFAULT 0,
            action_description TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            -- Sync Columns --
            is_deleted INTEGER DEFAULT 0,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (related_insight_id) REFERENCES ai_insights(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS user_emotion_patterns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            day_of_week TEXT NOT NULL,
            emotion TEXT NOT NULL,
            frequency INTEGER DEFAULT 1,
            last_detected TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            -- Sync Columns --
            is_deleted INTEGER DEFAULT 0,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS journal_analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            journal_id INTEGER NOT NULL UNIQUE,
            sentiment TEXT,
            mood TEXT,
            topics TEXT,
            recurring_thoughts TEXT,
            cognitive_distortions TEXT,
            suggested_therapy_technique TEXT,
            analyzed_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            -- Sync Columns --
            is_deleted INTEGER DEFAULT 0,
            synced INTEGER DEFAULT 0,
            sync_action TEXT,
            FOREIGN KEY (journal_id) REFERENCES journal_entries(id) ON DELETE CASCADE
        );
        -- Categories Table
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, name)
        );

        -- Goals Table
        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            category_id INTEGER,
            title TEXT NOT NULL,
            description TEXT,
            parent_goal_title TEXT,
            current_value REAL NOT NULL DEFAULT 0,
            target_value REAL NOT NULL,
            unit TEXT NOT NULL,
            is_pinned INTEGER NOT NULL DEFAULT 0, -- Using 0 for FALSE
            is_completed INTEGER NOT NULL DEFAULT 0, -- Using 0 for FALSE
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_date TEXT, -- 'YYYY-MM-DD'
            target_date TEXT, -- 'YYYY-MM-DD'
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
        );

        -- Progress Logs Table
        CREATE TABLE IF NOT EXISTS progress_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL,
            value REAL NOT NULL,
            description TEXT,
            logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
        );

        -- Add indexes for faster lookups
        CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
        CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
        CREATE INDEX IF NOT EXISTS idx_progress_logs_goal_id ON progress_logs(goal_id);
    `);
  const insertSystemUser = db.prepare(`
        INSERT OR IGNORE INTO users (id, username, email, password_hash, full_name)
        VALUES (0, 'System', 'system@mindsage.app', 'N/A', 'System User')
    `);
  insertSystemUser.run();
  const categories = [
    { name: "Health", color: "#FF6B6B" },
    { name: "Work", color: "#4ECDC4" },
    { name: "Finance", color: "#FFD93D" },
    { name: "Personal Growth", color: "#6A4C93" },
    { name: "Leisure", color: "#1A535C" }
  ];
  const insertCategory = db.prepare(`
        INSERT OR IGNORE INTO categories (user_id, name, color)
        VALUES (0, ?, ?)
    `);
  for (const cat of categories) {
    insertCategory.run(cat.name, cat.color);
  }
  console.log("Local database with sync columns initialized successfully.");
}
const db$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  db,
  initDatabase
}, Symbol.toStringTag, { value: "Module" }));
function findUserByIdentifier(identifier) {
  const stmt = db.prepare("SELECT * FROM users WHERE email = ? OR username = ?");
  return stmt.get(identifier, identifier);
}
function findUserForCheck(email, username) {
  const stmt = db.prepare("SELECT * FROM users WHERE email = ? OR username = ?");
  return stmt.get(email, username);
}
function createUser(details) {
  const { username, email, password, full_name, timezone } = details;
  const hashedPassword = bcrypt.hashSync(password, 10);
  const userStmt = db.prepare(`
        INSERT INTO users (username, email, password_hash, full_name, timezone)
        VALUES (?, ?, ?, ?, ?)
    `);
  const settingsStmt = db.prepare("INSERT INTO user_settings (user_id) VALUES (?)");
  const runTransaction = db.transaction((user2) => {
    const result = userStmt.run(user2.username, user2.email, user2.hashedPassword, user2.full_name, user2.timezone);
    const userId = result.lastInsertRowid;
    settingsStmt.run(userId);
    return { id: userId, username: user2.username };
  });
  return runTransaction({ username, email, hashedPassword, full_name, timezone });
}
const auth = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  createUser,
  findUserByIdentifier,
  findUserForCheck
}, Symbol.toStringTag, { value: "Module" }));
function getUserById(userId) {
  const user2 = db.prepare("SELECT id, username, email, created_at, full_name, timezone FROM users WHERE id = ?").get(userId);
  if (!user2) return null;
  const entriesThisMonth = db.prepare(
    `
        SELECT COUNT(*) as count FROM journal_entries 
        WHERE user_id = ? AND created_at >= date('now', 'start of month') AND is_deleted = 0
    `
  ).get(userId);
  const lastEntryDate = db.prepare(`
        SELECT MAX(created_at) as last_entry_
        FROM journal_entries WHERE user_id = ? AND is_deleted = 0
    `).get(userId);
  user2.lastEntryDate = lastEntryDate?.last_entry_ || null;
  user2.entriesCount = entriesThisMonth?.count || 0;
  return user2;
}
function updateUserProfile(userId, { username, email, full_name }) {
  const stmt = db.prepare(
    "UPDATE users SET username = ?, email = ?, full_name = ? WHERE id = ?"
  );
  stmt.run(username, email, full_name, userId);
  const user2 = db.prepare(
    "SELECT id, username, email, created_at, full_name, timezone FROM users WHERE id = ?"
  ).get(userId);
  if (!user2) return null;
  console.log(user2, "+++++++++++++++++++++++++++++++++++++++++++++USER");
  return user2;
}
function getUserSettings(userId) {
  return db.prepare("SELECT * FROM user_settings WHERE user_id = ?").get(userId);
}
function updateUserSettings(userId, settings) {
  const fields = Object.keys(settings);
  let values = Object.values(settings);
  if (fields.length === 0) return;
  values = values.map((value) => {
    if (typeof value === "boolean") {
      return value ? 1 : 0;
    }
    return value;
  });
  const setClause = fields.map((field) => `${field} = ?`).join(", ");
  const stmt = db.prepare(`UPDATE user_settings SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`);
  return stmt.run(...values, userId);
}
function deleteUser(userId) {
  const stmt = db.prepare("DELETE FROM users WHERE id = ?");
  return stmt.run(userId);
}
function changePassword(userId, newPassword) {
  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  const stmt = db.prepare("UPDATE users SET password_hash = ? WHERE id = ?");
  return stmt.run(hashedPassword, userId);
}
const user = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  changePassword,
  deleteUser,
  getUserById,
  getUserSettings,
  updateUserProfile,
  updateUserSettings
}, Symbol.toStringTag, { value: "Module" }));
const sentiment = new Sentiment();
const analyzeSentimentLocal = (text) => {
  if (!text) return 0;
  const result = sentiment.analyze(text);
  const score = Math.max(-1, Math.min(1, result.score / 10));
  return score;
};
function createJournalEntry(userId, entry) {
  const { title, content, mood_score, mood_tags } = entry;
  console.log(entry);
  const sentiment_score = analyzeSentimentLocal(content || "");
  const moodTagsJSON = JSON.stringify(mood_tags || []);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const stmt = db.prepare(`
    INSERT INTO journal_entries (
      user_id,
      title,
      content,
      mood_score,
      sentiment_score,
      mood_tags,
      created_at,
      updated_at,
      synced,
      sync_action
    ) VALUES (
      @userId,
      @title,
      @content,
      @mood_score,
      @sentiment_score,
      @mood_tags,
      @created_at,
      @updated_at,
      0,
      'create'
    )
  `);
  console.log(
    userId,
    title,
    content,
    mood_score,
    sentiment_score,
    moodTagsJSON,
    now,
    now,
    0,
    "create",
    "params++++++++++++++++++++"
  );
  const result = stmt.run({
    userId,
    title: title || null,
    content: content || "",
    mood_score: mood_score || null,
    sentiment_score,
    mood_tags: moodTagsJSON,
    created_at: now,
    updated_at: now
  });
  return {
    journalId: result.lastInsertRowid,
    userId
  };
}
function getRecentEntries(userId) {
  const stmt = db.prepare("SELECT * FROM journal_entries WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at DESC LIMIT 3");
  return stmt.all(userId);
}
function getAllEntries(userId, limit = 10, offset = 0, fromDate, toDate) {
  console.log(userId, limit, offset, fromDate, toDate);
  let sql = `
    SELECT *
    FROM journal_entries
    WHERE user_id = ?
      AND is_deleted = 0
  `;
  const params = [userId];
  if (fromDate && toDate) {
    sql += ` AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)`;
    params.push(fromDate, toDate);
  } else if (fromDate) {
    sql += ` AND DATE(created_at) >= DATE(?)`;
    params.push(fromDate);
  } else if (toDate) {
    sql += ` AND DATE(created_at) <= DATE(?)`;
    params.push(toDate);
  }
  sql += `
    ORDER BY DATETIME(created_at) DESC
    LIMIT ? OFFSET ?
  `;
  params.push(offset, limit);
  console.log(sql);
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}
function getImageKeysAndIds(userId, mode = "top") {
  if (mode === "random") {
    const countStmt = db.prepare(
      `SELECT COUNT(*) AS total
       FROM journal_entries
       WHERE user_id = ?
         AND is_deleted = 0
         AND image_key IS NOT NULL`
    );
    const { total } = countStmt.get(userId);
    if (total === 0) return [];
    const numToFetch = Math.min(10, total);
    const offsets = /* @__PURE__ */ new Set();
    while (offsets.size < numToFetch) {
      offsets.add(Math.floor(Math.random() * total));
    }
    const fetchStmt = db.prepare(
      `SELECT id, image_key, title
       FROM journal_entries
       WHERE user_id = ?
         AND is_deleted = 0
         AND image_key IS NOT NULL
       LIMIT 1 OFFSET ?`
    );
    const results = [];
    for (const offset of offsets) {
      results.push(fetchStmt.get(userId, offset));
    }
    return results;
  }
  const stmt = db.prepare(
    `SELECT id, image_key, title
     FROM journal_entries
     WHERE user_id = ?
       AND is_deleted = 0
       AND image_key IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 10`
  );
  return stmt.all(userId);
}
function getJournalById(userId, journalId) {
  const stmt = db.prepare("SELECT * FROM journal_entries WHERE id = ? AND user_id = ? AND is_deleted = 0");
  return stmt.get(journalId, userId);
}
function getMoodScores(userId, range) {
  const safeRange = parseInt(range, 10) || 7;
  const stmt = db.prepare(`
        SELECT mood_score, created_at, sentiment_score FROM journal_entries
        WHERE user_id = ? AND is_deleted = 0 AND created_at >= date('now', '-' || ? || ' days')
        ORDER BY created_at ASC
    `);
  return stmt.all(userId, safeRange);
}
function updateJournalEntry(userId, journalId, entry) {
  const { title, content, mood_score, mood_tags } = entry;
  const sentiment_score = analyzeSentimentLocal(content || "");
  const moodTagsJSON = JSON.stringify(mood_tags || []);
  const updated_at = (/* @__PURE__ */ new Date()).toISOString();
  const stmt = db.prepare(`
    UPDATE journal_entries 
    SET 
      title = @title,
      content = @content,
      mood_score = @mood_score,
      sentiment_score = @sentiment_score,
      mood_tags = @mood_tags,
      updated_at = @updated_at,
      synced = 0,
      sync_action = 'update'
    WHERE 
      id = @journalId AND user_id = @userId
  `);
  const result = stmt.run({
    title: title || null,
    content: content || "",
    mood_score: mood_score || null,
    sentiment_score,
    mood_tags: moodTagsJSON,
    updated_at,
    journalId,
    userId
  });
  return result.changes > 0 ? getJournalById(userId, journalId) : null;
}
function deleteJournalEntry(userId, journalId) {
  const stmt = db.prepare(`
        UPDATE journal_entries 
        SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP, synced = 0, sync_action = 'delete'
        WHERE id = ? AND user_id = ?
    `);
  const result = stmt.run(journalId, userId);
  return result.changes;
}
const journal = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  createJournalEntry,
  deleteJournalEntry,
  getAllEntries,
  getImageKeysAndIds,
  getJournalById,
  getMoodScores,
  getRecentEntries,
  updateJournalEntry
}, Symbol.toStringTag, { value: "Module" }));
function linkMediaToJournal(journalId, mediaKey, mediaType) {
  let column;
  if (mediaType === "image") {
    column = "image_key";
  } else if (mediaType === "audio") {
    column = "audio_key";
  } else {
    throw new Error("Invalid media type specified.");
  }
  const stmt = db.prepare(`
        UPDATE journal_entries 
        SET ${column} = @mediaKey 
        WHERE id = @journalId
    `);
  const result = stmt.run({ mediaKey, journalId });
  return result.changes > 0;
}
const media = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  linkMediaToJournal
}, Symbol.toStringTag, { value: "Module" }));
const getCategories = async (userId) => {
  const stmt = db.prepare("SELECT * FROM categories WHERE user_id = ? OR user_id = 0");
  return stmt.all(userId);
};
const addCategory = async (userId, category2) => {
  let { name, color } = category2;
  if (name === void 0) {
    return { error: "Name is required" };
  }
  if (color === void 0) {
    color = "#000000";
  }
  const stmt = db.prepare("INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)");
  return stmt.run(userId, name, color);
};
const editCategory = async (userId, category2) => {
  let { name, color, id } = category2;
  if (name === void 0) {
    return { error: "Name is required" };
  }
  if (color === void 0) {
    color = "#000000";
  }
  const stmt = db.prepare("UPDATE categories SET name = ?, color = ? WHERE user_id = ? AND categoryId = ?");
  return stmt.run(userId, name, color, id);
};
const deleteCategory = async (userId, categoryId) => {
  const stmt = db.prepare("DELETE FROM categories WHERE user_id = ? AND categoryId = ?");
  return stmt.run(userId, categoryId);
};
const category = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  addCategory,
  deleteCategory,
  editCategory,
  getCategories
}, Symbol.toStringTag, { value: "Module" }));
const getActiveGoals = async (userId) => {
  const stmt = db.prepare(`
        SELECT * FROM goals WHERE user_id = ? AND is_completed = 0
    `);
  const goals = stmt.all(userId);
  return goals;
};
const getCompletedGoals = async (userId) => {
  console.log("USING .all() version of getCompletedGoals");
  const stmt = db.prepare(`
        SELECT * FROM goals WHERE user_id = ? AND is_completed = 1
    `);
  const goals = stmt.all(userId);
  return goals;
};
const AddGoal = async (userId, goalData) => {
  console.log("goalData", goalData);
  const {
    category_id,
    title,
    description,
    parent_goal,
    target_value,
    unit,
    target_date
  } = goalData;
  if (category_id !== null && category_id !== void 0) {
    const categoryExists = db.prepare(`
            SELECT id FROM categories
            WHERE id = ? AND (user_id = ? OR user_id = 0)
        `).get(category_id, userId);
    if (!categoryExists) {
      throw new Error("Invalid category_id: Must belong to user or be a system category.");
    }
  }
  const stmt = db.prepare(`
        INSERT INTO goals (
            user_id, category_id, title, description, parent_goal_title,
             target_value, unit, target_date
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
  const result = stmt.run(
    userId,
    category_id,
    title,
    description,
    parent_goal,
    target_value,
    unit,
    target_date
  );
  return result;
};
const updateGoal = async (userId, goal_id, goalData) => {
  console.log(goalData, "goalData");
  const { category_id, title, description, parent_goal, current_value, target_value, unit, is_pinned, is_completed } = goalData;
  const stmt = db.prepare(`
        UPDATE goals SET category_id = ?, title = ?, description = ?, parent_goal_title = ?, current_value = ?, target_value = ?, unit = ?, is_pinned = ?, is_completed = ? WHERE id = ? AND user_id = ?
    `);
  const result = stmt.run(category_id, title, description, parent_goal, current_value, target_value, unit, is_pinned, is_completed, goal_id, userId);
  return result;
};
const deleteGoal = async (userId, goal_id) => {
  const logsStmt = db.prepare("DELETE FROM progress_logs WHERE goal_id = ?");
  logsStmt.run(goal_id);
  const stmt = db.prepare(`
        DELETE FROM goals WHERE id = ? AND user_id = ?
    `);
  const result = stmt.run(goal_id, userId);
  return result;
};
const togglePinGoal = async (userId, goal_id) => {
  const stmt = db.prepare(`
    UPDATE goals
    SET is_pinned = CASE is_pinned WHEN 1 THEN 0 ELSE 1 END
    WHERE user_id = ? AND id = ?
  `);
  const result = stmt.run(userId, goal_id);
  return result;
};
const completeGoal = async (userId, goal_id) => {
  const stmt = db.prepare(`
        UPDATE goals 
        SET is_completed = 1, completed_date = DATE('now'), is_pinned = 0 
        WHERE user_id = ? AND id = ?
    `);
  const result = stmt.run(userId, goal_id);
  return result;
};
const updateProgress = async (userId, goal_id, value) => {
  const updateStmt = db.prepare(
    "UPDATE goals SET current_value = ? WHERE id = ? AND user_id = ?"
  );
  updateStmt.run(value, goal_id, userId);
  const getGoalStmt = db.prepare("SELECT * FROM goals WHERE id = ? AND user_id = ?");
  return getGoalStmt.get(goal_id, userId);
};
const getPinnedGoals = async (userId) => {
  const stmt = db.prepare("SELECT * FROM goals WHERE user_id = ? AND is_pinned = 1");
  return stmt.all(userId);
};
const goal = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  AddGoal,
  completeGoal,
  deleteGoal,
  getActiveGoals,
  getCompletedGoals,
  getPinnedGoals,
  togglePinGoal,
  updateGoal,
  updateProgress
}, Symbol.toStringTag, { value: "Module" }));
async function getProgressLogs(goalId) {
  const stmt = db.prepare(`
        SELECT * FROM progress_logs WHERE goal_id = ?
    `);
  return stmt.all(goalId);
}
async function logProgress(goalId, progress, description) {
  const stmt = db.prepare(`
        INSERT INTO progress_logs (goal_id, value, description) VALUES (?, ?, ?)
    `);
  return stmt.run(goalId, progress, description);
}
const logs = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getProgressLogs,
  logProgress
}, Symbol.toStringTag, { value: "Module" }));
const localDB = {
  ...db$1,
  ...auth,
  ...user,
  ...journal,
  ...media,
  ...category,
  ...goal,
  ...logs
};
const generateAccessToken = (user2) => {
  return jwt.sign(user2, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "15m" });
};
const handleLogin = async (event, mode, credentials) => {
  const { identifier, password } = credentials;
  console.log(`Login attempt for ${identifier} in ${mode} mode.`);
  if (mode === "online") {
    try {
      const response = await axios.post("http://localhost:4000/api/auth/login", credentials);
      return response.data;
    } catch (error) {
      console.error("Online login error:", error.response?.data || error.message);
      throw new Error(error.response?.data.message || "Online login failed");
    }
  } else {
    try {
      const user2 = localDB.findUserByIdentifier(identifier);
      if (!user2) throw new Error("User not found");
      const match = await bcrypt.compare(password, user2.password_hash);
      if (!match) throw new Error("Incorrect password");
      const accessToken = generateAccessToken({ id: user2.id, username: user2.username });
      const userInfo = {
        id: user2.id,
        username: user2.username,
        email: user2.email,
        full_name: user2.full_name || null,
        // Fallback to null if undefined
        created_at: user2.created_at
      };
      return { accessToken, userInfo };
    } catch (error) {
      console.error("Offline login error:", error);
      throw error;
    }
  }
};
const handleRegister = async (event, mode, details) => {
  console.log(`Registration attempt in ${mode} mode.`);
  if (mode === "online") {
    try {
      const response = await axios.post("http://localhost:4000/api/auth/register", details);
      return response.data;
    } catch (error) {
      console.error("Online registration error:", error.response?.data || error.message);
      throw new Error(error.response?.data.message || "Online registration failed");
    }
  } else {
    try {
      const existingUser = localDB.findUserForCheck(details.email, details.username);
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
async function handleGoogleLogin() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const { code } = url.parse(req.url, true).query;
        if (!code) {
          throw new Error("No authorization code received.");
        }
        const tokenResponse = await axios.post(
          "https://oauth2.googleapis.com/token",
          {
            code,
            client_id: process.env.GOOGLE_CLIENT_ID,
            // <-- PASTE YOUR CLIENT ID HERE
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            // <-- PASTE YOUR CLIENT SECRET HERE
            redirect_uri: `http://localhost:${server.address().port}`,
            grant_type: "authorization_code"
          }
        );
        const { access_token, refresh_token } = tokenResponse.data;
        const profileResponse = await axios.get("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${access_token}` }
        });
        res.end("<h1>Authentication successful!</h1><p>You can now close this tab.</p>");
        server.close();
        resolve({
          profile: profileResponse.data,
          tokens: { access_token, refresh_token }
        });
      } catch (error) {
        console.error("OAuth Error:", error.response?.data || error.message);
        res.end("<h1>Authentication failed.</h1>");
        server.close();
        reject(error);
      }
    }).listen(0, () => {
      const { port } = server.address();
      const redirectUri = `http://localhost:${port}`;
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "openid profile email");
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      shell$1.openExternal(authUrl.toString());
    });
  });
}
function getUserIdFromToken$5(token) {
  try {
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
const userGetMe = async (event, mode, token) => {
  if (mode === "online") {
    const response = await axios.get("http://localhost:4000/api/users/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } else {
    const userId = getUserIdFromToken$5(token).id;
    if (!userId) throw new Error("Invalid token for offline mode");
    return localDB.getUserById(userId);
  }
};
const userUpdateProfile = async (event, mode, token, payload) => {
  if (mode === "online") {
    const response = await axios.put("http://localhost:4000/api/users/me", payload, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } else {
    const userId = getUserIdFromToken$5(token).id;
    if (!userId) throw new Error("Invalid token");
    const user2 = localDB.updateUserProfile(userId, payload);
    return { user: user2 };
  }
};
const userGetSettings = async (event, mode, token) => {
  if (mode === "online") {
    const response = await axios.get("http://localhost:4000/api/users/me/settings", {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } else {
    const userId = getUserIdFromToken$5(token).id;
    if (!userId) throw new Error("Invalid token");
    return localDB.getUserSettings(userId);
  }
};
const userUpdateSettings = async (event, mode, token, payload) => {
  if (mode === "online") {
    const response = await axios.put("http://localhost:4000/api/users/me/settings", payload, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } else {
    const userId = getUserIdFromToken$5(token).id;
    if (!userId) throw new Error("Invalid token");
    localDB.updateUserSettings(userId, payload);
    return localDB.getUserSettings(userId);
  }
};
const userChangePassword = async (event, mode, token, payload) => {
  const { old_password, new_password } = payload;
  if (mode === "online") {
    const response = await axios.put("http://localhost:4000/api/users/me/change-password", payload, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } else {
    const userToken = getUserIdFromToken$5(token);
    if (!userToken) throw new Error("Invalid token");
    const user2 = localDB.findUserByIdentifier(userToken.username);
    if (!user2) throw new Error("User not found");
    const match = await bcrypt.compare(old_password, user2.password_hash);
    if (!match) throw new Error("Incorrect current password");
    localDB.changePassword(userToken.id, new_password);
    return { message: "Password updated successfully" };
  }
};
const userDeleteAccount = async (event, mode, token, payload) => {
  const { password } = payload;
  if (mode === "online") {
    const response = await axios.delete("http://localhost:4000/api/users/me", {
      headers: { Authorization: `Bearer ${token}` },
      data: payload
    });
    return response.data;
  } else {
    const userToken = getUserIdFromToken$5(token);
    if (!userToken) throw new Error("Invalid token");
    const user2 = localDB.findUserByIdentifier(userToken.username);
    if (!user2) throw new Error("User not found");
    const match = await bcrypt.compare(password, user2.password_hash);
    if (!match) throw new Error("Incorrect password");
    localDB.deleteUser(userToken.id);
    return { message: "User account deleted successfully" };
  }
};
function getUserIdFromToken$4(token) {
  try {
    if (!token) {
      return null;
    }
    const decoded = jwt.decode(token);
    console.log(decoded);
    return decoded;
  } catch (e) {
    console.error("Error decoding token:", e);
    return null;
  }
}
async function handleCreateJournal(event, mode, token, payload) {
  const userId = getUserIdFromToken$4(token).id;
  if (!userId) throw new Error("Invalid token");
  console.log(mode, payload);
  if (mode === "online") {
    const response = await axios.post("http://localhost:4000/api/journals", payload, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } else {
    return localDB.createJournalEntry(userId, payload);
  }
}
async function handleGettingImages(event, mode, token, getMode) {
  const userId = getUserIdFromToken$4(token).id;
  if (!userId) throw new Error("Invalid token");
  if (mode === "online") {
    const response = await axios.get("http://localhost:4000/api/journals/images", {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } else {
    return localDB.getImageKeysAndIds(userId, getMode);
  }
}
async function handleGetRecentJournals(event, mode, token) {
  const userId = getUserIdFromToken$4(token).id;
  if (!userId) throw new Error("Invalid token");
  if (mode === "online") {
    const response = await axios.get("http://localhost:4000/api/journals/recent", {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } else {
    return localDB.getRecentEntries(userId);
  }
}
async function handleGetAllJournals(event, mode, token, page, limit) {
  console.log("Getting all entries", mode, token);
  const userId = getUserIdFromToken$4(token).id;
  if (!userId) throw new Error("Invalid token");
  if (mode === "online") {
    const response = await axios.get("http://localhost:4000/api/journals", {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } else {
    console.log("Getting all entries offline");
    const ans = localDB.getAllEntries(userId, page, limit);
    console.log(ans);
    return ans;
  }
}
async function handleGetJournalById(event, mode, token, journalId) {
  const userId = getUserIdFromToken$4(token).id;
  if (!userId) throw new Error("Invalid token");
  if (mode === "online") {
    const response = await axios.get(`http://localhost:4000/api/journals/${journalId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } else {
    return localDB.getJournalById(userId, journalId);
  }
}
async function handleUpdateJournal(event, mode, token, journalId, payload) {
  const userId = getUserIdFromToken$4(token).id;
  if (!userId) throw new Error("Invalid token");
  if (mode === "online") {
    const response = await axios.put(`http://localhost:4000/api/journals/${journalId}`, payload, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } else {
    return localDB.updateJournalEntry(userId, journalId, payload);
  }
}
async function handleDeleteJournal(event, mode, token, journalId) {
  const userId = getUserIdFromToken$4(token).id;
  if (!userId) throw new Error("Invalid token");
  if (mode === "online") {
    const response = await axios.delete(`http://localhost:4000/api/journals/${journalId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } else {
    const changes = localDB.deleteJournalEntry(userId, journalId);
    if (changes === 0) throw new Error("Journal entry not found or permission denied");
    return { message: "Journal entry marked for deletion" };
  }
}
async function handleChat(event, mode, token, payload) {
  if (mode === "online") {
    const response = await axios.post("http://localhost:4000/api/journals/chat", payload, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } else {
    return { answer: "I can only answer questions when you are online. Please connect to the internet to use the chat feature." };
  }
}
async function handleGetChartData(event, mode, token, range) {
  const userId = getUserIdFromToken$4(token).id;
  if (!userId) throw new Error("Invalid token");
  if (mode === "online") {
    console.log("later");
  } else {
    return localDB.getMoodScores(userId, range);
  }
}
async function getImageBase64(imagePath) {
  try {
    const data = fs$1.readFileSync(imagePath);
    const base64 = data.toString("base64");
    const mimeType = getMimeType(imagePath);
    return `data:${mimeType};base64,${base64}`;
  } catch (err) {
    console.error("Error loading image:", err);
    return null;
  }
}
function getMimeType(filePath) {
  const ext = filePath.split(".").pop();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return "application/octet-stream";
}
async function getAudioBase64(audioPath) {
  try {
    const fileBuffer = fs$1.readFileSync(audioPath);
    const base64 = fileBuffer.toString("base64");
    return `data:audio/webm;base64,${base64}`;
  } catch (err) {
    console.error("Error reading file:", err);
    return null;
  }
}
const handleSaveMedia = async (event, { journalId, mediaType, arrayBuffer, filename }) => {
  try {
    console.log("Received arrayBuffer:", arrayBuffer);
    const buffer = Buffer.from(arrayBuffer);
    const mediaDir = path$1.join(app$1.getPath("userData"), "media", String(journalId));
    fs$1.mkdirSync(mediaDir, { recursive: true });
    console.log(filename, "original name");
    const name = `audio-${Date.now()}.webm`;
    const uniqueFilename = `${Date.now()}-${mediaType === "image" ? filename : name}`;
    console.log(uniqueFilename, "unique filename");
    const destPath = path$1.join(mediaDir, uniqueFilename);
    fs$1.writeFileSync(destPath, buffer);
    const success = localDB.linkMediaToJournal(journalId, destPath, mediaType);
    if (!success) throw new Error("Failed to link media to journal entry in the database.");
    console.log(`Media saved at: ${destPath}`);
    return { success: true, key: destPath };
  } catch (err) {
    console.error(err);
    return { success: false, message: err.message };
  }
};
async function handleOpenMedia(event, filePath) {
  try {
    if (!fs$1.existsSync(filePath)) {
      throw new Error("File not found at the specified path.");
    }
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    console.error(`Failed to open media file: ${filePath}`, error);
    throw error;
  }
}
function getUserIdFromToken$3(token) {
  try {
    if (!token) {
      return null;
    }
    const decoded = jwt.decode(token);
    console.log(decoded);
    return decoded.id;
  } catch (e) {
    console.error("Error decoding token:", e);
    return null;
  }
}
const handleGetCategories = async (event, authMode, token) => {
  const userId = getUserIdFromToken$3(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") {
    console.log("online mode");
  } else {
    console.log("userId in handleGetCategories:", userId);
    return localDB.getCategories(userId);
  }
};
const handleAddCategory = async (event, authMode, token, category2) => {
  const userId = getUserIdFromToken$3(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online")
    console.log("online mode");
  else
    return localDB.addCategory(userId, category2);
};
const handleUpdateCategory = async (event, authMode, token, category2) => {
  const userId = getUserIdFromToken$3(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online")
    console.log("online mode");
  else
    return localDB.updateCategory(userId, category2);
};
const handleDeleteCategory = async (event, authMode, token, categoryId) => {
  const userId = getUserIdFromToken$3(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online")
    console.log("online mode");
  else
    return localDB.deleteCategory(userId, categoryId);
};
function getUserIdFromToken$2(token) {
  try {
    if (!token) {
      return null;
    }
    const decoded = jwt.decode(token);
    console.log(decoded, "decoded");
    return decoded.id;
  } catch (e) {
    console.error("Error decoding token:", e);
    return null;
  }
}
const handleGetActiveGoals = async (event, authMode, token) => {
  const userId = getUserIdFromToken$2(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") {
    console.log("online mode");
  } else {
    return localDB.getActiveGoals(userId);
  }
};
const handleGetCompletedGoals = async (event, authMode, token) => {
  console.log("calling completed goals");
  const userId = getUserIdFromToken$2(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") {
    console.log("online mode");
  } else {
    return localDB.getCompletedGoals(userId);
  }
};
const handleCreateGoal = async (event, authMode, token, goal2) => {
  console.log("create goal in methods.js", goal2);
  console.log("authMode", authMode);
  console.log("token", token);
  const userId = getUserIdFromToken$2(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") {
    console.log("online mode");
  } else {
    return localDB.AddGoal(userId, goal2);
  }
};
const handleUpdateGoal = async (event, authMode, token, goalId, goalData) => {
  const userId = getUserIdFromToken$2(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") {
    console.log("online mode");
  } else {
    return localDB.updateGoal(userId, goalId, goalData);
  }
};
const handleDeleteGoal = async (event, authMode, token, goalId) => {
  const userId = getUserIdFromToken$2(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") {
    console.log("online mode");
  } else {
    return localDB.deleteGoal(userId, goalId);
  }
};
const handleTogglePin = async (event, authMode, token, goalId) => {
  console.log("+++++++++++", authMode, token, goalId, "++++++++++++++");
  const userId = getUserIdFromToken$2(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") {
    console.log("online mode");
  } else {
    console.log("-----", userId);
    return localDB.togglePinGoal(userId, goalId);
  }
};
const handleCompleteGoal = async (event, authMode, token, goalId) => {
  const userId = getUserIdFromToken$2(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") {
    console.log("online mode");
  } else {
    return localDB.completeGoal(userId, goalId);
  }
};
const handleUpdateProgress = async (event, authMode, token, goalId, value) => {
  const userId = getUserIdFromToken$2(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") {
    console.log("online mode");
  } else {
    return localDB.updateProgress(userId, goalId, value);
  }
};
const handleGetPinnedGoals = (event, authMode, token) => {
  const userId = getUserIdFromToken$2(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") {
    console.log("online mode");
  } else {
    return localDB.getPinnedGoals(userId);
  }
};
function getUserIdFromToken$1(token) {
  try {
    if (!token) {
      return null;
    }
    const decoded = jwt.decode(token);
    console.log(decoded);
    return decoded.id;
  } catch (e) {
    console.error("Error decoding token:", e);
    return null;
  }
}
const handleGetProgressLogs = async (event, authMode, token, goalId) => {
  const userId = getUserIdFromToken$1(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") {
    console.log("online mode");
  } else {
    return localDB.getProgressLogs(goalId);
  }
};
const handleAddProgressLog = async (event, authMode, token, goalId, value, description) => {
  const userId = getUserIdFromToken$1(token);
  console.log(userId, "userID in profgesslofg");
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (authMode === "online") {
    console.log("online mode");
  } else {
    return localDB.logProgress(goalId, value, description);
  }
};
function getUserIdFromToken(token) {
  try {
    if (!token) {
      return null;
    }
    const decoded = jwt.decode(token);
    console.log(decoded, "decoded");
    return decoded.id;
  } catch (e) {
    console.error("Error decoding token:", e);
    return null;
  }
}
const handleGetOllamaModels = (event, token) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  try {
    const output = execSync("ollama list", { encoding: "utf-8" });
    const lines = output.trim().split("\n").slice(1);
    const models = lines.map((line) => {
      const parts = line.trim().split(/\s{2,}/);
      return {
        name: parts[0],
        size: parts[1],
        modified: parts[2]
      };
    });
    return models;
  } catch (error) {
    console.error("Error fetching Ollama models:", error);
    return [];
  }
};
const handleOllamaPrompt = async (event, token, model, prompt, jsonMode = false) => {
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return { error: "Invalid token" };
  }
  if (!model || !prompt) {
    return { error: "Model name and prompt are required." };
  }
  try {
    const requestBody = {
      model,
      prompt,
      stream: false,
      // full output as one JSON
      num_predict: 300
      // limit tokens for speed
    };
    if (jsonMode) {
      requestBody.format = "json";
    }
    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    if (!res.ok) {
      throw new Error(`Ollama HTTP error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    return data.response;
  } catch (err) {
    console.error("Ollama error:", err);
    return { error: err.message };
  }
};
const __filename = fileURLToPath$1(import.meta.url);
const __dirname = path$1.dirname(__filename);
process.env.DIST = path$1.join(__dirname, "../dist");
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL ? path$1.join(__dirname, "../public") : process.env.DIST;
let win;
function createWindow() {
  const win2 = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    // Don't show until maximized
    icon: path$1.join(__dirname, "../assets/icon.png"),
    webPreferences: {
      preload: path$1.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win2.once("ready-to-show", () => {
    if (!win2.isDestroyed()) {
      win2.show();
    }
  });
  win2.webContents.on("did-finish-load", () => {
    if (!win2.isDestroyed()) {
      win2.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
    }
  });
  ipcMain.on("minimize-window", () => {
    win2.minimize();
  });
  ipcMain.on("maximize-window", () => {
    if (win2.isMaximized()) {
      win2.unmaximize();
    } else {
      win2.maximize();
    }
  });
  ipcMain.on("close-window", () => {
    win2.close();
  });
  win2.on("maximize", () => win2.webContents.send("window-maximized", true));
  win2.on("unmaximize", () => win2.webContents.send("window-maximized", false));
  if (process.env.VITE_DEV_SERVER_URL) {
    win2.loadURL(process.env.VITE_DEV_SERVER_URL);
    win2.webContents.openDevTools();
  } else {
    win2.loadFile(path$1.join(process.env.DIST, "index.html"));
  }
}
app$1.whenReady().then(() => {
  localDB.initDatabase();
  ipcMain.handle("media:save", handleSaveMedia);
  ipcMain.handle("media:open", handleOpenMedia);
  ipcMain.handle("media:getImage", async (event, imagePath) => {
    return await getImageBase64(imagePath);
  });
  ipcMain.handle("media:getAudio", async (event, audioPath) => {
    return await getAudioBase64(audioPath);
  });
  ipcMain.on("screen:maximize", () => {
    if (win && !win.isDestroyed()) {
      win.maximize();
    }
  });
  ipcMain.handle("auth:register", handleRegister);
  ipcMain.handle("auth:login", handleLogin);
  ipcMain.handle("login:google", handleGoogleLogin);
  ipcMain.handle("user:get-me", userGetMe);
  ipcMain.handle("user:update-profile", userUpdateProfile);
  ipcMain.handle("user:get-settings", userGetSettings);
  ipcMain.handle("user:update-settings", userUpdateSettings);
  ipcMain.handle("user:change-password", userChangePassword);
  ipcMain.handle("user:delete-account", userDeleteAccount);
  ipcMain.handle("journal:create", handleCreateJournal);
  ipcMain.handle("journal:get-recent", handleGetRecentJournals);
  ipcMain.handle("journal:get-all", handleGetAllJournals);
  ipcMain.handle("journal:get-by-id", handleGetJournalById);
  ipcMain.handle("journal:update", handleUpdateJournal);
  ipcMain.handle("journal:delete", handleDeleteJournal);
  ipcMain.handle("journal:get-images", handleGettingImages);
  ipcMain.handle("journal:get-chart-data", handleGetChartData);
  ipcMain.handle("chat:send", handleChat);
  ipcMain.handle("category:get-all", handleGetCategories);
  ipcMain.handle("category:delete", handleDeleteCategory);
  ipcMain.handle("category:add", handleAddCategory);
  ipcMain.handle("category:update", handleUpdateCategory);
  ipcMain.handle("goal:get-active-goals", handleGetActiveGoals);
  ipcMain.handle("goal:get-completed-goals", handleGetCompletedGoals);
  ipcMain.handle("goal:add", handleCreateGoal);
  ipcMain.handle("goal:update", handleUpdateGoal);
  ipcMain.handle("goal:delete", handleDeleteGoal);
  ipcMain.handle("goal:toggle-pin", handleTogglePin);
  ipcMain.handle("goal:complete", handleCompleteGoal);
  ipcMain.handle("goal:update-progress", handleUpdateProgress);
  ipcMain.handle("goal:getPinned", handleGetPinnedGoals);
  ipcMain.handle("logs:getAll", handleGetProgressLogs);
  ipcMain.handle("logs:add", handleAddProgressLog);
  ipcMain.handle("ollama:models", handleGetOllamaModels);
  ipcMain.handle("ollama:get-response", handleOllamaPrompt);
  startServer();
  createWindow();
  app$1.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app$1.commandLine.appendSwitch("disable-features", "AutofillServerCommunication");
app$1.on("window-all-closed", () => {
  win = null;
  if (process.platform !== "darwin") app$1.quit();
});
