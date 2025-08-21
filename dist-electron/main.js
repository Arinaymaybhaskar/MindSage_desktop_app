import { shell as xe, app as D, ipcMain as m, BrowserWindow as ve } from "electron";
import y from "node:path";
import { fileURLToPath as Ie } from "node:url";
import w from "express";
import Ne from "cors";
import W from "dotenv";
import ke from "cookie-parser";
import B, { dirname as Ae } from "path";
import Se, { fileURLToPath as fe } from "url";
import j from "bcryptjs";
import E from "jsonwebtoken";
import { Pool as Ue } from "pg";
import { OAuth2Client as Le } from "google-auth-library";
import X from "crypto";
import Oe from "nodemailer";
import ge from "fs";
import he from "sentiment";
import { S3Client as De, PutObjectCommand as Ce, GetObjectCommand as be } from "@aws-sdk/client-s3";
import { getSignedUrl as se } from "@aws-sdk/s3-request-presigner";
import h from "axios";
import { z as I } from "zod";
import { GoogleGenAI as Fe } from "@google/genai";
import $e from "better-sqlite3";
import S from "node:fs";
import Me from "http";
import "console";
import { execSync as ze } from "child_process";
W.config();
const c = new Ue({
  host: process.env.MINDSAGE_DB_URL || process.env.DATABASE_URL || "localhost",
  port: 5432,
  user: process.env.MINDSAGE_DB_USERNAME || "postgres",
  password: process.env.MINDSAGE_DB_PASSWORD || "password",
  database: process.env.MINDSAGE_DB_DATABASE || "mindsage",
  ssl: {
    rejectUnauthorized: !1
  }
}), Pe = Oe.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
}), N = w.Router(), Ge = "be1e968105e3d8c510625e7ae117d3b376913c6359b5063bc5ff07f1cc43cfa3229405930cdeb7bcc9e9ebf3199c0b85b1a0c2396018eee4985f2d1a0abf6002", Y = "835261b0476f6ab27b89e3f5584dab137ae30e8d73bc98b72b304373076e7c34c68cc2d92733b32bef0459582a389bc72f5f32f432f06cc87e90101bcbe47b9e", K = (n) => E.sign(n, Ge, { expiresIn: "15m" });
new Le(process.env.O_AUTH_CLIENT_ID);
N.post("/register", async (n, e) => {
  const { username: a, email: s, password: i, timezone: o, full_name: r, authMode: t } = n.body;
  try {
    if ((await c.query(
      "SELECT * FROM users WHERE username = $1 OR email = $2",
      [a, s]
    )).rows.length > 0)
      return e.status(409).json({ message: "Username or email already exists" });
    const l = await j.hash(i, 10), u = await c.query(
      `INSERT INTO users (username, email, password_hash, timezone, full_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username`,
      [a, s, l, o || "Asia/Kolkata", r || null]
    ), f = u.rows[0].id;
    await c.query(
      "INSERT INTO user_settings (user_id) VALUES ($1)",
      [f]
    ), e.status(201).json({ user: u.rows[0] });
  } catch (p) {
    if (p.code === "23505")
      return e.status(409).json({ message: "Username or email already exists" });
    console.error("Registration error:", p), e.status(500).send("Server error");
  }
});
N.post("/check-username", async (n, e) => {
  const { username: a } = n.body;
  try {
    if ((await c.query(
      "SELECT * FROM users WHERE username = $1",
      [a]
    )).rows.length > 0)
      return e.status(409).json({ message: "Username already exists" });
    e.status(200).json({ message: "Username is available" });
  } catch (s) {
    console.error("Check username error:", s), e.status(500).send("Server error");
  }
});
N.post("/login", async (n, e) => {
  const { identifier: a, password: s, timezone: i, rememberMe: o, authMode: r } = n.body;
  if (!a || !s) return e.status(400).json({ error: "Identifier and password are mandatory" });
  let t;
  a.includes("@") ? t = "SELECT * FROM users WHERE email = $1" : t = "SELECT * FROM users WHERE username = $1";
  try {
    const l = (await c.query(t, [a])).rows[0];
    if (!l) return e.status(404).send("User not found");
    if (!await j.compare(s, l.password_hash)) return e.status(403).send("Incorrect password");
    const f = K({
      id: l.id,
      username: l.username
    }), b = o ? "30d" : "1d", Q = o ? 720 * 60 * 60 * 1e3 : 1440 * 60 * 1e3, C = E.sign(
      { id: l.id },
      Y,
      { expiresIn: b }
    );
    i && await c.query(
      "UPDATE users SET timezone = $1 WHERE id = $2",
      [i, l.id]
    ), await c.query(
      "INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)",
      [l.id, C]
    ), e.cookie("refreshToken", C, {
      httpOnly: !0,
      secure: process.env.NODE_ENV === "production",
      // Use secure cookies in production
      sameSite: "Strict",
      maxAge: Q,
      path: "/api/auth/refresh-token"
    });
    const q = { created_at: l.created_at, email: l.email, id: l.id, full_name: l.full_name, username: l.username, timezone: l.timezone };
    e.json({ accessToken: f, userInfo: q });
  } catch (p) {
    console.error("Login error:", p), e.status(500).send("Server error");
  }
});
N.post("/token", async (n, e) => {
  const a = n.body.token;
  if (!a) return e.sendStatus(401);
  try {
    if ((await c.query("SELECT * FROM refresh_tokens WHERE token = $1 AND is_revoked = FALSE", [a])).rows.length === 0) return e.sendStatus(403);
    E.verify(a, Y, (i, o) => {
      if (i) return e.sendStatus(403);
      const r = o.id || o.userId;
      if (!r) return e.sendStatus(403);
      const t = K({ id: r });
      e.json({ accessToken: t });
    });
  } catch (s) {
    console.error("Token refresh error:", s), e.sendStatus(500);
  }
});
N.delete("/logout", async (n, e) => {
  const { token: a } = n.body;
  if (!a) return e.status(400).json({ message: "Refresh token is required" });
  try {
    await c.query("UPDATE refresh_tokens SET is_revoked = TRUE WHERE token = $1", [a]), e.clearCookie("refreshToken", { path: "/api/auth/refresh-token" }), e.sendStatus(204);
  } catch (s) {
    console.error("Logout error:", s), e.sendStatus(500);
  }
});
N.post("/google-login", async (n, e) => {
  const { profile: a } = n.body.response;
  if (!a)
    return e.status(400).json({ message: "Missing profile" });
  try {
    const { email: s, name: i, id: o } = a, r = await c.query(
      "SELECT * FROM users WHERE email = $1",
      [s]
    );
    let t;
    r.rows.length === 0 ? t = (await c.query(
      "INSERT INTO users (username, email, password_hash, full_name) VALUES ($1, $2, $3, $4) RETURNING *",
      [i || `user${Date.now()}`, s, o, i]
      // Using googleId as dummy password hash
    )).rows[0] : t = r.rows[0];
    const p = K({ id: t.id, username: t.username }), l = E.sign({ id: t.id }, Y, { expiresIn: "7d" });
    await c.query(
      "INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)",
      [t.id, l]
    ), e.cookie("refreshToken", l, {
      httpOnly: !0,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 10080 * 60 * 1e3,
      // 7 days
      path: "/api/auth/refresh-token"
    });
    const u = { created_at: t.created_at, email: t.email, id: t.id, full_name: t.full_name, username: t.username, timezone: t.timezone };
    e.json({ accessToken: p, userInfo: u });
  } catch (s) {
    console.error("Google login error:", s), e.status(401).json({ message: "Invalid Google credential" });
  }
});
N.post("/forgot-password", async (n, e) => {
  const { identifier: a } = n.body;
  if (!a)
    return e.status(400).json({ message: "Identifier is required" });
  let s;
  a.includes("@") ? s = "SELECT id, email, full_name FROM users WHERE email = $1" : s = "SELECT id, email, full_name FROM users WHERE username = $1";
  try {
    const i = await c.query(s, [a]);
    if (i.rows.length === 0)
      return e.status(404).json({ message: "User not found" });
    const o = i.rows[0], r = X.randomInt(1e5, 999999), t = X.createHash("sha256").update(String(r)).digest("hex"), p = new Date(Date.now() + 600 * 1e3);
    await c.query(
      "UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3",
      [t, p, o.id]
    );
    const u = ge.readFileSync("models/mailModel.html", "utf-8").replace("{{OTP}}", r).replace("{{FULL_NAME}}", o.full_name || "User"), f = {
      from: process.env.EMAIL_USER,
      to: o.email,
      subject: "Your Password Reset OTP",
      html: u
    };
    await Pe.sendMail(f);
    const b = o.email.replace(/(.{2}).+(@.+)/, "$1****$2");
    e.json({ message: `OTP sent to ${b}` });
  } catch (i) {
    console.error("Forgot password error:", i), e.status(500).send("Server error");
  }
});
N.post("/verify-otp", async (n, e) => {
  const { identifier: a, otp: s } = n.body;
  if (!a || !s)
    return e.status(400).json({ message: "Identifier and OTP are required." });
  try {
    const i = await c.query(
      "SELECT * FROM users WHERE email = $1 OR username = $1",
      [a]
    );
    if (i.rows.length === 0)
      return e.status(404).json({ message: "User not found." });
    const o = i.rows[0];
    if (!o.reset_token || !o.reset_token_expiry)
      return e.status(400).json({ message: "No OTP has been requested for this user." });
    if (new Date(o.reset_token_expiry) < /* @__PURE__ */ new Date())
      return e.status(400).json({ message: "OTP expired." });
    if (X.createHash("sha256").update(String(s)).digest("hex") !== o.reset_token)
      return e.status(400).json({ message: "Invalid OTP." });
    await c.query(
      "UPDATE users SET reset_token = NULL, reset_token_expiry = NULL WHERE id = $1",
      [o.id]
    );
    const p = K({
      id: o.id,
      username: o.username
    }), l = E.sign(
      { id: o.id },
      Y,
      { expiresIn: "7d" }
    );
    await c.query(
      "INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)",
      [o.id, l]
    ), e.cookie("refreshToken", l, {
      httpOnly: !0,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 10080 * 60 * 1e3,
      // 7 days
      path: "/api/auth/refresh-token"
    });
    const u = { created_at: o.created_at, email: o.email, id: o.id, full_name: o.full_name, username: o.username, timezone: o.timezone };
    e.json({ message: "OTP verified successfully. Logged in.", accessToken: p, userInfo: u });
  } catch (i) {
    console.error("OTP verification error:", i), e.status(500).json({ message: "Internal server error." });
  }
});
function x(n, e, a) {
  const s = n.headers.authorization, i = s && s.split(" ")[1];
  if (i == null) return e.status(401).send("Unauthorized");
  E.verify(i, "be1e968105e3d8c510625e7ae117d3b376913c6359b5063bc5ff07f1cc43cfa3229405930cdeb7bcc9e9ebf3199c0b85b1a0c2396018eee4985f2d1a0abf6002", (r, t) => {
    if (r) return e.status(403).send("Forbidden");
    n.user = t, a();
  });
}
function qe(n) {
  return n && n.__esModule && Object.prototype.hasOwnProperty.call(n, "default") ? n.default : n;
}
var ee = {};
const Xe = {
  "application/1d-interleaved-parityfec": { source: "iana" },
  "application/3gpdash-qoe-report+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/3gpp-ims+xml": { source: "iana", compressible: !0 },
  "application/3gpphal+json": { source: "iana", compressible: !0 },
  "application/3gpphalforms+json": { source: "iana", compressible: !0 },
  "application/a2l": { source: "iana" },
  "application/ace+cbor": { source: "iana" },
  "application/activemessage": { source: "iana" },
  "application/activity+json": { source: "iana", compressible: !0 },
  "application/alto-costmap+json": { source: "iana", compressible: !0 },
  "application/alto-costmapfilter+json": { source: "iana", compressible: !0 },
  "application/alto-directory+json": { source: "iana", compressible: !0 },
  "application/alto-endpointcost+json": { source: "iana", compressible: !0 },
  "application/alto-endpointcostparams+json": { source: "iana", compressible: !0 },
  "application/alto-endpointprop+json": { source: "iana", compressible: !0 },
  "application/alto-endpointpropparams+json": { source: "iana", compressible: !0 },
  "application/alto-error+json": { source: "iana", compressible: !0 },
  "application/alto-networkmap+json": { source: "iana", compressible: !0 },
  "application/alto-networkmapfilter+json": { source: "iana", compressible: !0 },
  "application/alto-updatestreamcontrol+json": { source: "iana", compressible: !0 },
  "application/alto-updatestreamparams+json": { source: "iana", compressible: !0 },
  "application/aml": { source: "iana" },
  "application/andrew-inset": { source: "iana", extensions: ["ez"] },
  "application/applefile": { source: "iana" },
  "application/applixware": { source: "apache", extensions: ["aw"] },
  "application/at+jwt": { source: "iana" },
  "application/atf": { source: "iana" },
  "application/atfx": { source: "iana" },
  "application/atom+xml": { source: "iana", compressible: !0, extensions: ["atom"] },
  "application/atomcat+xml": { source: "iana", compressible: !0, extensions: ["atomcat"] },
  "application/atomdeleted+xml": { source: "iana", compressible: !0, extensions: ["atomdeleted"] },
  "application/atomicmail": { source: "iana" },
  "application/atomsvc+xml": { source: "iana", compressible: !0, extensions: ["atomsvc"] },
  "application/atsc-dwd+xml": { source: "iana", compressible: !0, extensions: ["dwd"] },
  "application/atsc-dynamic-event-message": { source: "iana" },
  "application/atsc-held+xml": { source: "iana", compressible: !0, extensions: ["held"] },
  "application/atsc-rdt+json": { source: "iana", compressible: !0 },
  "application/atsc-rsat+xml": { source: "iana", compressible: !0, extensions: ["rsat"] },
  "application/atxml": { source: "iana" },
  "application/auth-policy+xml": { source: "iana", compressible: !0 },
  "application/bacnet-xdd+zip": { source: "iana", compressible: !1 },
  "application/batch-smtp": { source: "iana" },
  "application/bdoc": { compressible: !1, extensions: ["bdoc"] },
  "application/beep+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/calendar+json": { source: "iana", compressible: !0 },
  "application/calendar+xml": { source: "iana", compressible: !0, extensions: ["xcs"] },
  "application/call-completion": { source: "iana" },
  "application/cals-1840": { source: "iana" },
  "application/captive+json": { source: "iana", compressible: !0 },
  "application/cbor": { source: "iana" },
  "application/cbor-seq": { source: "iana" },
  "application/cccex": { source: "iana" },
  "application/ccmp+xml": { source: "iana", compressible: !0 },
  "application/ccxml+xml": { source: "iana", compressible: !0, extensions: ["ccxml"] },
  "application/cdfx+xml": { source: "iana", compressible: !0, extensions: ["cdfx"] },
  "application/cdmi-capability": { source: "iana", extensions: ["cdmia"] },
  "application/cdmi-container": { source: "iana", extensions: ["cdmic"] },
  "application/cdmi-domain": { source: "iana", extensions: ["cdmid"] },
  "application/cdmi-object": { source: "iana", extensions: ["cdmio"] },
  "application/cdmi-queue": { source: "iana", extensions: ["cdmiq"] },
  "application/cdni": { source: "iana" },
  "application/cea": { source: "iana" },
  "application/cea-2018+xml": { source: "iana", compressible: !0 },
  "application/cellml+xml": { source: "iana", compressible: !0 },
  "application/cfw": { source: "iana" },
  "application/city+json": { source: "iana", compressible: !0 },
  "application/clr": { source: "iana" },
  "application/clue+xml": { source: "iana", compressible: !0 },
  "application/clue_info+xml": { source: "iana", compressible: !0 },
  "application/cms": { source: "iana" },
  "application/cnrp+xml": { source: "iana", compressible: !0 },
  "application/coap-group+json": { source: "iana", compressible: !0 },
  "application/coap-payload": { source: "iana" },
  "application/commonground": { source: "iana" },
  "application/conference-info+xml": { source: "iana", compressible: !0 },
  "application/cose": { source: "iana" },
  "application/cose-key": { source: "iana" },
  "application/cose-key-set": { source: "iana" },
  "application/cpl+xml": { source: "iana", compressible: !0, extensions: ["cpl"] },
  "application/csrattrs": { source: "iana" },
  "application/csta+xml": { source: "iana", compressible: !0 },
  "application/cstadata+xml": { source: "iana", compressible: !0 },
  "application/csvm+json": { source: "iana", compressible: !0 },
  "application/cu-seeme": { source: "apache", extensions: ["cu"] },
  "application/cwt": { source: "iana" },
  "application/cybercash": { source: "iana" },
  "application/dart": { compressible: !0 },
  "application/dash+xml": { source: "iana", compressible: !0, extensions: ["mpd"] },
  "application/dash-patch+xml": { source: "iana", compressible: !0, extensions: ["mpp"] },
  "application/dashdelta": { source: "iana" },
  "application/davmount+xml": { source: "iana", compressible: !0, extensions: ["davmount"] },
  "application/dca-rft": { source: "iana" },
  "application/dcd": { source: "iana" },
  "application/dec-dx": { source: "iana" },
  "application/dialog-info+xml": { source: "iana", compressible: !0 },
  "application/dicom": { source: "iana" },
  "application/dicom+json": { source: "iana", compressible: !0 },
  "application/dicom+xml": { source: "iana", compressible: !0 },
  "application/dii": { source: "iana" },
  "application/dit": { source: "iana" },
  "application/dns": { source: "iana" },
  "application/dns+json": { source: "iana", compressible: !0 },
  "application/dns-message": { source: "iana" },
  "application/docbook+xml": { source: "apache", compressible: !0, extensions: ["dbk"] },
  "application/dots+cbor": { source: "iana" },
  "application/dskpp+xml": { source: "iana", compressible: !0 },
  "application/dssc+der": { source: "iana", extensions: ["dssc"] },
  "application/dssc+xml": { source: "iana", compressible: !0, extensions: ["xdssc"] },
  "application/dvcs": { source: "iana" },
  "application/ecmascript": { source: "iana", compressible: !0, extensions: ["es", "ecma"] },
  "application/edi-consent": { source: "iana" },
  "application/edi-x12": { source: "iana", compressible: !1 },
  "application/edifact": { source: "iana", compressible: !1 },
  "application/efi": { source: "iana" },
  "application/elm+json": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/elm+xml": { source: "iana", compressible: !0 },
  "application/emergencycalldata.cap+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/emergencycalldata.comment+xml": { source: "iana", compressible: !0 },
  "application/emergencycalldata.control+xml": { source: "iana", compressible: !0 },
  "application/emergencycalldata.deviceinfo+xml": { source: "iana", compressible: !0 },
  "application/emergencycalldata.ecall.msd": { source: "iana" },
  "application/emergencycalldata.providerinfo+xml": { source: "iana", compressible: !0 },
  "application/emergencycalldata.serviceinfo+xml": { source: "iana", compressible: !0 },
  "application/emergencycalldata.subscriberinfo+xml": { source: "iana", compressible: !0 },
  "application/emergencycalldata.veds+xml": { source: "iana", compressible: !0 },
  "application/emma+xml": { source: "iana", compressible: !0, extensions: ["emma"] },
  "application/emotionml+xml": { source: "iana", compressible: !0, extensions: ["emotionml"] },
  "application/encaprtp": { source: "iana" },
  "application/epp+xml": { source: "iana", compressible: !0 },
  "application/epub+zip": { source: "iana", compressible: !1, extensions: ["epub"] },
  "application/eshop": { source: "iana" },
  "application/exi": { source: "iana", extensions: ["exi"] },
  "application/expect-ct-report+json": { source: "iana", compressible: !0 },
  "application/express": { source: "iana", extensions: ["exp"] },
  "application/fastinfoset": { source: "iana" },
  "application/fastsoap": { source: "iana" },
  "application/fdt+xml": { source: "iana", compressible: !0, extensions: ["fdt"] },
  "application/fhir+json": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/fhir+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/fido.trusted-apps+json": { compressible: !0 },
  "application/fits": { source: "iana" },
  "application/flexfec": { source: "iana" },
  "application/font-sfnt": { source: "iana" },
  "application/font-tdpfr": { source: "iana", extensions: ["pfr"] },
  "application/font-woff": { source: "iana", compressible: !1 },
  "application/framework-attributes+xml": { source: "iana", compressible: !0 },
  "application/geo+json": { source: "iana", compressible: !0, extensions: ["geojson"] },
  "application/geo+json-seq": { source: "iana" },
  "application/geopackage+sqlite3": { source: "iana" },
  "application/geoxacml+xml": { source: "iana", compressible: !0 },
  "application/gltf-buffer": { source: "iana" },
  "application/gml+xml": { source: "iana", compressible: !0, extensions: ["gml"] },
  "application/gpx+xml": { source: "apache", compressible: !0, extensions: ["gpx"] },
  "application/gxf": { source: "apache", extensions: ["gxf"] },
  "application/gzip": { source: "iana", compressible: !1, extensions: ["gz"] },
  "application/h224": { source: "iana" },
  "application/held+xml": { source: "iana", compressible: !0 },
  "application/hjson": { extensions: ["hjson"] },
  "application/http": { source: "iana" },
  "application/hyperstudio": { source: "iana", extensions: ["stk"] },
  "application/ibe-key-request+xml": { source: "iana", compressible: !0 },
  "application/ibe-pkg-reply+xml": { source: "iana", compressible: !0 },
  "application/ibe-pp-data": { source: "iana" },
  "application/iges": { source: "iana" },
  "application/im-iscomposing+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/index": { source: "iana" },
  "application/index.cmd": { source: "iana" },
  "application/index.obj": { source: "iana" },
  "application/index.response": { source: "iana" },
  "application/index.vnd": { source: "iana" },
  "application/inkml+xml": { source: "iana", compressible: !0, extensions: ["ink", "inkml"] },
  "application/iotp": { source: "iana" },
  "application/ipfix": { source: "iana", extensions: ["ipfix"] },
  "application/ipp": { source: "iana" },
  "application/isup": { source: "iana" },
  "application/its+xml": { source: "iana", compressible: !0, extensions: ["its"] },
  "application/java-archive": { source: "apache", compressible: !1, extensions: ["jar", "war", "ear"] },
  "application/java-serialized-object": { source: "apache", compressible: !1, extensions: ["ser"] },
  "application/java-vm": { source: "apache", compressible: !1, extensions: ["class"] },
  "application/javascript": { source: "iana", charset: "UTF-8", compressible: !0, extensions: ["js", "mjs"] },
  "application/jf2feed+json": { source: "iana", compressible: !0 },
  "application/jose": { source: "iana" },
  "application/jose+json": { source: "iana", compressible: !0 },
  "application/jrd+json": { source: "iana", compressible: !0 },
  "application/jscalendar+json": { source: "iana", compressible: !0 },
  "application/json": { source: "iana", charset: "UTF-8", compressible: !0, extensions: ["json", "map"] },
  "application/json-patch+json": { source: "iana", compressible: !0 },
  "application/json-seq": { source: "iana" },
  "application/json5": { extensions: ["json5"] },
  "application/jsonml+json": { source: "apache", compressible: !0, extensions: ["jsonml"] },
  "application/jwk+json": { source: "iana", compressible: !0 },
  "application/jwk-set+json": { source: "iana", compressible: !0 },
  "application/jwt": { source: "iana" },
  "application/kpml-request+xml": { source: "iana", compressible: !0 },
  "application/kpml-response+xml": { source: "iana", compressible: !0 },
  "application/ld+json": { source: "iana", compressible: !0, extensions: ["jsonld"] },
  "application/lgr+xml": { source: "iana", compressible: !0, extensions: ["lgr"] },
  "application/link-format": { source: "iana" },
  "application/load-control+xml": { source: "iana", compressible: !0 },
  "application/lost+xml": { source: "iana", compressible: !0, extensions: ["lostxml"] },
  "application/lostsync+xml": { source: "iana", compressible: !0 },
  "application/lpf+zip": { source: "iana", compressible: !1 },
  "application/lxf": { source: "iana" },
  "application/mac-binhex40": { source: "iana", extensions: ["hqx"] },
  "application/mac-compactpro": { source: "apache", extensions: ["cpt"] },
  "application/macwriteii": { source: "iana" },
  "application/mads+xml": { source: "iana", compressible: !0, extensions: ["mads"] },
  "application/manifest+json": { source: "iana", charset: "UTF-8", compressible: !0, extensions: ["webmanifest"] },
  "application/marc": { source: "iana", extensions: ["mrc"] },
  "application/marcxml+xml": { source: "iana", compressible: !0, extensions: ["mrcx"] },
  "application/mathematica": { source: "iana", extensions: ["ma", "nb", "mb"] },
  "application/mathml+xml": { source: "iana", compressible: !0, extensions: ["mathml"] },
  "application/mathml-content+xml": { source: "iana", compressible: !0 },
  "application/mathml-presentation+xml": { source: "iana", compressible: !0 },
  "application/mbms-associated-procedure-description+xml": { source: "iana", compressible: !0 },
  "application/mbms-deregister+xml": { source: "iana", compressible: !0 },
  "application/mbms-envelope+xml": { source: "iana", compressible: !0 },
  "application/mbms-msk+xml": { source: "iana", compressible: !0 },
  "application/mbms-msk-response+xml": { source: "iana", compressible: !0 },
  "application/mbms-protection-description+xml": { source: "iana", compressible: !0 },
  "application/mbms-reception-report+xml": { source: "iana", compressible: !0 },
  "application/mbms-register+xml": { source: "iana", compressible: !0 },
  "application/mbms-register-response+xml": { source: "iana", compressible: !0 },
  "application/mbms-schedule+xml": { source: "iana", compressible: !0 },
  "application/mbms-user-service-description+xml": { source: "iana", compressible: !0 },
  "application/mbox": { source: "iana", extensions: ["mbox"] },
  "application/media-policy-dataset+xml": { source: "iana", compressible: !0, extensions: ["mpf"] },
  "application/media_control+xml": { source: "iana", compressible: !0 },
  "application/mediaservercontrol+xml": { source: "iana", compressible: !0, extensions: ["mscml"] },
  "application/merge-patch+json": { source: "iana", compressible: !0 },
  "application/metalink+xml": { source: "apache", compressible: !0, extensions: ["metalink"] },
  "application/metalink4+xml": { source: "iana", compressible: !0, extensions: ["meta4"] },
  "application/mets+xml": { source: "iana", compressible: !0, extensions: ["mets"] },
  "application/mf4": { source: "iana" },
  "application/mikey": { source: "iana" },
  "application/mipc": { source: "iana" },
  "application/missing-blocks+cbor-seq": { source: "iana" },
  "application/mmt-aei+xml": { source: "iana", compressible: !0, extensions: ["maei"] },
  "application/mmt-usd+xml": { source: "iana", compressible: !0, extensions: ["musd"] },
  "application/mods+xml": { source: "iana", compressible: !0, extensions: ["mods"] },
  "application/moss-keys": { source: "iana" },
  "application/moss-signature": { source: "iana" },
  "application/mosskey-data": { source: "iana" },
  "application/mosskey-request": { source: "iana" },
  "application/mp21": { source: "iana", extensions: ["m21", "mp21"] },
  "application/mp4": { source: "iana", extensions: ["mp4s", "m4p"] },
  "application/mpeg4-generic": { source: "iana" },
  "application/mpeg4-iod": { source: "iana" },
  "application/mpeg4-iod-xmt": { source: "iana" },
  "application/mrb-consumer+xml": { source: "iana", compressible: !0 },
  "application/mrb-publish+xml": { source: "iana", compressible: !0 },
  "application/msc-ivr+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/msc-mixer+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/msword": { source: "iana", compressible: !1, extensions: ["doc", "dot"] },
  "application/mud+json": { source: "iana", compressible: !0 },
  "application/multipart-core": { source: "iana" },
  "application/mxf": { source: "iana", extensions: ["mxf"] },
  "application/n-quads": { source: "iana", extensions: ["nq"] },
  "application/n-triples": { source: "iana", extensions: ["nt"] },
  "application/nasdata": { source: "iana" },
  "application/news-checkgroups": { source: "iana", charset: "US-ASCII" },
  "application/news-groupinfo": { source: "iana", charset: "US-ASCII" },
  "application/news-transmission": { source: "iana" },
  "application/nlsml+xml": { source: "iana", compressible: !0 },
  "application/node": { source: "iana", extensions: ["cjs"] },
  "application/nss": { source: "iana" },
  "application/oauth-authz-req+jwt": { source: "iana" },
  "application/oblivious-dns-message": { source: "iana" },
  "application/ocsp-request": { source: "iana" },
  "application/ocsp-response": { source: "iana" },
  "application/octet-stream": { source: "iana", compressible: !1, extensions: ["bin", "dms", "lrf", "mar", "so", "dist", "distz", "pkg", "bpk", "dump", "elc", "deploy", "exe", "dll", "deb", "dmg", "iso", "img", "msi", "msp", "msm", "buffer"] },
  "application/oda": { source: "iana", extensions: ["oda"] },
  "application/odm+xml": { source: "iana", compressible: !0 },
  "application/odx": { source: "iana" },
  "application/oebps-package+xml": { source: "iana", compressible: !0, extensions: ["opf"] },
  "application/ogg": { source: "iana", compressible: !1, extensions: ["ogx"] },
  "application/omdoc+xml": { source: "apache", compressible: !0, extensions: ["omdoc"] },
  "application/onenote": { source: "apache", extensions: ["onetoc", "onetoc2", "onetmp", "onepkg"] },
  "application/opc-nodeset+xml": { source: "iana", compressible: !0 },
  "application/oscore": { source: "iana" },
  "application/oxps": { source: "iana", extensions: ["oxps"] },
  "application/p21": { source: "iana" },
  "application/p21+zip": { source: "iana", compressible: !1 },
  "application/p2p-overlay+xml": { source: "iana", compressible: !0, extensions: ["relo"] },
  "application/parityfec": { source: "iana" },
  "application/passport": { source: "iana" },
  "application/patch-ops-error+xml": { source: "iana", compressible: !0, extensions: ["xer"] },
  "application/pdf": { source: "iana", compressible: !1, extensions: ["pdf"] },
  "application/pdx": { source: "iana" },
  "application/pem-certificate-chain": { source: "iana" },
  "application/pgp-encrypted": { source: "iana", compressible: !1, extensions: ["pgp"] },
  "application/pgp-keys": { source: "iana", extensions: ["asc"] },
  "application/pgp-signature": { source: "iana", extensions: ["asc", "sig"] },
  "application/pics-rules": { source: "apache", extensions: ["prf"] },
  "application/pidf+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/pidf-diff+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/pkcs10": { source: "iana", extensions: ["p10"] },
  "application/pkcs12": { source: "iana" },
  "application/pkcs7-mime": { source: "iana", extensions: ["p7m", "p7c"] },
  "application/pkcs7-signature": { source: "iana", extensions: ["p7s"] },
  "application/pkcs8": { source: "iana", extensions: ["p8"] },
  "application/pkcs8-encrypted": { source: "iana" },
  "application/pkix-attr-cert": { source: "iana", extensions: ["ac"] },
  "application/pkix-cert": { source: "iana", extensions: ["cer"] },
  "application/pkix-crl": { source: "iana", extensions: ["crl"] },
  "application/pkix-pkipath": { source: "iana", extensions: ["pkipath"] },
  "application/pkixcmp": { source: "iana", extensions: ["pki"] },
  "application/pls+xml": { source: "iana", compressible: !0, extensions: ["pls"] },
  "application/poc-settings+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/postscript": { source: "iana", compressible: !0, extensions: ["ai", "eps", "ps"] },
  "application/ppsp-tracker+json": { source: "iana", compressible: !0 },
  "application/problem+json": { source: "iana", compressible: !0 },
  "application/problem+xml": { source: "iana", compressible: !0 },
  "application/provenance+xml": { source: "iana", compressible: !0, extensions: ["provx"] },
  "application/prs.alvestrand.titrax-sheet": { source: "iana" },
  "application/prs.cww": { source: "iana", extensions: ["cww"] },
  "application/prs.cyn": { source: "iana", charset: "7-BIT" },
  "application/prs.hpub+zip": { source: "iana", compressible: !1 },
  "application/prs.nprend": { source: "iana" },
  "application/prs.plucker": { source: "iana" },
  "application/prs.rdf-xml-crypt": { source: "iana" },
  "application/prs.xsf+xml": { source: "iana", compressible: !0 },
  "application/pskc+xml": { source: "iana", compressible: !0, extensions: ["pskcxml"] },
  "application/pvd+json": { source: "iana", compressible: !0 },
  "application/qsig": { source: "iana" },
  "application/raml+yaml": { compressible: !0, extensions: ["raml"] },
  "application/raptorfec": { source: "iana" },
  "application/rdap+json": { source: "iana", compressible: !0 },
  "application/rdf+xml": { source: "iana", compressible: !0, extensions: ["rdf", "owl"] },
  "application/reginfo+xml": { source: "iana", compressible: !0, extensions: ["rif"] },
  "application/relax-ng-compact-syntax": { source: "iana", extensions: ["rnc"] },
  "application/remote-printing": { source: "iana" },
  "application/reputon+json": { source: "iana", compressible: !0 },
  "application/resource-lists+xml": { source: "iana", compressible: !0, extensions: ["rl"] },
  "application/resource-lists-diff+xml": { source: "iana", compressible: !0, extensions: ["rld"] },
  "application/rfc+xml": { source: "iana", compressible: !0 },
  "application/riscos": { source: "iana" },
  "application/rlmi+xml": { source: "iana", compressible: !0 },
  "application/rls-services+xml": { source: "iana", compressible: !0, extensions: ["rs"] },
  "application/route-apd+xml": { source: "iana", compressible: !0, extensions: ["rapd"] },
  "application/route-s-tsid+xml": { source: "iana", compressible: !0, extensions: ["sls"] },
  "application/route-usd+xml": { source: "iana", compressible: !0, extensions: ["rusd"] },
  "application/rpki-ghostbusters": { source: "iana", extensions: ["gbr"] },
  "application/rpki-manifest": { source: "iana", extensions: ["mft"] },
  "application/rpki-publication": { source: "iana" },
  "application/rpki-roa": { source: "iana", extensions: ["roa"] },
  "application/rpki-updown": { source: "iana" },
  "application/rsd+xml": { source: "apache", compressible: !0, extensions: ["rsd"] },
  "application/rss+xml": { source: "apache", compressible: !0, extensions: ["rss"] },
  "application/rtf": { source: "iana", compressible: !0, extensions: ["rtf"] },
  "application/rtploopback": { source: "iana" },
  "application/rtx": { source: "iana" },
  "application/samlassertion+xml": { source: "iana", compressible: !0 },
  "application/samlmetadata+xml": { source: "iana", compressible: !0 },
  "application/sarif+json": { source: "iana", compressible: !0 },
  "application/sarif-external-properties+json": { source: "iana", compressible: !0 },
  "application/sbe": { source: "iana" },
  "application/sbml+xml": { source: "iana", compressible: !0, extensions: ["sbml"] },
  "application/scaip+xml": { source: "iana", compressible: !0 },
  "application/scim+json": { source: "iana", compressible: !0 },
  "application/scvp-cv-request": { source: "iana", extensions: ["scq"] },
  "application/scvp-cv-response": { source: "iana", extensions: ["scs"] },
  "application/scvp-vp-request": { source: "iana", extensions: ["spq"] },
  "application/scvp-vp-response": { source: "iana", extensions: ["spp"] },
  "application/sdp": { source: "iana", extensions: ["sdp"] },
  "application/secevent+jwt": { source: "iana" },
  "application/senml+cbor": { source: "iana" },
  "application/senml+json": { source: "iana", compressible: !0 },
  "application/senml+xml": { source: "iana", compressible: !0, extensions: ["senmlx"] },
  "application/senml-etch+cbor": { source: "iana" },
  "application/senml-etch+json": { source: "iana", compressible: !0 },
  "application/senml-exi": { source: "iana" },
  "application/sensml+cbor": { source: "iana" },
  "application/sensml+json": { source: "iana", compressible: !0 },
  "application/sensml+xml": { source: "iana", compressible: !0, extensions: ["sensmlx"] },
  "application/sensml-exi": { source: "iana" },
  "application/sep+xml": { source: "iana", compressible: !0 },
  "application/sep-exi": { source: "iana" },
  "application/session-info": { source: "iana" },
  "application/set-payment": { source: "iana" },
  "application/set-payment-initiation": { source: "iana", extensions: ["setpay"] },
  "application/set-registration": { source: "iana" },
  "application/set-registration-initiation": { source: "iana", extensions: ["setreg"] },
  "application/sgml": { source: "iana" },
  "application/sgml-open-catalog": { source: "iana" },
  "application/shf+xml": { source: "iana", compressible: !0, extensions: ["shf"] },
  "application/sieve": { source: "iana", extensions: ["siv", "sieve"] },
  "application/simple-filter+xml": { source: "iana", compressible: !0 },
  "application/simple-message-summary": { source: "iana" },
  "application/simplesymbolcontainer": { source: "iana" },
  "application/sipc": { source: "iana" },
  "application/slate": { source: "iana" },
  "application/smil": { source: "iana" },
  "application/smil+xml": { source: "iana", compressible: !0, extensions: ["smi", "smil"] },
  "application/smpte336m": { source: "iana" },
  "application/soap+fastinfoset": { source: "iana" },
  "application/soap+xml": { source: "iana", compressible: !0 },
  "application/sparql-query": { source: "iana", extensions: ["rq"] },
  "application/sparql-results+xml": { source: "iana", compressible: !0, extensions: ["srx"] },
  "application/spdx+json": { source: "iana", compressible: !0 },
  "application/spirits-event+xml": { source: "iana", compressible: !0 },
  "application/sql": { source: "iana" },
  "application/srgs": { source: "iana", extensions: ["gram"] },
  "application/srgs+xml": { source: "iana", compressible: !0, extensions: ["grxml"] },
  "application/sru+xml": { source: "iana", compressible: !0, extensions: ["sru"] },
  "application/ssdl+xml": { source: "apache", compressible: !0, extensions: ["ssdl"] },
  "application/ssml+xml": { source: "iana", compressible: !0, extensions: ["ssml"] },
  "application/stix+json": { source: "iana", compressible: !0 },
  "application/swid+xml": { source: "iana", compressible: !0, extensions: ["swidtag"] },
  "application/tamp-apex-update": { source: "iana" },
  "application/tamp-apex-update-confirm": { source: "iana" },
  "application/tamp-community-update": { source: "iana" },
  "application/tamp-community-update-confirm": { source: "iana" },
  "application/tamp-error": { source: "iana" },
  "application/tamp-sequence-adjust": { source: "iana" },
  "application/tamp-sequence-adjust-confirm": { source: "iana" },
  "application/tamp-status-query": { source: "iana" },
  "application/tamp-status-response": { source: "iana" },
  "application/tamp-update": { source: "iana" },
  "application/tamp-update-confirm": { source: "iana" },
  "application/tar": { compressible: !0 },
  "application/taxii+json": { source: "iana", compressible: !0 },
  "application/td+json": { source: "iana", compressible: !0 },
  "application/tei+xml": { source: "iana", compressible: !0, extensions: ["tei", "teicorpus"] },
  "application/tetra_isi": { source: "iana" },
  "application/thraud+xml": { source: "iana", compressible: !0, extensions: ["tfi"] },
  "application/timestamp-query": { source: "iana" },
  "application/timestamp-reply": { source: "iana" },
  "application/timestamped-data": { source: "iana", extensions: ["tsd"] },
  "application/tlsrpt+gzip": { source: "iana" },
  "application/tlsrpt+json": { source: "iana", compressible: !0 },
  "application/tnauthlist": { source: "iana" },
  "application/token-introspection+jwt": { source: "iana" },
  "application/toml": { compressible: !0, extensions: ["toml"] },
  "application/trickle-ice-sdpfrag": { source: "iana" },
  "application/trig": { source: "iana", extensions: ["trig"] },
  "application/ttml+xml": { source: "iana", compressible: !0, extensions: ["ttml"] },
  "application/tve-trigger": { source: "iana" },
  "application/tzif": { source: "iana" },
  "application/tzif-leap": { source: "iana" },
  "application/ubjson": { compressible: !1, extensions: ["ubj"] },
  "application/ulpfec": { source: "iana" },
  "application/urc-grpsheet+xml": { source: "iana", compressible: !0 },
  "application/urc-ressheet+xml": { source: "iana", compressible: !0, extensions: ["rsheet"] },
  "application/urc-targetdesc+xml": { source: "iana", compressible: !0, extensions: ["td"] },
  "application/urc-uisocketdesc+xml": { source: "iana", compressible: !0 },
  "application/vcard+json": { source: "iana", compressible: !0 },
  "application/vcard+xml": { source: "iana", compressible: !0 },
  "application/vemmi": { source: "iana" },
  "application/vividence.scriptfile": { source: "apache" },
  "application/vnd.1000minds.decision-model+xml": { source: "iana", compressible: !0, extensions: ["1km"] },
  "application/vnd.3gpp-prose+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp-prose-pc3ch+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp-v2x-local-service-information": { source: "iana" },
  "application/vnd.3gpp.5gnas": { source: "iana" },
  "application/vnd.3gpp.access-transfer-events+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.bsf+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.gmop+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.gtpc": { source: "iana" },
  "application/vnd.3gpp.interworking-data": { source: "iana" },
  "application/vnd.3gpp.lpp": { source: "iana" },
  "application/vnd.3gpp.mc-signalling-ear": { source: "iana" },
  "application/vnd.3gpp.mcdata-affiliation-command+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcdata-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcdata-payload": { source: "iana" },
  "application/vnd.3gpp.mcdata-service-config+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcdata-signalling": { source: "iana" },
  "application/vnd.3gpp.mcdata-ue-config+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcdata-user-profile+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-affiliation-command+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-floor-request+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-location-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-mbms-usage-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-service-config+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-signed+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-ue-config+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-ue-init-config+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcptt-user-profile+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcvideo-affiliation-command+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcvideo-affiliation-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcvideo-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcvideo-location-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcvideo-mbms-usage-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcvideo-service-config+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcvideo-transmission-request+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcvideo-ue-config+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mcvideo-user-profile+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.mid-call+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.ngap": { source: "iana" },
  "application/vnd.3gpp.pfcp": { source: "iana" },
  "application/vnd.3gpp.pic-bw-large": { source: "iana", extensions: ["plb"] },
  "application/vnd.3gpp.pic-bw-small": { source: "iana", extensions: ["psb"] },
  "application/vnd.3gpp.pic-bw-var": { source: "iana", extensions: ["pvb"] },
  "application/vnd.3gpp.s1ap": { source: "iana" },
  "application/vnd.3gpp.sms": { source: "iana" },
  "application/vnd.3gpp.sms+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.srvcc-ext+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.srvcc-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.state-and-event-info+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp.ussd+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp2.bcmcsinfo+xml": { source: "iana", compressible: !0 },
  "application/vnd.3gpp2.sms": { source: "iana" },
  "application/vnd.3gpp2.tcap": { source: "iana", extensions: ["tcap"] },
  "application/vnd.3lightssoftware.imagescal": { source: "iana" },
  "application/vnd.3m.post-it-notes": { source: "iana", extensions: ["pwn"] },
  "application/vnd.accpac.simply.aso": { source: "iana", extensions: ["aso"] },
  "application/vnd.accpac.simply.imp": { source: "iana", extensions: ["imp"] },
  "application/vnd.acucobol": { source: "iana", extensions: ["acu"] },
  "application/vnd.acucorp": { source: "iana", extensions: ["atc", "acutc"] },
  "application/vnd.adobe.air-application-installer-package+zip": { source: "apache", compressible: !1, extensions: ["air"] },
  "application/vnd.adobe.flash.movie": { source: "iana" },
  "application/vnd.adobe.formscentral.fcdt": { source: "iana", extensions: ["fcdt"] },
  "application/vnd.adobe.fxp": { source: "iana", extensions: ["fxp", "fxpl"] },
  "application/vnd.adobe.partial-upload": { source: "iana" },
  "application/vnd.adobe.xdp+xml": { source: "iana", compressible: !0, extensions: ["xdp"] },
  "application/vnd.adobe.xfdf": { source: "iana", extensions: ["xfdf"] },
  "application/vnd.aether.imp": { source: "iana" },
  "application/vnd.afpc.afplinedata": { source: "iana" },
  "application/vnd.afpc.afplinedata-pagedef": { source: "iana" },
  "application/vnd.afpc.cmoca-cmresource": { source: "iana" },
  "application/vnd.afpc.foca-charset": { source: "iana" },
  "application/vnd.afpc.foca-codedfont": { source: "iana" },
  "application/vnd.afpc.foca-codepage": { source: "iana" },
  "application/vnd.afpc.modca": { source: "iana" },
  "application/vnd.afpc.modca-cmtable": { source: "iana" },
  "application/vnd.afpc.modca-formdef": { source: "iana" },
  "application/vnd.afpc.modca-mediummap": { source: "iana" },
  "application/vnd.afpc.modca-objectcontainer": { source: "iana" },
  "application/vnd.afpc.modca-overlay": { source: "iana" },
  "application/vnd.afpc.modca-pagesegment": { source: "iana" },
  "application/vnd.age": { source: "iana", extensions: ["age"] },
  "application/vnd.ah-barcode": { source: "iana" },
  "application/vnd.ahead.space": { source: "iana", extensions: ["ahead"] },
  "application/vnd.airzip.filesecure.azf": { source: "iana", extensions: ["azf"] },
  "application/vnd.airzip.filesecure.azs": { source: "iana", extensions: ["azs"] },
  "application/vnd.amadeus+json": { source: "iana", compressible: !0 },
  "application/vnd.amazon.ebook": { source: "apache", extensions: ["azw"] },
  "application/vnd.amazon.mobi8-ebook": { source: "iana" },
  "application/vnd.americandynamics.acc": { source: "iana", extensions: ["acc"] },
  "application/vnd.amiga.ami": { source: "iana", extensions: ["ami"] },
  "application/vnd.amundsen.maze+xml": { source: "iana", compressible: !0 },
  "application/vnd.android.ota": { source: "iana" },
  "application/vnd.android.package-archive": { source: "apache", compressible: !1, extensions: ["apk"] },
  "application/vnd.anki": { source: "iana" },
  "application/vnd.anser-web-certificate-issue-initiation": { source: "iana", extensions: ["cii"] },
  "application/vnd.anser-web-funds-transfer-initiation": { source: "apache", extensions: ["fti"] },
  "application/vnd.antix.game-component": { source: "iana", extensions: ["atx"] },
  "application/vnd.apache.arrow.file": { source: "iana" },
  "application/vnd.apache.arrow.stream": { source: "iana" },
  "application/vnd.apache.thrift.binary": { source: "iana" },
  "application/vnd.apache.thrift.compact": { source: "iana" },
  "application/vnd.apache.thrift.json": { source: "iana" },
  "application/vnd.api+json": { source: "iana", compressible: !0 },
  "application/vnd.aplextor.warrp+json": { source: "iana", compressible: !0 },
  "application/vnd.apothekende.reservation+json": { source: "iana", compressible: !0 },
  "application/vnd.apple.installer+xml": { source: "iana", compressible: !0, extensions: ["mpkg"] },
  "application/vnd.apple.keynote": { source: "iana", extensions: ["key"] },
  "application/vnd.apple.mpegurl": { source: "iana", extensions: ["m3u8"] },
  "application/vnd.apple.numbers": { source: "iana", extensions: ["numbers"] },
  "application/vnd.apple.pages": { source: "iana", extensions: ["pages"] },
  "application/vnd.apple.pkpass": { compressible: !1, extensions: ["pkpass"] },
  "application/vnd.arastra.swi": { source: "iana" },
  "application/vnd.aristanetworks.swi": { source: "iana", extensions: ["swi"] },
  "application/vnd.artisan+json": { source: "iana", compressible: !0 },
  "application/vnd.artsquare": { source: "iana" },
  "application/vnd.astraea-software.iota": { source: "iana", extensions: ["iota"] },
  "application/vnd.audiograph": { source: "iana", extensions: ["aep"] },
  "application/vnd.autopackage": { source: "iana" },
  "application/vnd.avalon+json": { source: "iana", compressible: !0 },
  "application/vnd.avistar+xml": { source: "iana", compressible: !0 },
  "application/vnd.balsamiq.bmml+xml": { source: "iana", compressible: !0, extensions: ["bmml"] },
  "application/vnd.balsamiq.bmpr": { source: "iana" },
  "application/vnd.banana-accounting": { source: "iana" },
  "application/vnd.bbf.usp.error": { source: "iana" },
  "application/vnd.bbf.usp.msg": { source: "iana" },
  "application/vnd.bbf.usp.msg+json": { source: "iana", compressible: !0 },
  "application/vnd.bekitzur-stech+json": { source: "iana", compressible: !0 },
  "application/vnd.bint.med-content": { source: "iana" },
  "application/vnd.biopax.rdf+xml": { source: "iana", compressible: !0 },
  "application/vnd.blink-idb-value-wrapper": { source: "iana" },
  "application/vnd.blueice.multipass": { source: "iana", extensions: ["mpm"] },
  "application/vnd.bluetooth.ep.oob": { source: "iana" },
  "application/vnd.bluetooth.le.oob": { source: "iana" },
  "application/vnd.bmi": { source: "iana", extensions: ["bmi"] },
  "application/vnd.bpf": { source: "iana" },
  "application/vnd.bpf3": { source: "iana" },
  "application/vnd.businessobjects": { source: "iana", extensions: ["rep"] },
  "application/vnd.byu.uapi+json": { source: "iana", compressible: !0 },
  "application/vnd.cab-jscript": { source: "iana" },
  "application/vnd.canon-cpdl": { source: "iana" },
  "application/vnd.canon-lips": { source: "iana" },
  "application/vnd.capasystems-pg+json": { source: "iana", compressible: !0 },
  "application/vnd.cendio.thinlinc.clientconf": { source: "iana" },
  "application/vnd.century-systems.tcp_stream": { source: "iana" },
  "application/vnd.chemdraw+xml": { source: "iana", compressible: !0, extensions: ["cdxml"] },
  "application/vnd.chess-pgn": { source: "iana" },
  "application/vnd.chipnuts.karaoke-mmd": { source: "iana", extensions: ["mmd"] },
  "application/vnd.ciedi": { source: "iana" },
  "application/vnd.cinderella": { source: "iana", extensions: ["cdy"] },
  "application/vnd.cirpack.isdn-ext": { source: "iana" },
  "application/vnd.citationstyles.style+xml": { source: "iana", compressible: !0, extensions: ["csl"] },
  "application/vnd.claymore": { source: "iana", extensions: ["cla"] },
  "application/vnd.cloanto.rp9": { source: "iana", extensions: ["rp9"] },
  "application/vnd.clonk.c4group": { source: "iana", extensions: ["c4g", "c4d", "c4f", "c4p", "c4u"] },
  "application/vnd.cluetrust.cartomobile-config": { source: "iana", extensions: ["c11amc"] },
  "application/vnd.cluetrust.cartomobile-config-pkg": { source: "iana", extensions: ["c11amz"] },
  "application/vnd.coffeescript": { source: "iana" },
  "application/vnd.collabio.xodocuments.document": { source: "iana" },
  "application/vnd.collabio.xodocuments.document-template": { source: "iana" },
  "application/vnd.collabio.xodocuments.presentation": { source: "iana" },
  "application/vnd.collabio.xodocuments.presentation-template": { source: "iana" },
  "application/vnd.collabio.xodocuments.spreadsheet": { source: "iana" },
  "application/vnd.collabio.xodocuments.spreadsheet-template": { source: "iana" },
  "application/vnd.collection+json": { source: "iana", compressible: !0 },
  "application/vnd.collection.doc+json": { source: "iana", compressible: !0 },
  "application/vnd.collection.next+json": { source: "iana", compressible: !0 },
  "application/vnd.comicbook+zip": { source: "iana", compressible: !1 },
  "application/vnd.comicbook-rar": { source: "iana" },
  "application/vnd.commerce-battelle": { source: "iana" },
  "application/vnd.commonspace": { source: "iana", extensions: ["csp"] },
  "application/vnd.contact.cmsg": { source: "iana", extensions: ["cdbcmsg"] },
  "application/vnd.coreos.ignition+json": { source: "iana", compressible: !0 },
  "application/vnd.cosmocaller": { source: "iana", extensions: ["cmc"] },
  "application/vnd.crick.clicker": { source: "iana", extensions: ["clkx"] },
  "application/vnd.crick.clicker.keyboard": { source: "iana", extensions: ["clkk"] },
  "application/vnd.crick.clicker.palette": { source: "iana", extensions: ["clkp"] },
  "application/vnd.crick.clicker.template": { source: "iana", extensions: ["clkt"] },
  "application/vnd.crick.clicker.wordbank": { source: "iana", extensions: ["clkw"] },
  "application/vnd.criticaltools.wbs+xml": { source: "iana", compressible: !0, extensions: ["wbs"] },
  "application/vnd.cryptii.pipe+json": { source: "iana", compressible: !0 },
  "application/vnd.crypto-shade-file": { source: "iana" },
  "application/vnd.cryptomator.encrypted": { source: "iana" },
  "application/vnd.cryptomator.vault": { source: "iana" },
  "application/vnd.ctc-posml": { source: "iana", extensions: ["pml"] },
  "application/vnd.ctct.ws+xml": { source: "iana", compressible: !0 },
  "application/vnd.cups-pdf": { source: "iana" },
  "application/vnd.cups-postscript": { source: "iana" },
  "application/vnd.cups-ppd": { source: "iana", extensions: ["ppd"] },
  "application/vnd.cups-raster": { source: "iana" },
  "application/vnd.cups-raw": { source: "iana" },
  "application/vnd.curl": { source: "iana" },
  "application/vnd.curl.car": { source: "apache", extensions: ["car"] },
  "application/vnd.curl.pcurl": { source: "apache", extensions: ["pcurl"] },
  "application/vnd.cyan.dean.root+xml": { source: "iana", compressible: !0 },
  "application/vnd.cybank": { source: "iana" },
  "application/vnd.cyclonedx+json": { source: "iana", compressible: !0 },
  "application/vnd.cyclonedx+xml": { source: "iana", compressible: !0 },
  "application/vnd.d2l.coursepackage1p0+zip": { source: "iana", compressible: !1 },
  "application/vnd.d3m-dataset": { source: "iana" },
  "application/vnd.d3m-problem": { source: "iana" },
  "application/vnd.dart": { source: "iana", compressible: !0, extensions: ["dart"] },
  "application/vnd.data-vision.rdz": { source: "iana", extensions: ["rdz"] },
  "application/vnd.datapackage+json": { source: "iana", compressible: !0 },
  "application/vnd.dataresource+json": { source: "iana", compressible: !0 },
  "application/vnd.dbf": { source: "iana", extensions: ["dbf"] },
  "application/vnd.debian.binary-package": { source: "iana" },
  "application/vnd.dece.data": { source: "iana", extensions: ["uvf", "uvvf", "uvd", "uvvd"] },
  "application/vnd.dece.ttml+xml": { source: "iana", compressible: !0, extensions: ["uvt", "uvvt"] },
  "application/vnd.dece.unspecified": { source: "iana", extensions: ["uvx", "uvvx"] },
  "application/vnd.dece.zip": { source: "iana", extensions: ["uvz", "uvvz"] },
  "application/vnd.denovo.fcselayout-link": { source: "iana", extensions: ["fe_launch"] },
  "application/vnd.desmume.movie": { source: "iana" },
  "application/vnd.dir-bi.plate-dl-nosuffix": { source: "iana" },
  "application/vnd.dm.delegation+xml": { source: "iana", compressible: !0 },
  "application/vnd.dna": { source: "iana", extensions: ["dna"] },
  "application/vnd.document+json": { source: "iana", compressible: !0 },
  "application/vnd.dolby.mlp": { source: "apache", extensions: ["mlp"] },
  "application/vnd.dolby.mobile.1": { source: "iana" },
  "application/vnd.dolby.mobile.2": { source: "iana" },
  "application/vnd.doremir.scorecloud-binary-document": { source: "iana" },
  "application/vnd.dpgraph": { source: "iana", extensions: ["dpg"] },
  "application/vnd.dreamfactory": { source: "iana", extensions: ["dfac"] },
  "application/vnd.drive+json": { source: "iana", compressible: !0 },
  "application/vnd.ds-keypoint": { source: "apache", extensions: ["kpxx"] },
  "application/vnd.dtg.local": { source: "iana" },
  "application/vnd.dtg.local.flash": { source: "iana" },
  "application/vnd.dtg.local.html": { source: "iana" },
  "application/vnd.dvb.ait": { source: "iana", extensions: ["ait"] },
  "application/vnd.dvb.dvbisl+xml": { source: "iana", compressible: !0 },
  "application/vnd.dvb.dvbj": { source: "iana" },
  "application/vnd.dvb.esgcontainer": { source: "iana" },
  "application/vnd.dvb.ipdcdftnotifaccess": { source: "iana" },
  "application/vnd.dvb.ipdcesgaccess": { source: "iana" },
  "application/vnd.dvb.ipdcesgaccess2": { source: "iana" },
  "application/vnd.dvb.ipdcesgpdd": { source: "iana" },
  "application/vnd.dvb.ipdcroaming": { source: "iana" },
  "application/vnd.dvb.iptv.alfec-base": { source: "iana" },
  "application/vnd.dvb.iptv.alfec-enhancement": { source: "iana" },
  "application/vnd.dvb.notif-aggregate-root+xml": { source: "iana", compressible: !0 },
  "application/vnd.dvb.notif-container+xml": { source: "iana", compressible: !0 },
  "application/vnd.dvb.notif-generic+xml": { source: "iana", compressible: !0 },
  "application/vnd.dvb.notif-ia-msglist+xml": { source: "iana", compressible: !0 },
  "application/vnd.dvb.notif-ia-registration-request+xml": { source: "iana", compressible: !0 },
  "application/vnd.dvb.notif-ia-registration-response+xml": { source: "iana", compressible: !0 },
  "application/vnd.dvb.notif-init+xml": { source: "iana", compressible: !0 },
  "application/vnd.dvb.pfr": { source: "iana" },
  "application/vnd.dvb.service": { source: "iana", extensions: ["svc"] },
  "application/vnd.dxr": { source: "iana" },
  "application/vnd.dynageo": { source: "iana", extensions: ["geo"] },
  "application/vnd.dzr": { source: "iana" },
  "application/vnd.easykaraoke.cdgdownload": { source: "iana" },
  "application/vnd.ecdis-update": { source: "iana" },
  "application/vnd.ecip.rlp": { source: "iana" },
  "application/vnd.eclipse.ditto+json": { source: "iana", compressible: !0 },
  "application/vnd.ecowin.chart": { source: "iana", extensions: ["mag"] },
  "application/vnd.ecowin.filerequest": { source: "iana" },
  "application/vnd.ecowin.fileupdate": { source: "iana" },
  "application/vnd.ecowin.series": { source: "iana" },
  "application/vnd.ecowin.seriesrequest": { source: "iana" },
  "application/vnd.ecowin.seriesupdate": { source: "iana" },
  "application/vnd.efi.img": { source: "iana" },
  "application/vnd.efi.iso": { source: "iana" },
  "application/vnd.emclient.accessrequest+xml": { source: "iana", compressible: !0 },
  "application/vnd.enliven": { source: "iana", extensions: ["nml"] },
  "application/vnd.enphase.envoy": { source: "iana" },
  "application/vnd.eprints.data+xml": { source: "iana", compressible: !0 },
  "application/vnd.epson.esf": { source: "iana", extensions: ["esf"] },
  "application/vnd.epson.msf": { source: "iana", extensions: ["msf"] },
  "application/vnd.epson.quickanime": { source: "iana", extensions: ["qam"] },
  "application/vnd.epson.salt": { source: "iana", extensions: ["slt"] },
  "application/vnd.epson.ssf": { source: "iana", extensions: ["ssf"] },
  "application/vnd.ericsson.quickcall": { source: "iana" },
  "application/vnd.espass-espass+zip": { source: "iana", compressible: !1 },
  "application/vnd.eszigno3+xml": { source: "iana", compressible: !0, extensions: ["es3", "et3"] },
  "application/vnd.etsi.aoc+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.asic-e+zip": { source: "iana", compressible: !1 },
  "application/vnd.etsi.asic-s+zip": { source: "iana", compressible: !1 },
  "application/vnd.etsi.cug+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.iptvcommand+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.iptvdiscovery+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.iptvprofile+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.iptvsad-bc+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.iptvsad-cod+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.iptvsad-npvr+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.iptvservice+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.iptvsync+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.iptvueprofile+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.mcid+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.mheg5": { source: "iana" },
  "application/vnd.etsi.overload-control-policy-dataset+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.pstn+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.sci+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.simservs+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.timestamp-token": { source: "iana" },
  "application/vnd.etsi.tsl+xml": { source: "iana", compressible: !0 },
  "application/vnd.etsi.tsl.der": { source: "iana" },
  "application/vnd.eu.kasparian.car+json": { source: "iana", compressible: !0 },
  "application/vnd.eudora.data": { source: "iana" },
  "application/vnd.evolv.ecig.profile": { source: "iana" },
  "application/vnd.evolv.ecig.settings": { source: "iana" },
  "application/vnd.evolv.ecig.theme": { source: "iana" },
  "application/vnd.exstream-empower+zip": { source: "iana", compressible: !1 },
  "application/vnd.exstream-package": { source: "iana" },
  "application/vnd.ezpix-album": { source: "iana", extensions: ["ez2"] },
  "application/vnd.ezpix-package": { source: "iana", extensions: ["ez3"] },
  "application/vnd.f-secure.mobile": { source: "iana" },
  "application/vnd.familysearch.gedcom+zip": { source: "iana", compressible: !1 },
  "application/vnd.fastcopy-disk-image": { source: "iana" },
  "application/vnd.fdf": { source: "iana", extensions: ["fdf"] },
  "application/vnd.fdsn.mseed": { source: "iana", extensions: ["mseed"] },
  "application/vnd.fdsn.seed": { source: "iana", extensions: ["seed", "dataless"] },
  "application/vnd.ffsns": { source: "iana" },
  "application/vnd.ficlab.flb+zip": { source: "iana", compressible: !1 },
  "application/vnd.filmit.zfc": { source: "iana" },
  "application/vnd.fints": { source: "iana" },
  "application/vnd.firemonkeys.cloudcell": { source: "iana" },
  "application/vnd.flographit": { source: "iana", extensions: ["gph"] },
  "application/vnd.fluxtime.clip": { source: "iana", extensions: ["ftc"] },
  "application/vnd.font-fontforge-sfd": { source: "iana" },
  "application/vnd.framemaker": { source: "iana", extensions: ["fm", "frame", "maker", "book"] },
  "application/vnd.frogans.fnc": { source: "iana", extensions: ["fnc"] },
  "application/vnd.frogans.ltf": { source: "iana", extensions: ["ltf"] },
  "application/vnd.fsc.weblaunch": { source: "iana", extensions: ["fsc"] },
  "application/vnd.fujifilm.fb.docuworks": { source: "iana" },
  "application/vnd.fujifilm.fb.docuworks.binder": { source: "iana" },
  "application/vnd.fujifilm.fb.docuworks.container": { source: "iana" },
  "application/vnd.fujifilm.fb.jfi+xml": { source: "iana", compressible: !0 },
  "application/vnd.fujitsu.oasys": { source: "iana", extensions: ["oas"] },
  "application/vnd.fujitsu.oasys2": { source: "iana", extensions: ["oa2"] },
  "application/vnd.fujitsu.oasys3": { source: "iana", extensions: ["oa3"] },
  "application/vnd.fujitsu.oasysgp": { source: "iana", extensions: ["fg5"] },
  "application/vnd.fujitsu.oasysprs": { source: "iana", extensions: ["bh2"] },
  "application/vnd.fujixerox.art-ex": { source: "iana" },
  "application/vnd.fujixerox.art4": { source: "iana" },
  "application/vnd.fujixerox.ddd": { source: "iana", extensions: ["ddd"] },
  "application/vnd.fujixerox.docuworks": { source: "iana", extensions: ["xdw"] },
  "application/vnd.fujixerox.docuworks.binder": { source: "iana", extensions: ["xbd"] },
  "application/vnd.fujixerox.docuworks.container": { source: "iana" },
  "application/vnd.fujixerox.hbpl": { source: "iana" },
  "application/vnd.fut-misnet": { source: "iana" },
  "application/vnd.futoin+cbor": { source: "iana" },
  "application/vnd.futoin+json": { source: "iana", compressible: !0 },
  "application/vnd.fuzzysheet": { source: "iana", extensions: ["fzs"] },
  "application/vnd.genomatix.tuxedo": { source: "iana", extensions: ["txd"] },
  "application/vnd.gentics.grd+json": { source: "iana", compressible: !0 },
  "application/vnd.geo+json": { source: "iana", compressible: !0 },
  "application/vnd.geocube+xml": { source: "iana", compressible: !0 },
  "application/vnd.geogebra.file": { source: "iana", extensions: ["ggb"] },
  "application/vnd.geogebra.slides": { source: "iana" },
  "application/vnd.geogebra.tool": { source: "iana", extensions: ["ggt"] },
  "application/vnd.geometry-explorer": { source: "iana", extensions: ["gex", "gre"] },
  "application/vnd.geonext": { source: "iana", extensions: ["gxt"] },
  "application/vnd.geoplan": { source: "iana", extensions: ["g2w"] },
  "application/vnd.geospace": { source: "iana", extensions: ["g3w"] },
  "application/vnd.gerber": { source: "iana" },
  "application/vnd.globalplatform.card-content-mgt": { source: "iana" },
  "application/vnd.globalplatform.card-content-mgt-response": { source: "iana" },
  "application/vnd.gmx": { source: "iana", extensions: ["gmx"] },
  "application/vnd.google-apps.document": { compressible: !1, extensions: ["gdoc"] },
  "application/vnd.google-apps.presentation": { compressible: !1, extensions: ["gslides"] },
  "application/vnd.google-apps.spreadsheet": { compressible: !1, extensions: ["gsheet"] },
  "application/vnd.google-earth.kml+xml": { source: "iana", compressible: !0, extensions: ["kml"] },
  "application/vnd.google-earth.kmz": { source: "iana", compressible: !1, extensions: ["kmz"] },
  "application/vnd.gov.sk.e-form+xml": { source: "iana", compressible: !0 },
  "application/vnd.gov.sk.e-form+zip": { source: "iana", compressible: !1 },
  "application/vnd.gov.sk.xmldatacontainer+xml": { source: "iana", compressible: !0 },
  "application/vnd.grafeq": { source: "iana", extensions: ["gqf", "gqs"] },
  "application/vnd.gridmp": { source: "iana" },
  "application/vnd.groove-account": { source: "iana", extensions: ["gac"] },
  "application/vnd.groove-help": { source: "iana", extensions: ["ghf"] },
  "application/vnd.groove-identity-message": { source: "iana", extensions: ["gim"] },
  "application/vnd.groove-injector": { source: "iana", extensions: ["grv"] },
  "application/vnd.groove-tool-message": { source: "iana", extensions: ["gtm"] },
  "application/vnd.groove-tool-template": { source: "iana", extensions: ["tpl"] },
  "application/vnd.groove-vcard": { source: "iana", extensions: ["vcg"] },
  "application/vnd.hal+json": { source: "iana", compressible: !0 },
  "application/vnd.hal+xml": { source: "iana", compressible: !0, extensions: ["hal"] },
  "application/vnd.handheld-entertainment+xml": { source: "iana", compressible: !0, extensions: ["zmm"] },
  "application/vnd.hbci": { source: "iana", extensions: ["hbci"] },
  "application/vnd.hc+json": { source: "iana", compressible: !0 },
  "application/vnd.hcl-bireports": { source: "iana" },
  "application/vnd.hdt": { source: "iana" },
  "application/vnd.heroku+json": { source: "iana", compressible: !0 },
  "application/vnd.hhe.lesson-player": { source: "iana", extensions: ["les"] },
  "application/vnd.hl7cda+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/vnd.hl7v2+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/vnd.hp-hpgl": { source: "iana", extensions: ["hpgl"] },
  "application/vnd.hp-hpid": { source: "iana", extensions: ["hpid"] },
  "application/vnd.hp-hps": { source: "iana", extensions: ["hps"] },
  "application/vnd.hp-jlyt": { source: "iana", extensions: ["jlt"] },
  "application/vnd.hp-pcl": { source: "iana", extensions: ["pcl"] },
  "application/vnd.hp-pclxl": { source: "iana", extensions: ["pclxl"] },
  "application/vnd.httphone": { source: "iana" },
  "application/vnd.hydrostatix.sof-data": { source: "iana", extensions: ["sfd-hdstx"] },
  "application/vnd.hyper+json": { source: "iana", compressible: !0 },
  "application/vnd.hyper-item+json": { source: "iana", compressible: !0 },
  "application/vnd.hyperdrive+json": { source: "iana", compressible: !0 },
  "application/vnd.hzn-3d-crossword": { source: "iana" },
  "application/vnd.ibm.afplinedata": { source: "iana" },
  "application/vnd.ibm.electronic-media": { source: "iana" },
  "application/vnd.ibm.minipay": { source: "iana", extensions: ["mpy"] },
  "application/vnd.ibm.modcap": { source: "iana", extensions: ["afp", "listafp", "list3820"] },
  "application/vnd.ibm.rights-management": { source: "iana", extensions: ["irm"] },
  "application/vnd.ibm.secure-container": { source: "iana", extensions: ["sc"] },
  "application/vnd.iccprofile": { source: "iana", extensions: ["icc", "icm"] },
  "application/vnd.ieee.1905": { source: "iana" },
  "application/vnd.igloader": { source: "iana", extensions: ["igl"] },
  "application/vnd.imagemeter.folder+zip": { source: "iana", compressible: !1 },
  "application/vnd.imagemeter.image+zip": { source: "iana", compressible: !1 },
  "application/vnd.immervision-ivp": { source: "iana", extensions: ["ivp"] },
  "application/vnd.immervision-ivu": { source: "iana", extensions: ["ivu"] },
  "application/vnd.ims.imsccv1p1": { source: "iana" },
  "application/vnd.ims.imsccv1p2": { source: "iana" },
  "application/vnd.ims.imsccv1p3": { source: "iana" },
  "application/vnd.ims.lis.v2.result+json": { source: "iana", compressible: !0 },
  "application/vnd.ims.lti.v2.toolconsumerprofile+json": { source: "iana", compressible: !0 },
  "application/vnd.ims.lti.v2.toolproxy+json": { source: "iana", compressible: !0 },
  "application/vnd.ims.lti.v2.toolproxy.id+json": { source: "iana", compressible: !0 },
  "application/vnd.ims.lti.v2.toolsettings+json": { source: "iana", compressible: !0 },
  "application/vnd.ims.lti.v2.toolsettings.simple+json": { source: "iana", compressible: !0 },
  "application/vnd.informedcontrol.rms+xml": { source: "iana", compressible: !0 },
  "application/vnd.informix-visionary": { source: "iana" },
  "application/vnd.infotech.project": { source: "iana" },
  "application/vnd.infotech.project+xml": { source: "iana", compressible: !0 },
  "application/vnd.innopath.wamp.notification": { source: "iana" },
  "application/vnd.insors.igm": { source: "iana", extensions: ["igm"] },
  "application/vnd.intercon.formnet": { source: "iana", extensions: ["xpw", "xpx"] },
  "application/vnd.intergeo": { source: "iana", extensions: ["i2g"] },
  "application/vnd.intertrust.digibox": { source: "iana" },
  "application/vnd.intertrust.nncp": { source: "iana" },
  "application/vnd.intu.qbo": { source: "iana", extensions: ["qbo"] },
  "application/vnd.intu.qfx": { source: "iana", extensions: ["qfx"] },
  "application/vnd.iptc.g2.catalogitem+xml": { source: "iana", compressible: !0 },
  "application/vnd.iptc.g2.conceptitem+xml": { source: "iana", compressible: !0 },
  "application/vnd.iptc.g2.knowledgeitem+xml": { source: "iana", compressible: !0 },
  "application/vnd.iptc.g2.newsitem+xml": { source: "iana", compressible: !0 },
  "application/vnd.iptc.g2.newsmessage+xml": { source: "iana", compressible: !0 },
  "application/vnd.iptc.g2.packageitem+xml": { source: "iana", compressible: !0 },
  "application/vnd.iptc.g2.planningitem+xml": { source: "iana", compressible: !0 },
  "application/vnd.ipunplugged.rcprofile": { source: "iana", extensions: ["rcprofile"] },
  "application/vnd.irepository.package+xml": { source: "iana", compressible: !0, extensions: ["irp"] },
  "application/vnd.is-xpr": { source: "iana", extensions: ["xpr"] },
  "application/vnd.isac.fcs": { source: "iana", extensions: ["fcs"] },
  "application/vnd.iso11783-10+zip": { source: "iana", compressible: !1 },
  "application/vnd.jam": { source: "iana", extensions: ["jam"] },
  "application/vnd.japannet-directory-service": { source: "iana" },
  "application/vnd.japannet-jpnstore-wakeup": { source: "iana" },
  "application/vnd.japannet-payment-wakeup": { source: "iana" },
  "application/vnd.japannet-registration": { source: "iana" },
  "application/vnd.japannet-registration-wakeup": { source: "iana" },
  "application/vnd.japannet-setstore-wakeup": { source: "iana" },
  "application/vnd.japannet-verification": { source: "iana" },
  "application/vnd.japannet-verification-wakeup": { source: "iana" },
  "application/vnd.jcp.javame.midlet-rms": { source: "iana", extensions: ["rms"] },
  "application/vnd.jisp": { source: "iana", extensions: ["jisp"] },
  "application/vnd.joost.joda-archive": { source: "iana", extensions: ["joda"] },
  "application/vnd.jsk.isdn-ngn": { source: "iana" },
  "application/vnd.kahootz": { source: "iana", extensions: ["ktz", "ktr"] },
  "application/vnd.kde.karbon": { source: "iana", extensions: ["karbon"] },
  "application/vnd.kde.kchart": { source: "iana", extensions: ["chrt"] },
  "application/vnd.kde.kformula": { source: "iana", extensions: ["kfo"] },
  "application/vnd.kde.kivio": { source: "iana", extensions: ["flw"] },
  "application/vnd.kde.kontour": { source: "iana", extensions: ["kon"] },
  "application/vnd.kde.kpresenter": { source: "iana", extensions: ["kpr", "kpt"] },
  "application/vnd.kde.kspread": { source: "iana", extensions: ["ksp"] },
  "application/vnd.kde.kword": { source: "iana", extensions: ["kwd", "kwt"] },
  "application/vnd.kenameaapp": { source: "iana", extensions: ["htke"] },
  "application/vnd.kidspiration": { source: "iana", extensions: ["kia"] },
  "application/vnd.kinar": { source: "iana", extensions: ["kne", "knp"] },
  "application/vnd.koan": { source: "iana", extensions: ["skp", "skd", "skt", "skm"] },
  "application/vnd.kodak-descriptor": { source: "iana", extensions: ["sse"] },
  "application/vnd.las": { source: "iana" },
  "application/vnd.las.las+json": { source: "iana", compressible: !0 },
  "application/vnd.las.las+xml": { source: "iana", compressible: !0, extensions: ["lasxml"] },
  "application/vnd.laszip": { source: "iana" },
  "application/vnd.leap+json": { source: "iana", compressible: !0 },
  "application/vnd.liberty-request+xml": { source: "iana", compressible: !0 },
  "application/vnd.llamagraphics.life-balance.desktop": { source: "iana", extensions: ["lbd"] },
  "application/vnd.llamagraphics.life-balance.exchange+xml": { source: "iana", compressible: !0, extensions: ["lbe"] },
  "application/vnd.logipipe.circuit+zip": { source: "iana", compressible: !1 },
  "application/vnd.loom": { source: "iana" },
  "application/vnd.lotus-1-2-3": { source: "iana", extensions: ["123"] },
  "application/vnd.lotus-approach": { source: "iana", extensions: ["apr"] },
  "application/vnd.lotus-freelance": { source: "iana", extensions: ["pre"] },
  "application/vnd.lotus-notes": { source: "iana", extensions: ["nsf"] },
  "application/vnd.lotus-organizer": { source: "iana", extensions: ["org"] },
  "application/vnd.lotus-screencam": { source: "iana", extensions: ["scm"] },
  "application/vnd.lotus-wordpro": { source: "iana", extensions: ["lwp"] },
  "application/vnd.macports.portpkg": { source: "iana", extensions: ["portpkg"] },
  "application/vnd.mapbox-vector-tile": { source: "iana", extensions: ["mvt"] },
  "application/vnd.marlin.drm.actiontoken+xml": { source: "iana", compressible: !0 },
  "application/vnd.marlin.drm.conftoken+xml": { source: "iana", compressible: !0 },
  "application/vnd.marlin.drm.license+xml": { source: "iana", compressible: !0 },
  "application/vnd.marlin.drm.mdcf": { source: "iana" },
  "application/vnd.mason+json": { source: "iana", compressible: !0 },
  "application/vnd.maxar.archive.3tz+zip": { source: "iana", compressible: !1 },
  "application/vnd.maxmind.maxmind-db": { source: "iana" },
  "application/vnd.mcd": { source: "iana", extensions: ["mcd"] },
  "application/vnd.medcalcdata": { source: "iana", extensions: ["mc1"] },
  "application/vnd.mediastation.cdkey": { source: "iana", extensions: ["cdkey"] },
  "application/vnd.meridian-slingshot": { source: "iana" },
  "application/vnd.mfer": { source: "iana", extensions: ["mwf"] },
  "application/vnd.mfmp": { source: "iana", extensions: ["mfm"] },
  "application/vnd.micro+json": { source: "iana", compressible: !0 },
  "application/vnd.micrografx.flo": { source: "iana", extensions: ["flo"] },
  "application/vnd.micrografx.igx": { source: "iana", extensions: ["igx"] },
  "application/vnd.microsoft.portable-executable": { source: "iana" },
  "application/vnd.microsoft.windows.thumbnail-cache": { source: "iana" },
  "application/vnd.miele+json": { source: "iana", compressible: !0 },
  "application/vnd.mif": { source: "iana", extensions: ["mif"] },
  "application/vnd.minisoft-hp3000-save": { source: "iana" },
  "application/vnd.mitsubishi.misty-guard.trustweb": { source: "iana" },
  "application/vnd.mobius.daf": { source: "iana", extensions: ["daf"] },
  "application/vnd.mobius.dis": { source: "iana", extensions: ["dis"] },
  "application/vnd.mobius.mbk": { source: "iana", extensions: ["mbk"] },
  "application/vnd.mobius.mqy": { source: "iana", extensions: ["mqy"] },
  "application/vnd.mobius.msl": { source: "iana", extensions: ["msl"] },
  "application/vnd.mobius.plc": { source: "iana", extensions: ["plc"] },
  "application/vnd.mobius.txf": { source: "iana", extensions: ["txf"] },
  "application/vnd.mophun.application": { source: "iana", extensions: ["mpn"] },
  "application/vnd.mophun.certificate": { source: "iana", extensions: ["mpc"] },
  "application/vnd.motorola.flexsuite": { source: "iana" },
  "application/vnd.motorola.flexsuite.adsi": { source: "iana" },
  "application/vnd.motorola.flexsuite.fis": { source: "iana" },
  "application/vnd.motorola.flexsuite.gotap": { source: "iana" },
  "application/vnd.motorola.flexsuite.kmr": { source: "iana" },
  "application/vnd.motorola.flexsuite.ttc": { source: "iana" },
  "application/vnd.motorola.flexsuite.wem": { source: "iana" },
  "application/vnd.motorola.iprm": { source: "iana" },
  "application/vnd.mozilla.xul+xml": { source: "iana", compressible: !0, extensions: ["xul"] },
  "application/vnd.ms-3mfdocument": { source: "iana" },
  "application/vnd.ms-artgalry": { source: "iana", extensions: ["cil"] },
  "application/vnd.ms-asf": { source: "iana" },
  "application/vnd.ms-cab-compressed": { source: "iana", extensions: ["cab"] },
  "application/vnd.ms-color.iccprofile": { source: "apache" },
  "application/vnd.ms-excel": { source: "iana", compressible: !1, extensions: ["xls", "xlm", "xla", "xlc", "xlt", "xlw"] },
  "application/vnd.ms-excel.addin.macroenabled.12": { source: "iana", extensions: ["xlam"] },
  "application/vnd.ms-excel.sheet.binary.macroenabled.12": { source: "iana", extensions: ["xlsb"] },
  "application/vnd.ms-excel.sheet.macroenabled.12": { source: "iana", extensions: ["xlsm"] },
  "application/vnd.ms-excel.template.macroenabled.12": { source: "iana", extensions: ["xltm"] },
  "application/vnd.ms-fontobject": { source: "iana", compressible: !0, extensions: ["eot"] },
  "application/vnd.ms-htmlhelp": { source: "iana", extensions: ["chm"] },
  "application/vnd.ms-ims": { source: "iana", extensions: ["ims"] },
  "application/vnd.ms-lrm": { source: "iana", extensions: ["lrm"] },
  "application/vnd.ms-office.activex+xml": { source: "iana", compressible: !0 },
  "application/vnd.ms-officetheme": { source: "iana", extensions: ["thmx"] },
  "application/vnd.ms-opentype": { source: "apache", compressible: !0 },
  "application/vnd.ms-outlook": { compressible: !1, extensions: ["msg"] },
  "application/vnd.ms-package.obfuscated-opentype": { source: "apache" },
  "application/vnd.ms-pki.seccat": { source: "apache", extensions: ["cat"] },
  "application/vnd.ms-pki.stl": { source: "apache", extensions: ["stl"] },
  "application/vnd.ms-playready.initiator+xml": { source: "iana", compressible: !0 },
  "application/vnd.ms-powerpoint": { source: "iana", compressible: !1, extensions: ["ppt", "pps", "pot"] },
  "application/vnd.ms-powerpoint.addin.macroenabled.12": { source: "iana", extensions: ["ppam"] },
  "application/vnd.ms-powerpoint.presentation.macroenabled.12": { source: "iana", extensions: ["pptm"] },
  "application/vnd.ms-powerpoint.slide.macroenabled.12": { source: "iana", extensions: ["sldm"] },
  "application/vnd.ms-powerpoint.slideshow.macroenabled.12": { source: "iana", extensions: ["ppsm"] },
  "application/vnd.ms-powerpoint.template.macroenabled.12": { source: "iana", extensions: ["potm"] },
  "application/vnd.ms-printdevicecapabilities+xml": { source: "iana", compressible: !0 },
  "application/vnd.ms-printing.printticket+xml": { source: "apache", compressible: !0 },
  "application/vnd.ms-printschematicket+xml": { source: "iana", compressible: !0 },
  "application/vnd.ms-project": { source: "iana", extensions: ["mpp", "mpt"] },
  "application/vnd.ms-tnef": { source: "iana" },
  "application/vnd.ms-windows.devicepairing": { source: "iana" },
  "application/vnd.ms-windows.nwprinting.oob": { source: "iana" },
  "application/vnd.ms-windows.printerpairing": { source: "iana" },
  "application/vnd.ms-windows.wsd.oob": { source: "iana" },
  "application/vnd.ms-wmdrm.lic-chlg-req": { source: "iana" },
  "application/vnd.ms-wmdrm.lic-resp": { source: "iana" },
  "application/vnd.ms-wmdrm.meter-chlg-req": { source: "iana" },
  "application/vnd.ms-wmdrm.meter-resp": { source: "iana" },
  "application/vnd.ms-word.document.macroenabled.12": { source: "iana", extensions: ["docm"] },
  "application/vnd.ms-word.template.macroenabled.12": { source: "iana", extensions: ["dotm"] },
  "application/vnd.ms-works": { source: "iana", extensions: ["wps", "wks", "wcm", "wdb"] },
  "application/vnd.ms-wpl": { source: "iana", extensions: ["wpl"] },
  "application/vnd.ms-xpsdocument": { source: "iana", compressible: !1, extensions: ["xps"] },
  "application/vnd.msa-disk-image": { source: "iana" },
  "application/vnd.mseq": { source: "iana", extensions: ["mseq"] },
  "application/vnd.msign": { source: "iana" },
  "application/vnd.multiad.creator": { source: "iana" },
  "application/vnd.multiad.creator.cif": { source: "iana" },
  "application/vnd.music-niff": { source: "iana" },
  "application/vnd.musician": { source: "iana", extensions: ["mus"] },
  "application/vnd.muvee.style": { source: "iana", extensions: ["msty"] },
  "application/vnd.mynfc": { source: "iana", extensions: ["taglet"] },
  "application/vnd.nacamar.ybrid+json": { source: "iana", compressible: !0 },
  "application/vnd.ncd.control": { source: "iana" },
  "application/vnd.ncd.reference": { source: "iana" },
  "application/vnd.nearst.inv+json": { source: "iana", compressible: !0 },
  "application/vnd.nebumind.line": { source: "iana" },
  "application/vnd.nervana": { source: "iana" },
  "application/vnd.netfpx": { source: "iana" },
  "application/vnd.neurolanguage.nlu": { source: "iana", extensions: ["nlu"] },
  "application/vnd.nimn": { source: "iana" },
  "application/vnd.nintendo.nitro.rom": { source: "iana" },
  "application/vnd.nintendo.snes.rom": { source: "iana" },
  "application/vnd.nitf": { source: "iana", extensions: ["ntf", "nitf"] },
  "application/vnd.noblenet-directory": { source: "iana", extensions: ["nnd"] },
  "application/vnd.noblenet-sealer": { source: "iana", extensions: ["nns"] },
  "application/vnd.noblenet-web": { source: "iana", extensions: ["nnw"] },
  "application/vnd.nokia.catalogs": { source: "iana" },
  "application/vnd.nokia.conml+wbxml": { source: "iana" },
  "application/vnd.nokia.conml+xml": { source: "iana", compressible: !0 },
  "application/vnd.nokia.iptv.config+xml": { source: "iana", compressible: !0 },
  "application/vnd.nokia.isds-radio-presets": { source: "iana" },
  "application/vnd.nokia.landmark+wbxml": { source: "iana" },
  "application/vnd.nokia.landmark+xml": { source: "iana", compressible: !0 },
  "application/vnd.nokia.landmarkcollection+xml": { source: "iana", compressible: !0 },
  "application/vnd.nokia.n-gage.ac+xml": { source: "iana", compressible: !0, extensions: ["ac"] },
  "application/vnd.nokia.n-gage.data": { source: "iana", extensions: ["ngdat"] },
  "application/vnd.nokia.n-gage.symbian.install": { source: "iana", extensions: ["n-gage"] },
  "application/vnd.nokia.ncd": { source: "iana" },
  "application/vnd.nokia.pcd+wbxml": { source: "iana" },
  "application/vnd.nokia.pcd+xml": { source: "iana", compressible: !0 },
  "application/vnd.nokia.radio-preset": { source: "iana", extensions: ["rpst"] },
  "application/vnd.nokia.radio-presets": { source: "iana", extensions: ["rpss"] },
  "application/vnd.novadigm.edm": { source: "iana", extensions: ["edm"] },
  "application/vnd.novadigm.edx": { source: "iana", extensions: ["edx"] },
  "application/vnd.novadigm.ext": { source: "iana", extensions: ["ext"] },
  "application/vnd.ntt-local.content-share": { source: "iana" },
  "application/vnd.ntt-local.file-transfer": { source: "iana" },
  "application/vnd.ntt-local.ogw_remote-access": { source: "iana" },
  "application/vnd.ntt-local.sip-ta_remote": { source: "iana" },
  "application/vnd.ntt-local.sip-ta_tcp_stream": { source: "iana" },
  "application/vnd.oasis.opendocument.chart": { source: "iana", extensions: ["odc"] },
  "application/vnd.oasis.opendocument.chart-template": { source: "iana", extensions: ["otc"] },
  "application/vnd.oasis.opendocument.database": { source: "iana", extensions: ["odb"] },
  "application/vnd.oasis.opendocument.formula": { source: "iana", extensions: ["odf"] },
  "application/vnd.oasis.opendocument.formula-template": { source: "iana", extensions: ["odft"] },
  "application/vnd.oasis.opendocument.graphics": { source: "iana", compressible: !1, extensions: ["odg"] },
  "application/vnd.oasis.opendocument.graphics-template": { source: "iana", extensions: ["otg"] },
  "application/vnd.oasis.opendocument.image": { source: "iana", extensions: ["odi"] },
  "application/vnd.oasis.opendocument.image-template": { source: "iana", extensions: ["oti"] },
  "application/vnd.oasis.opendocument.presentation": { source: "iana", compressible: !1, extensions: ["odp"] },
  "application/vnd.oasis.opendocument.presentation-template": { source: "iana", extensions: ["otp"] },
  "application/vnd.oasis.opendocument.spreadsheet": { source: "iana", compressible: !1, extensions: ["ods"] },
  "application/vnd.oasis.opendocument.spreadsheet-template": { source: "iana", extensions: ["ots"] },
  "application/vnd.oasis.opendocument.text": { source: "iana", compressible: !1, extensions: ["odt"] },
  "application/vnd.oasis.opendocument.text-master": { source: "iana", extensions: ["odm"] },
  "application/vnd.oasis.opendocument.text-template": { source: "iana", extensions: ["ott"] },
  "application/vnd.oasis.opendocument.text-web": { source: "iana", extensions: ["oth"] },
  "application/vnd.obn": { source: "iana" },
  "application/vnd.ocf+cbor": { source: "iana" },
  "application/vnd.oci.image.manifest.v1+json": { source: "iana", compressible: !0 },
  "application/vnd.oftn.l10n+json": { source: "iana", compressible: !0 },
  "application/vnd.oipf.contentaccessdownload+xml": { source: "iana", compressible: !0 },
  "application/vnd.oipf.contentaccessstreaming+xml": { source: "iana", compressible: !0 },
  "application/vnd.oipf.cspg-hexbinary": { source: "iana" },
  "application/vnd.oipf.dae.svg+xml": { source: "iana", compressible: !0 },
  "application/vnd.oipf.dae.xhtml+xml": { source: "iana", compressible: !0 },
  "application/vnd.oipf.mippvcontrolmessage+xml": { source: "iana", compressible: !0 },
  "application/vnd.oipf.pae.gem": { source: "iana" },
  "application/vnd.oipf.spdiscovery+xml": { source: "iana", compressible: !0 },
  "application/vnd.oipf.spdlist+xml": { source: "iana", compressible: !0 },
  "application/vnd.oipf.ueprofile+xml": { source: "iana", compressible: !0 },
  "application/vnd.oipf.userprofile+xml": { source: "iana", compressible: !0 },
  "application/vnd.olpc-sugar": { source: "iana", extensions: ["xo"] },
  "application/vnd.oma-scws-config": { source: "iana" },
  "application/vnd.oma-scws-http-request": { source: "iana" },
  "application/vnd.oma-scws-http-response": { source: "iana" },
  "application/vnd.oma.bcast.associated-procedure-parameter+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.bcast.drm-trigger+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.bcast.imd+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.bcast.ltkm": { source: "iana" },
  "application/vnd.oma.bcast.notification+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.bcast.provisioningtrigger": { source: "iana" },
  "application/vnd.oma.bcast.sgboot": { source: "iana" },
  "application/vnd.oma.bcast.sgdd+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.bcast.sgdu": { source: "iana" },
  "application/vnd.oma.bcast.simple-symbol-container": { source: "iana" },
  "application/vnd.oma.bcast.smartcard-trigger+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.bcast.sprov+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.bcast.stkm": { source: "iana" },
  "application/vnd.oma.cab-address-book+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.cab-feature-handler+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.cab-pcc+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.cab-subs-invite+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.cab-user-prefs+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.dcd": { source: "iana" },
  "application/vnd.oma.dcdc": { source: "iana" },
  "application/vnd.oma.dd2+xml": { source: "iana", compressible: !0, extensions: ["dd2"] },
  "application/vnd.oma.drm.risd+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.group-usage-list+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.lwm2m+cbor": { source: "iana" },
  "application/vnd.oma.lwm2m+json": { source: "iana", compressible: !0 },
  "application/vnd.oma.lwm2m+tlv": { source: "iana" },
  "application/vnd.oma.pal+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.poc.detailed-progress-report+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.poc.final-report+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.poc.groups+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.poc.invocation-descriptor+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.poc.optimized-progress-report+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.push": { source: "iana" },
  "application/vnd.oma.scidm.messages+xml": { source: "iana", compressible: !0 },
  "application/vnd.oma.xcap-directory+xml": { source: "iana", compressible: !0 },
  "application/vnd.omads-email+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/vnd.omads-file+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/vnd.omads-folder+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/vnd.omaloc-supl-init": { source: "iana" },
  "application/vnd.onepager": { source: "iana" },
  "application/vnd.onepagertamp": { source: "iana" },
  "application/vnd.onepagertamx": { source: "iana" },
  "application/vnd.onepagertat": { source: "iana" },
  "application/vnd.onepagertatp": { source: "iana" },
  "application/vnd.onepagertatx": { source: "iana" },
  "application/vnd.openblox.game+xml": { source: "iana", compressible: !0, extensions: ["obgx"] },
  "application/vnd.openblox.game-binary": { source: "iana" },
  "application/vnd.openeye.oeb": { source: "iana" },
  "application/vnd.openofficeorg.extension": { source: "apache", extensions: ["oxt"] },
  "application/vnd.openstreetmap.data+xml": { source: "iana", compressible: !0, extensions: ["osm"] },
  "application/vnd.opentimestamps.ots": { source: "iana" },
  "application/vnd.openxmlformats-officedocument.custom-properties+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.customxmlproperties+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.drawing+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.drawingml.chart+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramcolors+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramdata+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramlayout+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramstyle+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.extended-properties+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.commentauthors+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.comments+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.handoutmaster+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.notesmaster+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.notesslide+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { source: "iana", compressible: !1, extensions: ["pptx"] },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.presprops+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.slide": { source: "iana", extensions: ["sldx"] },
  "application/vnd.openxmlformats-officedocument.presentationml.slide+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.slidelayout+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.slidemaster+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow": { source: "iana", extensions: ["ppsx"] },
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.slideupdateinfo+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.tablestyles+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.tags+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.template": { source: "iana", extensions: ["potx"] },
  "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.presentationml.viewprops+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.calcchain+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.dialogsheet+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.externallink+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcachedefinition+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcacherecords+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivottable+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.querytable+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionheaders+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionlog+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedstrings+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { source: "iana", compressible: !1, extensions: ["xlsx"] },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheetmetadata+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.tablesinglecells+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template": { source: "iana", extensions: ["xltx"] },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.usernames+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.volatiledependencies+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.theme+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.themeoverride+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.vmldrawing": { source: "iana" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { source: "iana", compressible: !1, extensions: ["docx"] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.fonttable+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template": { source: "iana", extensions: ["dotx"] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.websettings+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-package.core-properties+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-package.digital-signature-xmlsignature+xml": { source: "iana", compressible: !0 },
  "application/vnd.openxmlformats-package.relationships+xml": { source: "iana", compressible: !0 },
  "application/vnd.oracle.resource+json": { source: "iana", compressible: !0 },
  "application/vnd.orange.indata": { source: "iana" },
  "application/vnd.osa.netdeploy": { source: "iana" },
  "application/vnd.osgeo.mapguide.package": { source: "iana", extensions: ["mgp"] },
  "application/vnd.osgi.bundle": { source: "iana" },
  "application/vnd.osgi.dp": { source: "iana", extensions: ["dp"] },
  "application/vnd.osgi.subsystem": { source: "iana", extensions: ["esa"] },
  "application/vnd.otps.ct-kip+xml": { source: "iana", compressible: !0 },
  "application/vnd.oxli.countgraph": { source: "iana" },
  "application/vnd.pagerduty+json": { source: "iana", compressible: !0 },
  "application/vnd.palm": { source: "iana", extensions: ["pdb", "pqa", "oprc"] },
  "application/vnd.panoply": { source: "iana" },
  "application/vnd.paos.xml": { source: "iana" },
  "application/vnd.patentdive": { source: "iana" },
  "application/vnd.patientecommsdoc": { source: "iana" },
  "application/vnd.pawaafile": { source: "iana", extensions: ["paw"] },
  "application/vnd.pcos": { source: "iana" },
  "application/vnd.pg.format": { source: "iana", extensions: ["str"] },
  "application/vnd.pg.osasli": { source: "iana", extensions: ["ei6"] },
  "application/vnd.piaccess.application-licence": { source: "iana" },
  "application/vnd.picsel": { source: "iana", extensions: ["efif"] },
  "application/vnd.pmi.widget": { source: "iana", extensions: ["wg"] },
  "application/vnd.poc.group-advertisement+xml": { source: "iana", compressible: !0 },
  "application/vnd.pocketlearn": { source: "iana", extensions: ["plf"] },
  "application/vnd.powerbuilder6": { source: "iana", extensions: ["pbd"] },
  "application/vnd.powerbuilder6-s": { source: "iana" },
  "application/vnd.powerbuilder7": { source: "iana" },
  "application/vnd.powerbuilder7-s": { source: "iana" },
  "application/vnd.powerbuilder75": { source: "iana" },
  "application/vnd.powerbuilder75-s": { source: "iana" },
  "application/vnd.preminet": { source: "iana" },
  "application/vnd.previewsystems.box": { source: "iana", extensions: ["box"] },
  "application/vnd.proteus.magazine": { source: "iana", extensions: ["mgz"] },
  "application/vnd.psfs": { source: "iana" },
  "application/vnd.publishare-delta-tree": { source: "iana", extensions: ["qps"] },
  "application/vnd.pvi.ptid1": { source: "iana", extensions: ["ptid"] },
  "application/vnd.pwg-multiplexed": { source: "iana" },
  "application/vnd.pwg-xhtml-print+xml": { source: "iana", compressible: !0 },
  "application/vnd.qualcomm.brew-app-res": { source: "iana" },
  "application/vnd.quarantainenet": { source: "iana" },
  "application/vnd.quark.quarkxpress": { source: "iana", extensions: ["qxd", "qxt", "qwd", "qwt", "qxl", "qxb"] },
  "application/vnd.quobject-quoxdocument": { source: "iana" },
  "application/vnd.radisys.moml+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-audit+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-audit-conf+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-audit-conn+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-audit-dialog+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-audit-stream+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-conf+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-dialog+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-dialog-base+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-dialog-fax-detect+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-dialog-fax-sendrecv+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-dialog-group+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-dialog-speech+xml": { source: "iana", compressible: !0 },
  "application/vnd.radisys.msml-dialog-transform+xml": { source: "iana", compressible: !0 },
  "application/vnd.rainstor.data": { source: "iana" },
  "application/vnd.rapid": { source: "iana" },
  "application/vnd.rar": { source: "iana", extensions: ["rar"] },
  "application/vnd.realvnc.bed": { source: "iana", extensions: ["bed"] },
  "application/vnd.recordare.musicxml": { source: "iana", extensions: ["mxl"] },
  "application/vnd.recordare.musicxml+xml": { source: "iana", compressible: !0, extensions: ["musicxml"] },
  "application/vnd.renlearn.rlprint": { source: "iana" },
  "application/vnd.resilient.logic": { source: "iana" },
  "application/vnd.restful+json": { source: "iana", compressible: !0 },
  "application/vnd.rig.cryptonote": { source: "iana", extensions: ["cryptonote"] },
  "application/vnd.rim.cod": { source: "apache", extensions: ["cod"] },
  "application/vnd.rn-realmedia": { source: "apache", extensions: ["rm"] },
  "application/vnd.rn-realmedia-vbr": { source: "apache", extensions: ["rmvb"] },
  "application/vnd.route66.link66+xml": { source: "iana", compressible: !0, extensions: ["link66"] },
  "application/vnd.rs-274x": { source: "iana" },
  "application/vnd.ruckus.download": { source: "iana" },
  "application/vnd.s3sms": { source: "iana" },
  "application/vnd.sailingtracker.track": { source: "iana", extensions: ["st"] },
  "application/vnd.sar": { source: "iana" },
  "application/vnd.sbm.cid": { source: "iana" },
  "application/vnd.sbm.mid2": { source: "iana" },
  "application/vnd.scribus": { source: "iana" },
  "application/vnd.sealed.3df": { source: "iana" },
  "application/vnd.sealed.csf": { source: "iana" },
  "application/vnd.sealed.doc": { source: "iana" },
  "application/vnd.sealed.eml": { source: "iana" },
  "application/vnd.sealed.mht": { source: "iana" },
  "application/vnd.sealed.net": { source: "iana" },
  "application/vnd.sealed.ppt": { source: "iana" },
  "application/vnd.sealed.tiff": { source: "iana" },
  "application/vnd.sealed.xls": { source: "iana" },
  "application/vnd.sealedmedia.softseal.html": { source: "iana" },
  "application/vnd.sealedmedia.softseal.pdf": { source: "iana" },
  "application/vnd.seemail": { source: "iana", extensions: ["see"] },
  "application/vnd.seis+json": { source: "iana", compressible: !0 },
  "application/vnd.sema": { source: "iana", extensions: ["sema"] },
  "application/vnd.semd": { source: "iana", extensions: ["semd"] },
  "application/vnd.semf": { source: "iana", extensions: ["semf"] },
  "application/vnd.shade-save-file": { source: "iana" },
  "application/vnd.shana.informed.formdata": { source: "iana", extensions: ["ifm"] },
  "application/vnd.shana.informed.formtemplate": { source: "iana", extensions: ["itp"] },
  "application/vnd.shana.informed.interchange": { source: "iana", extensions: ["iif"] },
  "application/vnd.shana.informed.package": { source: "iana", extensions: ["ipk"] },
  "application/vnd.shootproof+json": { source: "iana", compressible: !0 },
  "application/vnd.shopkick+json": { source: "iana", compressible: !0 },
  "application/vnd.shp": { source: "iana" },
  "application/vnd.shx": { source: "iana" },
  "application/vnd.sigrok.session": { source: "iana" },
  "application/vnd.simtech-mindmapper": { source: "iana", extensions: ["twd", "twds"] },
  "application/vnd.siren+json": { source: "iana", compressible: !0 },
  "application/vnd.smaf": { source: "iana", extensions: ["mmf"] },
  "application/vnd.smart.notebook": { source: "iana" },
  "application/vnd.smart.teacher": { source: "iana", extensions: ["teacher"] },
  "application/vnd.snesdev-page-table": { source: "iana" },
  "application/vnd.software602.filler.form+xml": { source: "iana", compressible: !0, extensions: ["fo"] },
  "application/vnd.software602.filler.form-xml-zip": { source: "iana" },
  "application/vnd.solent.sdkm+xml": { source: "iana", compressible: !0, extensions: ["sdkm", "sdkd"] },
  "application/vnd.spotfire.dxp": { source: "iana", extensions: ["dxp"] },
  "application/vnd.spotfire.sfs": { source: "iana", extensions: ["sfs"] },
  "application/vnd.sqlite3": { source: "iana" },
  "application/vnd.sss-cod": { source: "iana" },
  "application/vnd.sss-dtf": { source: "iana" },
  "application/vnd.sss-ntf": { source: "iana" },
  "application/vnd.stardivision.calc": { source: "apache", extensions: ["sdc"] },
  "application/vnd.stardivision.draw": { source: "apache", extensions: ["sda"] },
  "application/vnd.stardivision.impress": { source: "apache", extensions: ["sdd"] },
  "application/vnd.stardivision.math": { source: "apache", extensions: ["smf"] },
  "application/vnd.stardivision.writer": { source: "apache", extensions: ["sdw", "vor"] },
  "application/vnd.stardivision.writer-global": { source: "apache", extensions: ["sgl"] },
  "application/vnd.stepmania.package": { source: "iana", extensions: ["smzip"] },
  "application/vnd.stepmania.stepchart": { source: "iana", extensions: ["sm"] },
  "application/vnd.street-stream": { source: "iana" },
  "application/vnd.sun.wadl+xml": { source: "iana", compressible: !0, extensions: ["wadl"] },
  "application/vnd.sun.xml.calc": { source: "apache", extensions: ["sxc"] },
  "application/vnd.sun.xml.calc.template": { source: "apache", extensions: ["stc"] },
  "application/vnd.sun.xml.draw": { source: "apache", extensions: ["sxd"] },
  "application/vnd.sun.xml.draw.template": { source: "apache", extensions: ["std"] },
  "application/vnd.sun.xml.impress": { source: "apache", extensions: ["sxi"] },
  "application/vnd.sun.xml.impress.template": { source: "apache", extensions: ["sti"] },
  "application/vnd.sun.xml.math": { source: "apache", extensions: ["sxm"] },
  "application/vnd.sun.xml.writer": { source: "apache", extensions: ["sxw"] },
  "application/vnd.sun.xml.writer.global": { source: "apache", extensions: ["sxg"] },
  "application/vnd.sun.xml.writer.template": { source: "apache", extensions: ["stw"] },
  "application/vnd.sus-calendar": { source: "iana", extensions: ["sus", "susp"] },
  "application/vnd.svd": { source: "iana", extensions: ["svd"] },
  "application/vnd.swiftview-ics": { source: "iana" },
  "application/vnd.sycle+xml": { source: "iana", compressible: !0 },
  "application/vnd.syft+json": { source: "iana", compressible: !0 },
  "application/vnd.symbian.install": { source: "apache", extensions: ["sis", "sisx"] },
  "application/vnd.syncml+xml": { source: "iana", charset: "UTF-8", compressible: !0, extensions: ["xsm"] },
  "application/vnd.syncml.dm+wbxml": { source: "iana", charset: "UTF-8", extensions: ["bdm"] },
  "application/vnd.syncml.dm+xml": { source: "iana", charset: "UTF-8", compressible: !0, extensions: ["xdm"] },
  "application/vnd.syncml.dm.notification": { source: "iana" },
  "application/vnd.syncml.dmddf+wbxml": { source: "iana" },
  "application/vnd.syncml.dmddf+xml": { source: "iana", charset: "UTF-8", compressible: !0, extensions: ["ddf"] },
  "application/vnd.syncml.dmtnds+wbxml": { source: "iana" },
  "application/vnd.syncml.dmtnds+xml": { source: "iana", charset: "UTF-8", compressible: !0 },
  "application/vnd.syncml.ds.notification": { source: "iana" },
  "application/vnd.tableschema+json": { source: "iana", compressible: !0 },
  "application/vnd.tao.intent-module-archive": { source: "iana", extensions: ["tao"] },
  "application/vnd.tcpdump.pcap": { source: "iana", extensions: ["pcap", "cap", "dmp"] },
  "application/vnd.think-cell.ppttc+json": { source: "iana", compressible: !0 },
  "application/vnd.tmd.mediaflex.api+xml": { source: "iana", compressible: !0 },
  "application/vnd.tml": { source: "iana" },
  "application/vnd.tmobile-livetv": { source: "iana", extensions: ["tmo"] },
  "application/vnd.tri.onesource": { source: "iana" },
  "application/vnd.trid.tpt": { source: "iana", extensions: ["tpt"] },
  "application/vnd.triscape.mxs": { source: "iana", extensions: ["mxs"] },
  "application/vnd.trueapp": { source: "iana", extensions: ["tra"] },
  "application/vnd.truedoc": { source: "iana" },
  "application/vnd.ubisoft.webplayer": { source: "iana" },
  "application/vnd.ufdl": { source: "iana", extensions: ["ufd", "ufdl"] },
  "application/vnd.uiq.theme": { source: "iana", extensions: ["utz"] },
  "application/vnd.umajin": { source: "iana", extensions: ["umj"] },
  "application/vnd.unity": { source: "iana", extensions: ["unityweb"] },
  "application/vnd.uoml+xml": { source: "iana", compressible: !0, extensions: ["uoml"] },
  "application/vnd.uplanet.alert": { source: "iana" },
  "application/vnd.uplanet.alert-wbxml": { source: "iana" },
  "application/vnd.uplanet.bearer-choice": { source: "iana" },
  "application/vnd.uplanet.bearer-choice-wbxml": { source: "iana" },
  "application/vnd.uplanet.cacheop": { source: "iana" },
  "application/vnd.uplanet.cacheop-wbxml": { source: "iana" },
  "application/vnd.uplanet.channel": { source: "iana" },
  "application/vnd.uplanet.channel-wbxml": { source: "iana" },
  "application/vnd.uplanet.list": { source: "iana" },
  "application/vnd.uplanet.list-wbxml": { source: "iana" },
  "application/vnd.uplanet.listcmd": { source: "iana" },
  "application/vnd.uplanet.listcmd-wbxml": { source: "iana" },
  "application/vnd.uplanet.signal": { source: "iana" },
  "application/vnd.uri-map": { source: "iana" },
  "application/vnd.valve.source.material": { source: "iana" },
  "application/vnd.vcx": { source: "iana", extensions: ["vcx"] },
  "application/vnd.vd-study": { source: "iana" },
  "application/vnd.vectorworks": { source: "iana" },
  "application/vnd.vel+json": { source: "iana", compressible: !0 },
  "application/vnd.verimatrix.vcas": { source: "iana" },
  "application/vnd.veritone.aion+json": { source: "iana", compressible: !0 },
  "application/vnd.veryant.thin": { source: "iana" },
  "application/vnd.ves.encrypted": { source: "iana" },
  "application/vnd.vidsoft.vidconference": { source: "iana" },
  "application/vnd.visio": { source: "iana", extensions: ["vsd", "vst", "vss", "vsw"] },
  "application/vnd.visionary": { source: "iana", extensions: ["vis"] },
  "application/vnd.vividence.scriptfile": { source: "iana" },
  "application/vnd.vsf": { source: "iana", extensions: ["vsf"] },
  "application/vnd.wap.sic": { source: "iana" },
  "application/vnd.wap.slc": { source: "iana" },
  "application/vnd.wap.wbxml": { source: "iana", charset: "UTF-8", extensions: ["wbxml"] },
  "application/vnd.wap.wmlc": { source: "iana", extensions: ["wmlc"] },
  "application/vnd.wap.wmlscriptc": { source: "iana", extensions: ["wmlsc"] },
  "application/vnd.webturbo": { source: "iana", extensions: ["wtb"] },
  "application/vnd.wfa.dpp": { source: "iana" },
  "application/vnd.wfa.p2p": { source: "iana" },
  "application/vnd.wfa.wsc": { source: "iana" },
  "application/vnd.windows.devicepairing": { source: "iana" },
  "application/vnd.wmc": { source: "iana" },
  "application/vnd.wmf.bootstrap": { source: "iana" },
  "application/vnd.wolfram.mathematica": { source: "iana" },
  "application/vnd.wolfram.mathematica.package": { source: "iana" },
  "application/vnd.wolfram.player": { source: "iana", extensions: ["nbp"] },
  "application/vnd.wordperfect": { source: "iana", extensions: ["wpd"] },
  "application/vnd.wqd": { source: "iana", extensions: ["wqd"] },
  "application/vnd.wrq-hp3000-labelled": { source: "iana" },
  "application/vnd.wt.stf": { source: "iana", extensions: ["stf"] },
  "application/vnd.wv.csp+wbxml": { source: "iana" },
  "application/vnd.wv.csp+xml": { source: "iana", compressible: !0 },
  "application/vnd.wv.ssp+xml": { source: "iana", compressible: !0 },
  "application/vnd.xacml+json": { source: "iana", compressible: !0 },
  "application/vnd.xara": { source: "iana", extensions: ["xar"] },
  "application/vnd.xfdl": { source: "iana", extensions: ["xfdl"] },
  "application/vnd.xfdl.webform": { source: "iana" },
  "application/vnd.xmi+xml": { source: "iana", compressible: !0 },
  "application/vnd.xmpie.cpkg": { source: "iana" },
  "application/vnd.xmpie.dpkg": { source: "iana" },
  "application/vnd.xmpie.plan": { source: "iana" },
  "application/vnd.xmpie.ppkg": { source: "iana" },
  "application/vnd.xmpie.xlim": { source: "iana" },
  "application/vnd.yamaha.hv-dic": { source: "iana", extensions: ["hvd"] },
  "application/vnd.yamaha.hv-script": { source: "iana", extensions: ["hvs"] },
  "application/vnd.yamaha.hv-voice": { source: "iana", extensions: ["hvp"] },
  "application/vnd.yamaha.openscoreformat": { source: "iana", extensions: ["osf"] },
  "application/vnd.yamaha.openscoreformat.osfpvg+xml": { source: "iana", compressible: !0, extensions: ["osfpvg"] },
  "application/vnd.yamaha.remote-setup": { source: "iana" },
  "application/vnd.yamaha.smaf-audio": { source: "iana", extensions: ["saf"] },
  "application/vnd.yamaha.smaf-phrase": { source: "iana", extensions: ["spf"] },
  "application/vnd.yamaha.through-ngn": { source: "iana" },
  "application/vnd.yamaha.tunnel-udpencap": { source: "iana" },
  "application/vnd.yaoweme": { source: "iana" },
  "application/vnd.yellowriver-custom-menu": { source: "iana", extensions: ["cmp"] },
  "application/vnd.youtube.yt": { source: "iana" },
  "application/vnd.zul": { source: "iana", extensions: ["zir", "zirz"] },
  "application/vnd.zzazz.deck+xml": { source: "iana", compressible: !0, extensions: ["zaz"] },
  "application/voicexml+xml": { source: "iana", compressible: !0, extensions: ["vxml"] },
  "application/voucher-cms+json": { source: "iana", compressible: !0 },
  "application/vq-rtcpxr": { source: "iana" },
  "application/wasm": { source: "iana", compressible: !0, extensions: ["wasm"] },
  "application/watcherinfo+xml": { source: "iana", compressible: !0, extensions: ["wif"] },
  "application/webpush-options+json": { source: "iana", compressible: !0 },
  "application/whoispp-query": { source: "iana" },
  "application/whoispp-response": { source: "iana" },
  "application/widget": { source: "iana", extensions: ["wgt"] },
  "application/winhlp": { source: "apache", extensions: ["hlp"] },
  "application/wita": { source: "iana" },
  "application/wordperfect5.1": { source: "iana" },
  "application/wsdl+xml": { source: "iana", compressible: !0, extensions: ["wsdl"] },
  "application/wspolicy+xml": { source: "iana", compressible: !0, extensions: ["wspolicy"] },
  "application/x-7z-compressed": { source: "apache", compressible: !1, extensions: ["7z"] },
  "application/x-abiword": { source: "apache", extensions: ["abw"] },
  "application/x-ace-compressed": { source: "apache", extensions: ["ace"] },
  "application/x-amf": { source: "apache" },
  "application/x-apple-diskimage": { source: "apache", extensions: ["dmg"] },
  "application/x-arj": { compressible: !1, extensions: ["arj"] },
  "application/x-authorware-bin": { source: "apache", extensions: ["aab", "x32", "u32", "vox"] },
  "application/x-authorware-map": { source: "apache", extensions: ["aam"] },
  "application/x-authorware-seg": { source: "apache", extensions: ["aas"] },
  "application/x-bcpio": { source: "apache", extensions: ["bcpio"] },
  "application/x-bdoc": { compressible: !1, extensions: ["bdoc"] },
  "application/x-bittorrent": { source: "apache", extensions: ["torrent"] },
  "application/x-blorb": { source: "apache", extensions: ["blb", "blorb"] },
  "application/x-bzip": { source: "apache", compressible: !1, extensions: ["bz"] },
  "application/x-bzip2": { source: "apache", compressible: !1, extensions: ["bz2", "boz"] },
  "application/x-cbr": { source: "apache", extensions: ["cbr", "cba", "cbt", "cbz", "cb7"] },
  "application/x-cdlink": { source: "apache", extensions: ["vcd"] },
  "application/x-cfs-compressed": { source: "apache", extensions: ["cfs"] },
  "application/x-chat": { source: "apache", extensions: ["chat"] },
  "application/x-chess-pgn": { source: "apache", extensions: ["pgn"] },
  "application/x-chrome-extension": { extensions: ["crx"] },
  "application/x-cocoa": { source: "nginx", extensions: ["cco"] },
  "application/x-compress": { source: "apache" },
  "application/x-conference": { source: "apache", extensions: ["nsc"] },
  "application/x-cpio": { source: "apache", extensions: ["cpio"] },
  "application/x-csh": { source: "apache", extensions: ["csh"] },
  "application/x-deb": { compressible: !1 },
  "application/x-debian-package": { source: "apache", extensions: ["deb", "udeb"] },
  "application/x-dgc-compressed": { source: "apache", extensions: ["dgc"] },
  "application/x-director": { source: "apache", extensions: ["dir", "dcr", "dxr", "cst", "cct", "cxt", "w3d", "fgd", "swa"] },
  "application/x-doom": { source: "apache", extensions: ["wad"] },
  "application/x-dtbncx+xml": { source: "apache", compressible: !0, extensions: ["ncx"] },
  "application/x-dtbook+xml": { source: "apache", compressible: !0, extensions: ["dtb"] },
  "application/x-dtbresource+xml": { source: "apache", compressible: !0, extensions: ["res"] },
  "application/x-dvi": { source: "apache", compressible: !1, extensions: ["dvi"] },
  "application/x-envoy": { source: "apache", extensions: ["evy"] },
  "application/x-eva": { source: "apache", extensions: ["eva"] },
  "application/x-font-bdf": { source: "apache", extensions: ["bdf"] },
  "application/x-font-dos": { source: "apache" },
  "application/x-font-framemaker": { source: "apache" },
  "application/x-font-ghostscript": { source: "apache", extensions: ["gsf"] },
  "application/x-font-libgrx": { source: "apache" },
  "application/x-font-linux-psf": { source: "apache", extensions: ["psf"] },
  "application/x-font-pcf": { source: "apache", extensions: ["pcf"] },
  "application/x-font-snf": { source: "apache", extensions: ["snf"] },
  "application/x-font-speedo": { source: "apache" },
  "application/x-font-sunos-news": { source: "apache" },
  "application/x-font-type1": { source: "apache", extensions: ["pfa", "pfb", "pfm", "afm"] },
  "application/x-font-vfont": { source: "apache" },
  "application/x-freearc": { source: "apache", extensions: ["arc"] },
  "application/x-futuresplash": { source: "apache", extensions: ["spl"] },
  "application/x-gca-compressed": { source: "apache", extensions: ["gca"] },
  "application/x-glulx": { source: "apache", extensions: ["ulx"] },
  "application/x-gnumeric": { source: "apache", extensions: ["gnumeric"] },
  "application/x-gramps-xml": { source: "apache", extensions: ["gramps"] },
  "application/x-gtar": { source: "apache", extensions: ["gtar"] },
  "application/x-gzip": { source: "apache" },
  "application/x-hdf": { source: "apache", extensions: ["hdf"] },
  "application/x-httpd-php": { compressible: !0, extensions: ["php"] },
  "application/x-install-instructions": { source: "apache", extensions: ["install"] },
  "application/x-iso9660-image": { source: "apache", extensions: ["iso"] },
  "application/x-iwork-keynote-sffkey": { extensions: ["key"] },
  "application/x-iwork-numbers-sffnumbers": { extensions: ["numbers"] },
  "application/x-iwork-pages-sffpages": { extensions: ["pages"] },
  "application/x-java-archive-diff": { source: "nginx", extensions: ["jardiff"] },
  "application/x-java-jnlp-file": { source: "apache", compressible: !1, extensions: ["jnlp"] },
  "application/x-javascript": { compressible: !0 },
  "application/x-keepass2": { extensions: ["kdbx"] },
  "application/x-latex": { source: "apache", compressible: !1, extensions: ["latex"] },
  "application/x-lua-bytecode": { extensions: ["luac"] },
  "application/x-lzh-compressed": { source: "apache", extensions: ["lzh", "lha"] },
  "application/x-makeself": { source: "nginx", extensions: ["run"] },
  "application/x-mie": { source: "apache", extensions: ["mie"] },
  "application/x-mobipocket-ebook": { source: "apache", extensions: ["prc", "mobi"] },
  "application/x-mpegurl": { compressible: !1 },
  "application/x-ms-application": { source: "apache", extensions: ["application"] },
  "application/x-ms-shortcut": { source: "apache", extensions: ["lnk"] },
  "application/x-ms-wmd": { source: "apache", extensions: ["wmd"] },
  "application/x-ms-wmz": { source: "apache", extensions: ["wmz"] },
  "application/x-ms-xbap": { source: "apache", extensions: ["xbap"] },
  "application/x-msaccess": { source: "apache", extensions: ["mdb"] },
  "application/x-msbinder": { source: "apache", extensions: ["obd"] },
  "application/x-mscardfile": { source: "apache", extensions: ["crd"] },
  "application/x-msclip": { source: "apache", extensions: ["clp"] },
  "application/x-msdos-program": { extensions: ["exe"] },
  "application/x-msdownload": { source: "apache", extensions: ["exe", "dll", "com", "bat", "msi"] },
  "application/x-msmediaview": { source: "apache", extensions: ["mvb", "m13", "m14"] },
  "application/x-msmetafile": { source: "apache", extensions: ["wmf", "wmz", "emf", "emz"] },
  "application/x-msmoney": { source: "apache", extensions: ["mny"] },
  "application/x-mspublisher": { source: "apache", extensions: ["pub"] },
  "application/x-msschedule": { source: "apache", extensions: ["scd"] },
  "application/x-msterminal": { source: "apache", extensions: ["trm"] },
  "application/x-mswrite": { source: "apache", extensions: ["wri"] },
  "application/x-netcdf": { source: "apache", extensions: ["nc", "cdf"] },
  "application/x-ns-proxy-autoconfig": { compressible: !0, extensions: ["pac"] },
  "application/x-nzb": { source: "apache", extensions: ["nzb"] },
  "application/x-perl": { source: "nginx", extensions: ["pl", "pm"] },
  "application/x-pilot": { source: "nginx", extensions: ["prc", "pdb"] },
  "application/x-pkcs12": { source: "apache", compressible: !1, extensions: ["p12", "pfx"] },
  "application/x-pkcs7-certificates": { source: "apache", extensions: ["p7b", "spc"] },
  "application/x-pkcs7-certreqresp": { source: "apache", extensions: ["p7r"] },
  "application/x-pki-message": { source: "iana" },
  "application/x-rar-compressed": { source: "apache", compressible: !1, extensions: ["rar"] },
  "application/x-redhat-package-manager": { source: "nginx", extensions: ["rpm"] },
  "application/x-research-info-systems": { source: "apache", extensions: ["ris"] },
  "application/x-sea": { source: "nginx", extensions: ["sea"] },
  "application/x-sh": { source: "apache", compressible: !0, extensions: ["sh"] },
  "application/x-shar": { source: "apache", extensions: ["shar"] },
  "application/x-shockwave-flash": { source: "apache", compressible: !1, extensions: ["swf"] },
  "application/x-silverlight-app": { source: "apache", extensions: ["xap"] },
  "application/x-sql": { source: "apache", extensions: ["sql"] },
  "application/x-stuffit": { source: "apache", compressible: !1, extensions: ["sit"] },
  "application/x-stuffitx": { source: "apache", extensions: ["sitx"] },
  "application/x-subrip": { source: "apache", extensions: ["srt"] },
  "application/x-sv4cpio": { source: "apache", extensions: ["sv4cpio"] },
  "application/x-sv4crc": { source: "apache", extensions: ["sv4crc"] },
  "application/x-t3vm-image": { source: "apache", extensions: ["t3"] },
  "application/x-tads": { source: "apache", extensions: ["gam"] },
  "application/x-tar": { source: "apache", compressible: !0, extensions: ["tar"] },
  "application/x-tcl": { source: "apache", extensions: ["tcl", "tk"] },
  "application/x-tex": { source: "apache", extensions: ["tex"] },
  "application/x-tex-tfm": { source: "apache", extensions: ["tfm"] },
  "application/x-texinfo": { source: "apache", extensions: ["texinfo", "texi"] },
  "application/x-tgif": { source: "apache", extensions: ["obj"] },
  "application/x-ustar": { source: "apache", extensions: ["ustar"] },
  "application/x-virtualbox-hdd": { compressible: !0, extensions: ["hdd"] },
  "application/x-virtualbox-ova": { compressible: !0, extensions: ["ova"] },
  "application/x-virtualbox-ovf": { compressible: !0, extensions: ["ovf"] },
  "application/x-virtualbox-vbox": { compressible: !0, extensions: ["vbox"] },
  "application/x-virtualbox-vbox-extpack": { compressible: !1, extensions: ["vbox-extpack"] },
  "application/x-virtualbox-vdi": { compressible: !0, extensions: ["vdi"] },
  "application/x-virtualbox-vhd": { compressible: !0, extensions: ["vhd"] },
  "application/x-virtualbox-vmdk": { compressible: !0, extensions: ["vmdk"] },
  "application/x-wais-source": { source: "apache", extensions: ["src"] },
  "application/x-web-app-manifest+json": { compressible: !0, extensions: ["webapp"] },
  "application/x-www-form-urlencoded": { source: "iana", compressible: !0 },
  "application/x-x509-ca-cert": { source: "iana", extensions: ["der", "crt", "pem"] },
  "application/x-x509-ca-ra-cert": { source: "iana" },
  "application/x-x509-next-ca-cert": { source: "iana" },
  "application/x-xfig": { source: "apache", extensions: ["fig"] },
  "application/x-xliff+xml": { source: "apache", compressible: !0, extensions: ["xlf"] },
  "application/x-xpinstall": { source: "apache", compressible: !1, extensions: ["xpi"] },
  "application/x-xz": { source: "apache", extensions: ["xz"] },
  "application/x-zmachine": { source: "apache", extensions: ["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8"] },
  "application/x400-bp": { source: "iana" },
  "application/xacml+xml": { source: "iana", compressible: !0 },
  "application/xaml+xml": { source: "apache", compressible: !0, extensions: ["xaml"] },
  "application/xcap-att+xml": { source: "iana", compressible: !0, extensions: ["xav"] },
  "application/xcap-caps+xml": { source: "iana", compressible: !0, extensions: ["xca"] },
  "application/xcap-diff+xml": { source: "iana", compressible: !0, extensions: ["xdf"] },
  "application/xcap-el+xml": { source: "iana", compressible: !0, extensions: ["xel"] },
  "application/xcap-error+xml": { source: "iana", compressible: !0 },
  "application/xcap-ns+xml": { source: "iana", compressible: !0, extensions: ["xns"] },
  "application/xcon-conference-info+xml": { source: "iana", compressible: !0 },
  "application/xcon-conference-info-diff+xml": { source: "iana", compressible: !0 },
  "application/xenc+xml": { source: "iana", compressible: !0, extensions: ["xenc"] },
  "application/xhtml+xml": { source: "iana", compressible: !0, extensions: ["xhtml", "xht"] },
  "application/xhtml-voice+xml": { source: "apache", compressible: !0 },
  "application/xliff+xml": { source: "iana", compressible: !0, extensions: ["xlf"] },
  "application/xml": { source: "iana", compressible: !0, extensions: ["xml", "xsl", "xsd", "rng"] },
  "application/xml-dtd": { source: "iana", compressible: !0, extensions: ["dtd"] },
  "application/xml-external-parsed-entity": { source: "iana" },
  "application/xml-patch+xml": { source: "iana", compressible: !0 },
  "application/xmpp+xml": { source: "iana", compressible: !0 },
  "application/xop+xml": { source: "iana", compressible: !0, extensions: ["xop"] },
  "application/xproc+xml": { source: "apache", compressible: !0, extensions: ["xpl"] },
  "application/xslt+xml": { source: "iana", compressible: !0, extensions: ["xsl", "xslt"] },
  "application/xspf+xml": { source: "apache", compressible: !0, extensions: ["xspf"] },
  "application/xv+xml": { source: "iana", compressible: !0, extensions: ["mxml", "xhvml", "xvml", "xvm"] },
  "application/yang": { source: "iana", extensions: ["yang"] },
  "application/yang-data+json": { source: "iana", compressible: !0 },
  "application/yang-data+xml": { source: "iana", compressible: !0 },
  "application/yang-patch+json": { source: "iana", compressible: !0 },
  "application/yang-patch+xml": { source: "iana", compressible: !0 },
  "application/yin+xml": { source: "iana", compressible: !0, extensions: ["yin"] },
  "application/zip": { source: "iana", compressible: !1, extensions: ["zip"] },
  "application/zlib": { source: "iana" },
  "application/zstd": { source: "iana" },
  "audio/1d-interleaved-parityfec": { source: "iana" },
  "audio/32kadpcm": { source: "iana" },
  "audio/3gpp": { source: "iana", compressible: !1, extensions: ["3gpp"] },
  "audio/3gpp2": { source: "iana" },
  "audio/aac": { source: "iana" },
  "audio/ac3": { source: "iana" },
  "audio/adpcm": { source: "apache", extensions: ["adp"] },
  "audio/amr": { source: "iana", extensions: ["amr"] },
  "audio/amr-wb": { source: "iana" },
  "audio/amr-wb+": { source: "iana" },
  "audio/aptx": { source: "iana" },
  "audio/asc": { source: "iana" },
  "audio/atrac-advanced-lossless": { source: "iana" },
  "audio/atrac-x": { source: "iana" },
  "audio/atrac3": { source: "iana" },
  "audio/basic": { source: "iana", compressible: !1, extensions: ["au", "snd"] },
  "audio/bv16": { source: "iana" },
  "audio/bv32": { source: "iana" },
  "audio/clearmode": { source: "iana" },
  "audio/cn": { source: "iana" },
  "audio/dat12": { source: "iana" },
  "audio/dls": { source: "iana" },
  "audio/dsr-es201108": { source: "iana" },
  "audio/dsr-es202050": { source: "iana" },
  "audio/dsr-es202211": { source: "iana" },
  "audio/dsr-es202212": { source: "iana" },
  "audio/dv": { source: "iana" },
  "audio/dvi4": { source: "iana" },
  "audio/eac3": { source: "iana" },
  "audio/encaprtp": { source: "iana" },
  "audio/evrc": { source: "iana" },
  "audio/evrc-qcp": { source: "iana" },
  "audio/evrc0": { source: "iana" },
  "audio/evrc1": { source: "iana" },
  "audio/evrcb": { source: "iana" },
  "audio/evrcb0": { source: "iana" },
  "audio/evrcb1": { source: "iana" },
  "audio/evrcnw": { source: "iana" },
  "audio/evrcnw0": { source: "iana" },
  "audio/evrcnw1": { source: "iana" },
  "audio/evrcwb": { source: "iana" },
  "audio/evrcwb0": { source: "iana" },
  "audio/evrcwb1": { source: "iana" },
  "audio/evs": { source: "iana" },
  "audio/flexfec": { source: "iana" },
  "audio/fwdred": { source: "iana" },
  "audio/g711-0": { source: "iana" },
  "audio/g719": { source: "iana" },
  "audio/g722": { source: "iana" },
  "audio/g7221": { source: "iana" },
  "audio/g723": { source: "iana" },
  "audio/g726-16": { source: "iana" },
  "audio/g726-24": { source: "iana" },
  "audio/g726-32": { source: "iana" },
  "audio/g726-40": { source: "iana" },
  "audio/g728": { source: "iana" },
  "audio/g729": { source: "iana" },
  "audio/g7291": { source: "iana" },
  "audio/g729d": { source: "iana" },
  "audio/g729e": { source: "iana" },
  "audio/gsm": { source: "iana" },
  "audio/gsm-efr": { source: "iana" },
  "audio/gsm-hr-08": { source: "iana" },
  "audio/ilbc": { source: "iana" },
  "audio/ip-mr_v2.5": { source: "iana" },
  "audio/isac": { source: "apache" },
  "audio/l16": { source: "iana" },
  "audio/l20": { source: "iana" },
  "audio/l24": { source: "iana", compressible: !1 },
  "audio/l8": { source: "iana" },
  "audio/lpc": { source: "iana" },
  "audio/melp": { source: "iana" },
  "audio/melp1200": { source: "iana" },
  "audio/melp2400": { source: "iana" },
  "audio/melp600": { source: "iana" },
  "audio/mhas": { source: "iana" },
  "audio/midi": { source: "apache", extensions: ["mid", "midi", "kar", "rmi"] },
  "audio/mobile-xmf": { source: "iana", extensions: ["mxmf"] },
  "audio/mp3": { compressible: !1, extensions: ["mp3"] },
  "audio/mp4": { source: "iana", compressible: !1, extensions: ["m4a", "mp4a"] },
  "audio/mp4a-latm": { source: "iana" },
  "audio/mpa": { source: "iana" },
  "audio/mpa-robust": { source: "iana" },
  "audio/mpeg": { source: "iana", compressible: !1, extensions: ["mpga", "mp2", "mp2a", "mp3", "m2a", "m3a"] },
  "audio/mpeg4-generic": { source: "iana" },
  "audio/musepack": { source: "apache" },
  "audio/ogg": { source: "iana", compressible: !1, extensions: ["oga", "ogg", "spx", "opus"] },
  "audio/opus": { source: "iana" },
  "audio/parityfec": { source: "iana" },
  "audio/pcma": { source: "iana" },
  "audio/pcma-wb": { source: "iana" },
  "audio/pcmu": { source: "iana" },
  "audio/pcmu-wb": { source: "iana" },
  "audio/prs.sid": { source: "iana" },
  "audio/qcelp": { source: "iana" },
  "audio/raptorfec": { source: "iana" },
  "audio/red": { source: "iana" },
  "audio/rtp-enc-aescm128": { source: "iana" },
  "audio/rtp-midi": { source: "iana" },
  "audio/rtploopback": { source: "iana" },
  "audio/rtx": { source: "iana" },
  "audio/s3m": { source: "apache", extensions: ["s3m"] },
  "audio/scip": { source: "iana" },
  "audio/silk": { source: "apache", extensions: ["sil"] },
  "audio/smv": { source: "iana" },
  "audio/smv-qcp": { source: "iana" },
  "audio/smv0": { source: "iana" },
  "audio/sofa": { source: "iana" },
  "audio/sp-midi": { source: "iana" },
  "audio/speex": { source: "iana" },
  "audio/t140c": { source: "iana" },
  "audio/t38": { source: "iana" },
  "audio/telephone-event": { source: "iana" },
  "audio/tetra_acelp": { source: "iana" },
  "audio/tetra_acelp_bb": { source: "iana" },
  "audio/tone": { source: "iana" },
  "audio/tsvcis": { source: "iana" },
  "audio/uemclip": { source: "iana" },
  "audio/ulpfec": { source: "iana" },
  "audio/usac": { source: "iana" },
  "audio/vdvi": { source: "iana" },
  "audio/vmr-wb": { source: "iana" },
  "audio/vnd.3gpp.iufp": { source: "iana" },
  "audio/vnd.4sb": { source: "iana" },
  "audio/vnd.audiokoz": { source: "iana" },
  "audio/vnd.celp": { source: "iana" },
  "audio/vnd.cisco.nse": { source: "iana" },
  "audio/vnd.cmles.radio-events": { source: "iana" },
  "audio/vnd.cns.anp1": { source: "iana" },
  "audio/vnd.cns.inf1": { source: "iana" },
  "audio/vnd.dece.audio": { source: "iana", extensions: ["uva", "uvva"] },
  "audio/vnd.digital-winds": { source: "iana", extensions: ["eol"] },
  "audio/vnd.dlna.adts": { source: "iana" },
  "audio/vnd.dolby.heaac.1": { source: "iana" },
  "audio/vnd.dolby.heaac.2": { source: "iana" },
  "audio/vnd.dolby.mlp": { source: "iana" },
  "audio/vnd.dolby.mps": { source: "iana" },
  "audio/vnd.dolby.pl2": { source: "iana" },
  "audio/vnd.dolby.pl2x": { source: "iana" },
  "audio/vnd.dolby.pl2z": { source: "iana" },
  "audio/vnd.dolby.pulse.1": { source: "iana" },
  "audio/vnd.dra": { source: "iana", extensions: ["dra"] },
  "audio/vnd.dts": { source: "iana", extensions: ["dts"] },
  "audio/vnd.dts.hd": { source: "iana", extensions: ["dtshd"] },
  "audio/vnd.dts.uhd": { source: "iana" },
  "audio/vnd.dvb.file": { source: "iana" },
  "audio/vnd.everad.plj": { source: "iana" },
  "audio/vnd.hns.audio": { source: "iana" },
  "audio/vnd.lucent.voice": { source: "iana", extensions: ["lvp"] },
  "audio/vnd.ms-playready.media.pya": { source: "iana", extensions: ["pya"] },
  "audio/vnd.nokia.mobile-xmf": { source: "iana" },
  "audio/vnd.nortel.vbk": { source: "iana" },
  "audio/vnd.nuera.ecelp4800": { source: "iana", extensions: ["ecelp4800"] },
  "audio/vnd.nuera.ecelp7470": { source: "iana", extensions: ["ecelp7470"] },
  "audio/vnd.nuera.ecelp9600": { source: "iana", extensions: ["ecelp9600"] },
  "audio/vnd.octel.sbc": { source: "iana" },
  "audio/vnd.presonus.multitrack": { source: "iana" },
  "audio/vnd.qcelp": { source: "iana" },
  "audio/vnd.rhetorex.32kadpcm": { source: "iana" },
  "audio/vnd.rip": { source: "iana", extensions: ["rip"] },
  "audio/vnd.rn-realaudio": { compressible: !1 },
  "audio/vnd.sealedmedia.softseal.mpeg": { source: "iana" },
  "audio/vnd.vmx.cvsd": { source: "iana" },
  "audio/vnd.wave": { compressible: !1 },
  "audio/vorbis": { source: "iana", compressible: !1 },
  "audio/vorbis-config": { source: "iana" },
  "audio/wav": { compressible: !1, extensions: ["wav"] },
  "audio/wave": { compressible: !1, extensions: ["wav"] },
  "audio/webm": { source: "apache", compressible: !1, extensions: ["weba"] },
  "audio/x-aac": { source: "apache", compressible: !1, extensions: ["aac"] },
  "audio/x-aiff": { source: "apache", extensions: ["aif", "aiff", "aifc"] },
  "audio/x-caf": { source: "apache", compressible: !1, extensions: ["caf"] },
  "audio/x-flac": { source: "apache", extensions: ["flac"] },
  "audio/x-m4a": { source: "nginx", extensions: ["m4a"] },
  "audio/x-matroska": { source: "apache", extensions: ["mka"] },
  "audio/x-mpegurl": { source: "apache", extensions: ["m3u"] },
  "audio/x-ms-wax": { source: "apache", extensions: ["wax"] },
  "audio/x-ms-wma": { source: "apache", extensions: ["wma"] },
  "audio/x-pn-realaudio": { source: "apache", extensions: ["ram", "ra"] },
  "audio/x-pn-realaudio-plugin": { source: "apache", extensions: ["rmp"] },
  "audio/x-realaudio": { source: "nginx", extensions: ["ra"] },
  "audio/x-tta": { source: "apache" },
  "audio/x-wav": { source: "apache", extensions: ["wav"] },
  "audio/xm": { source: "apache", extensions: ["xm"] },
  "chemical/x-cdx": { source: "apache", extensions: ["cdx"] },
  "chemical/x-cif": { source: "apache", extensions: ["cif"] },
  "chemical/x-cmdf": { source: "apache", extensions: ["cmdf"] },
  "chemical/x-cml": { source: "apache", extensions: ["cml"] },
  "chemical/x-csml": { source: "apache", extensions: ["csml"] },
  "chemical/x-pdb": { source: "apache" },
  "chemical/x-xyz": { source: "apache", extensions: ["xyz"] },
  "font/collection": { source: "iana", extensions: ["ttc"] },
  "font/otf": { source: "iana", compressible: !0, extensions: ["otf"] },
  "font/sfnt": { source: "iana" },
  "font/ttf": { source: "iana", compressible: !0, extensions: ["ttf"] },
  "font/woff": { source: "iana", extensions: ["woff"] },
  "font/woff2": { source: "iana", extensions: ["woff2"] },
  "image/aces": { source: "iana", extensions: ["exr"] },
  "image/apng": { compressible: !1, extensions: ["apng"] },
  "image/avci": { source: "iana", extensions: ["avci"] },
  "image/avcs": { source: "iana", extensions: ["avcs"] },
  "image/avif": { source: "iana", compressible: !1, extensions: ["avif"] },
  "image/bmp": { source: "iana", compressible: !0, extensions: ["bmp"] },
  "image/cgm": { source: "iana", extensions: ["cgm"] },
  "image/dicom-rle": { source: "iana", extensions: ["drle"] },
  "image/emf": { source: "iana", extensions: ["emf"] },
  "image/fits": { source: "iana", extensions: ["fits"] },
  "image/g3fax": { source: "iana", extensions: ["g3"] },
  "image/gif": { source: "iana", compressible: !1, extensions: ["gif"] },
  "image/heic": { source: "iana", extensions: ["heic"] },
  "image/heic-sequence": { source: "iana", extensions: ["heics"] },
  "image/heif": { source: "iana", extensions: ["heif"] },
  "image/heif-sequence": { source: "iana", extensions: ["heifs"] },
  "image/hej2k": { source: "iana", extensions: ["hej2"] },
  "image/hsj2": { source: "iana", extensions: ["hsj2"] },
  "image/ief": { source: "iana", extensions: ["ief"] },
  "image/jls": { source: "iana", extensions: ["jls"] },
  "image/jp2": { source: "iana", compressible: !1, extensions: ["jp2", "jpg2"] },
  "image/jpeg": { source: "iana", compressible: !1, extensions: ["jpeg", "jpg", "jpe"] },
  "image/jph": { source: "iana", extensions: ["jph"] },
  "image/jphc": { source: "iana", extensions: ["jhc"] },
  "image/jpm": { source: "iana", compressible: !1, extensions: ["jpm"] },
  "image/jpx": { source: "iana", compressible: !1, extensions: ["jpx", "jpf"] },
  "image/jxr": { source: "iana", extensions: ["jxr"] },
  "image/jxra": { source: "iana", extensions: ["jxra"] },
  "image/jxrs": { source: "iana", extensions: ["jxrs"] },
  "image/jxs": { source: "iana", extensions: ["jxs"] },
  "image/jxsc": { source: "iana", extensions: ["jxsc"] },
  "image/jxsi": { source: "iana", extensions: ["jxsi"] },
  "image/jxss": { source: "iana", extensions: ["jxss"] },
  "image/ktx": { source: "iana", extensions: ["ktx"] },
  "image/ktx2": { source: "iana", extensions: ["ktx2"] },
  "image/naplps": { source: "iana" },
  "image/pjpeg": { compressible: !1 },
  "image/png": { source: "iana", compressible: !1, extensions: ["png"] },
  "image/prs.btif": { source: "iana", extensions: ["btif"] },
  "image/prs.pti": { source: "iana", extensions: ["pti"] },
  "image/pwg-raster": { source: "iana" },
  "image/sgi": { source: "apache", extensions: ["sgi"] },
  "image/svg+xml": { source: "iana", compressible: !0, extensions: ["svg", "svgz"] },
  "image/t38": { source: "iana", extensions: ["t38"] },
  "image/tiff": { source: "iana", compressible: !1, extensions: ["tif", "tiff"] },
  "image/tiff-fx": { source: "iana", extensions: ["tfx"] },
  "image/vnd.adobe.photoshop": { source: "iana", compressible: !0, extensions: ["psd"] },
  "image/vnd.airzip.accelerator.azv": { source: "iana", extensions: ["azv"] },
  "image/vnd.cns.inf2": { source: "iana" },
  "image/vnd.dece.graphic": { source: "iana", extensions: ["uvi", "uvvi", "uvg", "uvvg"] },
  "image/vnd.djvu": { source: "iana", extensions: ["djvu", "djv"] },
  "image/vnd.dvb.subtitle": { source: "iana", extensions: ["sub"] },
  "image/vnd.dwg": { source: "iana", extensions: ["dwg"] },
  "image/vnd.dxf": { source: "iana", extensions: ["dxf"] },
  "image/vnd.fastbidsheet": { source: "iana", extensions: ["fbs"] },
  "image/vnd.fpx": { source: "iana", extensions: ["fpx"] },
  "image/vnd.fst": { source: "iana", extensions: ["fst"] },
  "image/vnd.fujixerox.edmics-mmr": { source: "iana", extensions: ["mmr"] },
  "image/vnd.fujixerox.edmics-rlc": { source: "iana", extensions: ["rlc"] },
  "image/vnd.globalgraphics.pgb": { source: "iana" },
  "image/vnd.microsoft.icon": { source: "iana", compressible: !0, extensions: ["ico"] },
  "image/vnd.mix": { source: "iana" },
  "image/vnd.mozilla.apng": { source: "iana" },
  "image/vnd.ms-dds": { compressible: !0, extensions: ["dds"] },
  "image/vnd.ms-modi": { source: "iana", extensions: ["mdi"] },
  "image/vnd.ms-photo": { source: "apache", extensions: ["wdp"] },
  "image/vnd.net-fpx": { source: "iana", extensions: ["npx"] },
  "image/vnd.pco.b16": { source: "iana", extensions: ["b16"] },
  "image/vnd.radiance": { source: "iana" },
  "image/vnd.sealed.png": { source: "iana" },
  "image/vnd.sealedmedia.softseal.gif": { source: "iana" },
  "image/vnd.sealedmedia.softseal.jpg": { source: "iana" },
  "image/vnd.svf": { source: "iana" },
  "image/vnd.tencent.tap": { source: "iana", extensions: ["tap"] },
  "image/vnd.valve.source.texture": { source: "iana", extensions: ["vtf"] },
  "image/vnd.wap.wbmp": { source: "iana", extensions: ["wbmp"] },
  "image/vnd.xiff": { source: "iana", extensions: ["xif"] },
  "image/vnd.zbrush.pcx": { source: "iana", extensions: ["pcx"] },
  "image/webp": { source: "apache", extensions: ["webp"] },
  "image/wmf": { source: "iana", extensions: ["wmf"] },
  "image/x-3ds": { source: "apache", extensions: ["3ds"] },
  "image/x-cmu-raster": { source: "apache", extensions: ["ras"] },
  "image/x-cmx": { source: "apache", extensions: ["cmx"] },
  "image/x-freehand": { source: "apache", extensions: ["fh", "fhc", "fh4", "fh5", "fh7"] },
  "image/x-icon": { source: "apache", compressible: !0, extensions: ["ico"] },
  "image/x-jng": { source: "nginx", extensions: ["jng"] },
  "image/x-mrsid-image": { source: "apache", extensions: ["sid"] },
  "image/x-ms-bmp": { source: "nginx", compressible: !0, extensions: ["bmp"] },
  "image/x-pcx": { source: "apache", extensions: ["pcx"] },
  "image/x-pict": { source: "apache", extensions: ["pic", "pct"] },
  "image/x-portable-anymap": { source: "apache", extensions: ["pnm"] },
  "image/x-portable-bitmap": { source: "apache", extensions: ["pbm"] },
  "image/x-portable-graymap": { source: "apache", extensions: ["pgm"] },
  "image/x-portable-pixmap": { source: "apache", extensions: ["ppm"] },
  "image/x-rgb": { source: "apache", extensions: ["rgb"] },
  "image/x-tga": { source: "apache", extensions: ["tga"] },
  "image/x-xbitmap": { source: "apache", extensions: ["xbm"] },
  "image/x-xcf": { compressible: !1 },
  "image/x-xpixmap": { source: "apache", extensions: ["xpm"] },
  "image/x-xwindowdump": { source: "apache", extensions: ["xwd"] },
  "message/cpim": { source: "iana" },
  "message/delivery-status": { source: "iana" },
  "message/disposition-notification": { source: "iana", extensions: ["disposition-notification"] },
  "message/external-body": { source: "iana" },
  "message/feedback-report": { source: "iana" },
  "message/global": { source: "iana", extensions: ["u8msg"] },
  "message/global-delivery-status": { source: "iana", extensions: ["u8dsn"] },
  "message/global-disposition-notification": { source: "iana", extensions: ["u8mdn"] },
  "message/global-headers": { source: "iana", extensions: ["u8hdr"] },
  "message/http": { source: "iana", compressible: !1 },
  "message/imdn+xml": { source: "iana", compressible: !0 },
  "message/news": { source: "iana" },
  "message/partial": { source: "iana", compressible: !1 },
  "message/rfc822": { source: "iana", compressible: !0, extensions: ["eml", "mime"] },
  "message/s-http": { source: "iana" },
  "message/sip": { source: "iana" },
  "message/sipfrag": { source: "iana" },
  "message/tracking-status": { source: "iana" },
  "message/vnd.si.simp": { source: "iana" },
  "message/vnd.wfa.wsc": { source: "iana", extensions: ["wsc"] },
  "model/3mf": { source: "iana", extensions: ["3mf"] },
  "model/e57": { source: "iana" },
  "model/gltf+json": { source: "iana", compressible: !0, extensions: ["gltf"] },
  "model/gltf-binary": { source: "iana", compressible: !0, extensions: ["glb"] },
  "model/iges": { source: "iana", compressible: !1, extensions: ["igs", "iges"] },
  "model/mesh": { source: "iana", compressible: !1, extensions: ["msh", "mesh", "silo"] },
  "model/mtl": { source: "iana", extensions: ["mtl"] },
  "model/obj": { source: "iana", extensions: ["obj"] },
  "model/step": { source: "iana" },
  "model/step+xml": { source: "iana", compressible: !0, extensions: ["stpx"] },
  "model/step+zip": { source: "iana", compressible: !1, extensions: ["stpz"] },
  "model/step-xml+zip": { source: "iana", compressible: !1, extensions: ["stpxz"] },
  "model/stl": { source: "iana", extensions: ["stl"] },
  "model/vnd.collada+xml": { source: "iana", compressible: !0, extensions: ["dae"] },
  "model/vnd.dwf": { source: "iana", extensions: ["dwf"] },
  "model/vnd.flatland.3dml": { source: "iana" },
  "model/vnd.gdl": { source: "iana", extensions: ["gdl"] },
  "model/vnd.gs-gdl": { source: "apache" },
  "model/vnd.gs.gdl": { source: "iana" },
  "model/vnd.gtw": { source: "iana", extensions: ["gtw"] },
  "model/vnd.moml+xml": { source: "iana", compressible: !0 },
  "model/vnd.mts": { source: "iana", extensions: ["mts"] },
  "model/vnd.opengex": { source: "iana", extensions: ["ogex"] },
  "model/vnd.parasolid.transmit.binary": { source: "iana", extensions: ["x_b"] },
  "model/vnd.parasolid.transmit.text": { source: "iana", extensions: ["x_t"] },
  "model/vnd.pytha.pyox": { source: "iana" },
  "model/vnd.rosette.annotated-data-model": { source: "iana" },
  "model/vnd.sap.vds": { source: "iana", extensions: ["vds"] },
  "model/vnd.usdz+zip": { source: "iana", compressible: !1, extensions: ["usdz"] },
  "model/vnd.valve.source.compiled-map": { source: "iana", extensions: ["bsp"] },
  "model/vnd.vtu": { source: "iana", extensions: ["vtu"] },
  "model/vrml": { source: "iana", compressible: !1, extensions: ["wrl", "vrml"] },
  "model/x3d+binary": { source: "apache", compressible: !1, extensions: ["x3db", "x3dbz"] },
  "model/x3d+fastinfoset": { source: "iana", extensions: ["x3db"] },
  "model/x3d+vrml": { source: "apache", compressible: !1, extensions: ["x3dv", "x3dvz"] },
  "model/x3d+xml": { source: "iana", compressible: !0, extensions: ["x3d", "x3dz"] },
  "model/x3d-vrml": { source: "iana", extensions: ["x3dv"] },
  "multipart/alternative": { source: "iana", compressible: !1 },
  "multipart/appledouble": { source: "iana" },
  "multipart/byteranges": { source: "iana" },
  "multipart/digest": { source: "iana" },
  "multipart/encrypted": { source: "iana", compressible: !1 },
  "multipart/form-data": { source: "iana", compressible: !1 },
  "multipart/header-set": { source: "iana" },
  "multipart/mixed": { source: "iana" },
  "multipart/multilingual": { source: "iana" },
  "multipart/parallel": { source: "iana" },
  "multipart/related": { source: "iana", compressible: !1 },
  "multipart/report": { source: "iana" },
  "multipart/signed": { source: "iana", compressible: !1 },
  "multipart/vnd.bint.med-plus": { source: "iana" },
  "multipart/voice-message": { source: "iana" },
  "multipart/x-mixed-replace": { source: "iana" },
  "text/1d-interleaved-parityfec": { source: "iana" },
  "text/cache-manifest": { source: "iana", compressible: !0, extensions: ["appcache", "manifest"] },
  "text/calendar": { source: "iana", extensions: ["ics", "ifb"] },
  "text/calender": { compressible: !0 },
  "text/cmd": { compressible: !0 },
  "text/coffeescript": { extensions: ["coffee", "litcoffee"] },
  "text/cql": { source: "iana" },
  "text/cql-expression": { source: "iana" },
  "text/cql-identifier": { source: "iana" },
  "text/css": { source: "iana", charset: "UTF-8", compressible: !0, extensions: ["css"] },
  "text/csv": { source: "iana", compressible: !0, extensions: ["csv"] },
  "text/csv-schema": { source: "iana" },
  "text/directory": { source: "iana" },
  "text/dns": { source: "iana" },
  "text/ecmascript": { source: "iana" },
  "text/encaprtp": { source: "iana" },
  "text/enriched": { source: "iana" },
  "text/fhirpath": { source: "iana" },
  "text/flexfec": { source: "iana" },
  "text/fwdred": { source: "iana" },
  "text/gff3": { source: "iana" },
  "text/grammar-ref-list": { source: "iana" },
  "text/html": { source: "iana", compressible: !0, extensions: ["html", "htm", "shtml"] },
  "text/jade": { extensions: ["jade"] },
  "text/javascript": { source: "iana", compressible: !0 },
  "text/jcr-cnd": { source: "iana" },
  "text/jsx": { compressible: !0, extensions: ["jsx"] },
  "text/less": { compressible: !0, extensions: ["less"] },
  "text/markdown": { source: "iana", compressible: !0, extensions: ["markdown", "md"] },
  "text/mathml": { source: "nginx", extensions: ["mml"] },
  "text/mdx": { compressible: !0, extensions: ["mdx"] },
  "text/mizar": { source: "iana" },
  "text/n3": { source: "iana", charset: "UTF-8", compressible: !0, extensions: ["n3"] },
  "text/parameters": { source: "iana", charset: "UTF-8" },
  "text/parityfec": { source: "iana" },
  "text/plain": { source: "iana", compressible: !0, extensions: ["txt", "text", "conf", "def", "list", "log", "in", "ini"] },
  "text/provenance-notation": { source: "iana", charset: "UTF-8" },
  "text/prs.fallenstein.rst": { source: "iana" },
  "text/prs.lines.tag": { source: "iana", extensions: ["dsc"] },
  "text/prs.prop.logic": { source: "iana" },
  "text/raptorfec": { source: "iana" },
  "text/red": { source: "iana" },
  "text/rfc822-headers": { source: "iana" },
  "text/richtext": { source: "iana", compressible: !0, extensions: ["rtx"] },
  "text/rtf": { source: "iana", compressible: !0, extensions: ["rtf"] },
  "text/rtp-enc-aescm128": { source: "iana" },
  "text/rtploopback": { source: "iana" },
  "text/rtx": { source: "iana" },
  "text/sgml": { source: "iana", extensions: ["sgml", "sgm"] },
  "text/shaclc": { source: "iana" },
  "text/shex": { source: "iana", extensions: ["shex"] },
  "text/slim": { extensions: ["slim", "slm"] },
  "text/spdx": { source: "iana", extensions: ["spdx"] },
  "text/strings": { source: "iana" },
  "text/stylus": { extensions: ["stylus", "styl"] },
  "text/t140": { source: "iana" },
  "text/tab-separated-values": { source: "iana", compressible: !0, extensions: ["tsv"] },
  "text/troff": { source: "iana", extensions: ["t", "tr", "roff", "man", "me", "ms"] },
  "text/turtle": { source: "iana", charset: "UTF-8", extensions: ["ttl"] },
  "text/ulpfec": { source: "iana" },
  "text/uri-list": { source: "iana", compressible: !0, extensions: ["uri", "uris", "urls"] },
  "text/vcard": { source: "iana", compressible: !0, extensions: ["vcard"] },
  "text/vnd.a": { source: "iana" },
  "text/vnd.abc": { source: "iana" },
  "text/vnd.ascii-art": { source: "iana" },
  "text/vnd.curl": { source: "iana", extensions: ["curl"] },
  "text/vnd.curl.dcurl": { source: "apache", extensions: ["dcurl"] },
  "text/vnd.curl.mcurl": { source: "apache", extensions: ["mcurl"] },
  "text/vnd.curl.scurl": { source: "apache", extensions: ["scurl"] },
  "text/vnd.debian.copyright": { source: "iana", charset: "UTF-8" },
  "text/vnd.dmclientscript": { source: "iana" },
  "text/vnd.dvb.subtitle": { source: "iana", extensions: ["sub"] },
  "text/vnd.esmertec.theme-descriptor": { source: "iana", charset: "UTF-8" },
  "text/vnd.familysearch.gedcom": { source: "iana", extensions: ["ged"] },
  "text/vnd.ficlab.flt": { source: "iana" },
  "text/vnd.fly": { source: "iana", extensions: ["fly"] },
  "text/vnd.fmi.flexstor": { source: "iana", extensions: ["flx"] },
  "text/vnd.gml": { source: "iana" },
  "text/vnd.graphviz": { source: "iana", extensions: ["gv"] },
  "text/vnd.hans": { source: "iana" },
  "text/vnd.hgl": { source: "iana" },
  "text/vnd.in3d.3dml": { source: "iana", extensions: ["3dml"] },
  "text/vnd.in3d.spot": { source: "iana", extensions: ["spot"] },
  "text/vnd.iptc.newsml": { source: "iana" },
  "text/vnd.iptc.nitf": { source: "iana" },
  "text/vnd.latex-z": { source: "iana" },
  "text/vnd.motorola.reflex": { source: "iana" },
  "text/vnd.ms-mediapackage": { source: "iana" },
  "text/vnd.net2phone.commcenter.command": { source: "iana" },
  "text/vnd.radisys.msml-basic-layout": { source: "iana" },
  "text/vnd.senx.warpscript": { source: "iana" },
  "text/vnd.si.uricatalogue": { source: "iana" },
  "text/vnd.sosi": { source: "iana" },
  "text/vnd.sun.j2me.app-descriptor": { source: "iana", charset: "UTF-8", extensions: ["jad"] },
  "text/vnd.trolltech.linguist": { source: "iana", charset: "UTF-8" },
  "text/vnd.wap.si": { source: "iana" },
  "text/vnd.wap.sl": { source: "iana" },
  "text/vnd.wap.wml": { source: "iana", extensions: ["wml"] },
  "text/vnd.wap.wmlscript": { source: "iana", extensions: ["wmls"] },
  "text/vtt": { source: "iana", charset: "UTF-8", compressible: !0, extensions: ["vtt"] },
  "text/x-asm": { source: "apache", extensions: ["s", "asm"] },
  "text/x-c": { source: "apache", extensions: ["c", "cc", "cxx", "cpp", "h", "hh", "dic"] },
  "text/x-component": { source: "nginx", extensions: ["htc"] },
  "text/x-fortran": { source: "apache", extensions: ["f", "for", "f77", "f90"] },
  "text/x-gwt-rpc": { compressible: !0 },
  "text/x-handlebars-template": { extensions: ["hbs"] },
  "text/x-java-source": { source: "apache", extensions: ["java"] },
  "text/x-jquery-tmpl": { compressible: !0 },
  "text/x-lua": { extensions: ["lua"] },
  "text/x-markdown": { compressible: !0, extensions: ["mkd"] },
  "text/x-nfo": { source: "apache", extensions: ["nfo"] },
  "text/x-opml": { source: "apache", extensions: ["opml"] },
  "text/x-org": { compressible: !0, extensions: ["org"] },
  "text/x-pascal": { source: "apache", extensions: ["p", "pas"] },
  "text/x-processing": { compressible: !0, extensions: ["pde"] },
  "text/x-sass": { extensions: ["sass"] },
  "text/x-scss": { extensions: ["scss"] },
  "text/x-setext": { source: "apache", extensions: ["etx"] },
  "text/x-sfv": { source: "apache", extensions: ["sfv"] },
  "text/x-suse-ymp": { compressible: !0, extensions: ["ymp"] },
  "text/x-uuencode": { source: "apache", extensions: ["uu"] },
  "text/x-vcalendar": { source: "apache", extensions: ["vcs"] },
  "text/x-vcard": { source: "apache", extensions: ["vcf"] },
  "text/xml": { source: "iana", compressible: !0, extensions: ["xml"] },
  "text/xml-external-parsed-entity": { source: "iana" },
  "text/yaml": { compressible: !0, extensions: ["yaml", "yml"] },
  "video/1d-interleaved-parityfec": { source: "iana" },
  "video/3gpp": { source: "iana", extensions: ["3gp", "3gpp"] },
  "video/3gpp-tt": { source: "iana" },
  "video/3gpp2": { source: "iana", extensions: ["3g2"] },
  "video/av1": { source: "iana" },
  "video/bmpeg": { source: "iana" },
  "video/bt656": { source: "iana" },
  "video/celb": { source: "iana" },
  "video/dv": { source: "iana" },
  "video/encaprtp": { source: "iana" },
  "video/ffv1": { source: "iana" },
  "video/flexfec": { source: "iana" },
  "video/h261": { source: "iana", extensions: ["h261"] },
  "video/h263": { source: "iana", extensions: ["h263"] },
  "video/h263-1998": { source: "iana" },
  "video/h263-2000": { source: "iana" },
  "video/h264": { source: "iana", extensions: ["h264"] },
  "video/h264-rcdo": { source: "iana" },
  "video/h264-svc": { source: "iana" },
  "video/h265": { source: "iana" },
  "video/iso.segment": { source: "iana", extensions: ["m4s"] },
  "video/jpeg": { source: "iana", extensions: ["jpgv"] },
  "video/jpeg2000": { source: "iana" },
  "video/jpm": { source: "apache", extensions: ["jpm", "jpgm"] },
  "video/jxsv": { source: "iana" },
  "video/mj2": { source: "iana", extensions: ["mj2", "mjp2"] },
  "video/mp1s": { source: "iana" },
  "video/mp2p": { source: "iana" },
  "video/mp2t": { source: "iana", extensions: ["ts"] },
  "video/mp4": { source: "iana", compressible: !1, extensions: ["mp4", "mp4v", "mpg4"] },
  "video/mp4v-es": { source: "iana" },
  "video/mpeg": { source: "iana", compressible: !1, extensions: ["mpeg", "mpg", "mpe", "m1v", "m2v"] },
  "video/mpeg4-generic": { source: "iana" },
  "video/mpv": { source: "iana" },
  "video/nv": { source: "iana" },
  "video/ogg": { source: "iana", compressible: !1, extensions: ["ogv"] },
  "video/parityfec": { source: "iana" },
  "video/pointer": { source: "iana" },
  "video/quicktime": { source: "iana", compressible: !1, extensions: ["qt", "mov"] },
  "video/raptorfec": { source: "iana" },
  "video/raw": { source: "iana" },
  "video/rtp-enc-aescm128": { source: "iana" },
  "video/rtploopback": { source: "iana" },
  "video/rtx": { source: "iana" },
  "video/scip": { source: "iana" },
  "video/smpte291": { source: "iana" },
  "video/smpte292m": { source: "iana" },
  "video/ulpfec": { source: "iana" },
  "video/vc1": { source: "iana" },
  "video/vc2": { source: "iana" },
  "video/vnd.cctv": { source: "iana" },
  "video/vnd.dece.hd": { source: "iana", extensions: ["uvh", "uvvh"] },
  "video/vnd.dece.mobile": { source: "iana", extensions: ["uvm", "uvvm"] },
  "video/vnd.dece.mp4": { source: "iana" },
  "video/vnd.dece.pd": { source: "iana", extensions: ["uvp", "uvvp"] },
  "video/vnd.dece.sd": { source: "iana", extensions: ["uvs", "uvvs"] },
  "video/vnd.dece.video": { source: "iana", extensions: ["uvv", "uvvv"] },
  "video/vnd.directv.mpeg": { source: "iana" },
  "video/vnd.directv.mpeg-tts": { source: "iana" },
  "video/vnd.dlna.mpeg-tts": { source: "iana" },
  "video/vnd.dvb.file": { source: "iana", extensions: ["dvb"] },
  "video/vnd.fvt": { source: "iana", extensions: ["fvt"] },
  "video/vnd.hns.video": { source: "iana" },
  "video/vnd.iptvforum.1dparityfec-1010": { source: "iana" },
  "video/vnd.iptvforum.1dparityfec-2005": { source: "iana" },
  "video/vnd.iptvforum.2dparityfec-1010": { source: "iana" },
  "video/vnd.iptvforum.2dparityfec-2005": { source: "iana" },
  "video/vnd.iptvforum.ttsavc": { source: "iana" },
  "video/vnd.iptvforum.ttsmpeg2": { source: "iana" },
  "video/vnd.motorola.video": { source: "iana" },
  "video/vnd.motorola.videop": { source: "iana" },
  "video/vnd.mpegurl": { source: "iana", extensions: ["mxu", "m4u"] },
  "video/vnd.ms-playready.media.pyv": { source: "iana", extensions: ["pyv"] },
  "video/vnd.nokia.interleaved-multimedia": { source: "iana" },
  "video/vnd.nokia.mp4vr": { source: "iana" },
  "video/vnd.nokia.videovoip": { source: "iana" },
  "video/vnd.objectvideo": { source: "iana" },
  "video/vnd.radgamettools.bink": { source: "iana" },
  "video/vnd.radgamettools.smacker": { source: "iana" },
  "video/vnd.sealed.mpeg1": { source: "iana" },
  "video/vnd.sealed.mpeg4": { source: "iana" },
  "video/vnd.sealed.swf": { source: "iana" },
  "video/vnd.sealedmedia.softseal.mov": { source: "iana" },
  "video/vnd.uvvu.mp4": { source: "iana", extensions: ["uvu", "uvvu"] },
  "video/vnd.vivo": { source: "iana", extensions: ["viv"] },
  "video/vnd.youtube.yt": { source: "iana" },
  "video/vp8": { source: "iana" },
  "video/vp9": { source: "iana" },
  "video/webm": { source: "apache", compressible: !1, extensions: ["webm"] },
  "video/x-f4v": { source: "apache", extensions: ["f4v"] },
  "video/x-fli": { source: "apache", extensions: ["fli"] },
  "video/x-flv": { source: "apache", compressible: !1, extensions: ["flv"] },
  "video/x-m4v": { source: "apache", extensions: ["m4v"] },
  "video/x-matroska": { source: "apache", compressible: !1, extensions: ["mkv", "mk3d", "mks"] },
  "video/x-mng": { source: "apache", extensions: ["mng"] },
  "video/x-ms-asf": { source: "apache", extensions: ["asf", "asx"] },
  "video/x-ms-vob": { source: "apache", extensions: ["vob"] },
  "video/x-ms-wm": { source: "apache", extensions: ["wm"] },
  "video/x-ms-wmv": { source: "apache", compressible: !1, extensions: ["wmv"] },
  "video/x-ms-wmx": { source: "apache", extensions: ["wmx"] },
  "video/x-ms-wvx": { source: "apache", extensions: ["wvx"] },
  "video/x-msvideo": { source: "apache", extensions: ["avi"] },
  "video/x-sgi-movie": { source: "apache", extensions: ["movie"] },
  "video/x-smv": { source: "apache", extensions: ["smv"] },
  "x-conference/x-cooltalk": { source: "apache", extensions: ["ice"] },
  "x-shader/x-fragment": { compressible: !0 },
  "x-shader/x-vertex": { compressible: !0 }
};
/*!
 * mime-db
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015-2022 Douglas Christopher Wilson
 * MIT Licensed
 */
var ae, pe;
function He() {
  return pe || (pe = 1, ae = Xe), ae;
}
/*!
 * mime-types
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */
var le;
function We() {
  return le || (le = 1, function(n) {
    var e = He(), a = B.extname, s = /^\s*([^;\s]*)(?:;|\s|$)/, i = /^text\//i;
    n.charset = o, n.charsets = { lookup: o }, n.contentType = r, n.extension = t, n.extensions = /* @__PURE__ */ Object.create(null), n.lookup = p, n.types = /* @__PURE__ */ Object.create(null), l(n.extensions, n.types);
    function o(u) {
      if (!u || typeof u != "string")
        return !1;
      var f = s.exec(u), b = f && e[f[1].toLowerCase()];
      return b && b.charset ? b.charset : f && i.test(f[1]) ? "UTF-8" : !1;
    }
    function r(u) {
      if (!u || typeof u != "string")
        return !1;
      var f = u.indexOf("/") === -1 ? n.lookup(u) : u;
      if (!f)
        return !1;
      if (f.indexOf("charset") === -1) {
        var b = n.charset(f);
        b && (f += "; charset=" + b.toLowerCase());
      }
      return f;
    }
    function t(u) {
      if (!u || typeof u != "string")
        return !1;
      var f = s.exec(u), b = f && n.extensions[f[1].toLowerCase()];
      return !b || !b.length ? !1 : b[0];
    }
    function p(u) {
      if (!u || typeof u != "string")
        return !1;
      var f = a("x." + u).toLowerCase().substr(1);
      return f && n.types[f] || !1;
    }
    function l(u, f) {
      var b = ["nginx", "apache", void 0, "iana"];
      Object.keys(e).forEach(function(C) {
        var q = e[C], z = q.extensions;
        if (!(!z || !z.length)) {
          u[C] = z;
          for (var Z = 0; Z < z.length; Z++) {
            var P = z[Z];
            if (f[P]) {
              var re = b.indexOf(e[f[P]].source), ce = b.indexOf(q.source);
              if (f[P] !== "application/octet-stream" && (re > ce || re === ce && f[P].substr(0, 12) === "application/"))
                continue;
            }
            f[P] = C;
          }
        }
      });
    }
  }(ee)), ee;
}
var Be = We();
const Ye = /* @__PURE__ */ qe(Be);
W.config();
const ie = new De({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY
  }
}), Ee = async (n, e, a, s) => {
  const i = Ye.extension(a), o = `uploads/${n}/${s}/${e}/${X.randomUUID()}.${i}`, r = new Ce({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: o,
    ContentType: a,
    ACL: "private"
  });
  return { uploadUrl: await se(ie, r, { expiresIn: 60 }), key: o };
}, Ke = process.env.AI_CORE_URL || "http://localhost:3000/api", Je = I.object({
  step: I.number().describe("The step number, starting from 1."),
  name: I.string().optional().describe("A variable name to store the result of this step."),
  tool: I.enum([
    "vector_search",
    "get_all_entries",
    "retrieve_challenge_data",
    "conversational_reply"
  ]).describe("The name of the tool to use for this step."),
  parameters: I.record(I.any()).describe("An object of parameters for the tool.")
}), Ve = I.object({
  plan: I.array(Je).describe("The array of steps to execute.")
}), Qe = (n) => `You are an expert query planner for a journaling app. Your task is to analyze the user's question and create a step-by-step JSON plan to answer it.

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

User Question: "${n}"
`, Ze = async (n) => {
  const e = Qe(n);
  console.log((/* @__PURE__ */ new Date()).toISOString(), "currentDateandTime");
  try {
    const a = await h.post(`${Ke}/chat`, {
      query: e,
      provider: "ollama",
      format: "json"
      // This still tells Ollama to guarantee JSON output
    });
    console.log("[Planner] AI Core raw response:", a.data);
    let s;
    try {
      s = JSON.parse(a.data);
    } catch (i) {
      throw console.error("[Planner] Failed to parse JSON from AI response.", i), new Error("The AI planner returned invalid JSON.");
    }
    return Ve.parse(s), s;
  } catch (a) {
    throw a instanceof I.ZodError ? console.error("[Planner] Zod validation failed:", a.errors) : console.error("[Planner] Failed to create or validate a plan:", a), new Error("The AI planner failed to create a valid plan.");
  }
}, ea = process.env.AI_CORE_URL || "http://localhost:3000/api", aa = async ({ query: n, date_filter: e }) => (console.log(`[Tool: vector_search] Searching for: "${n}"`, { date_filter: e }), (await h.post(`${ea}/search`, {
  query: n,
  provider: "ollama",
  // This could also be dynamic
  limit: 5,
  date_filter: e || "all"
  // This is a placeholder for now
})).data.map((s) => s.payload.document)), na = async ({ date_filter: n }, e) => {
  console.log(`[Tool: get_all_entries] Fetching all entries for date range: ${JSON.stringify(n)}`);
  const a = new Date(n.from), s = new Date(n.to);
  if (isNaN(a.getTime()) || isNaN(s.getTime()))
    throw new Error("Invalid date_filter format. Expecting ISO 8601 timestamps.");
  const i = await c.query(
    `SELECT content FROM journal_entries 
         WHERE user_id = $1 AND created_at BETWEEN $2 AND $3
         ORDER BY created_at ASC`,
    [e, a.toISOString(), s.toISOString()]
  );
  return console.log(`[Tool: get_all_entries] Found ${i.rowCount} entries.`), console.log(i.rows), i.rows.map((o) => o.content);
}, sa = async ({ date_filter: n, status: e }, a) => {
  console.log(`[Tool: retrieve_challenge_data] Fetching challenges for: ${n}`);
  const s = n.includes("week") ? "7 days" : "30 days";
  return (await c.query(
    `SELECT title, status FROM daily_challenges WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '${s}' AND status = $2`,
    [a, e]
  )).rows;
}, ia = {
  vector_search: aa,
  get_all_entries: na,
  retrieve_challenge_data: sa
}, ue = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  toolKit: ia
}, Symbol.toStringTag, { value: "Module" })), ne = process.env.AI_CORE_URL || "http://localhost:3000/api", oa = async (n, e) => {
  console.log("[Agent] Creating a plan...");
  const a = await Ze(n);
  if (console.log("[Agent] Plan created:", JSON.stringify(a, null, 2)), a.plan[0]?.tool === "conversational_reply") {
    console.log("[Agent] Detected conversational reply. Bypassing tool execution.");
    const t = `You are MindSage, a personalized AI reflection. The user just said: "${n}". Respond with a brief, natural, and affirming acknowledgement and nothing else.
        Please respond in a conversational tone, and end with a brief, natural, and affirming acknowledgement. Do not include any other text or instructions.`;
    return (await h.post(`${ne}/chat`, {
      query: t,
      provider: "ollama"
    })).data;
  }
  console.log("[Agent] Executing complex plan...");
  const s = {};
  for (const t of a.plan)
    if (ue[t.tool]) {
      const p = await ue[t.tool](t.parameters, e), l = t.name || `step_${t.step}_result`;
      s[l] = p;
    } else
      console.warn(`[Agent] Unknown tool: ${t.tool}`);
  if (console.log("[Agent] Plan execution complete. Results:", s), console.log("[Agent] Synthesizing final answer..."), Object.values(s).find((t) => Array.isArray(t)).length === 0) {
    console.log("[Agent] No context to use. Giving conversation reply.");
    const t = `You are MindSage, a personalized AI reflection. The user just said: "${n}". Respond with a brief, natural, and affirming acknowledgement and nothing else.
        Please respond in a conversational tone, and end with a brief, natural, and affirming acknowledgement. Do not include any other text or instructions. You don't know the answer you just have to acknowledge the conversation and end with a brief, natural, and affirming .`;
    return (await h.post(`${ne}/chat`, {
      query: t,
      provider: "ollama"
    })).data;
  }
  const o = Object.entries(s).map(([t]) => `${JSON.stringify(t, null, 2)}`).join(`

`), r = await h.post(`${ne}/rag`, {
    query: n,
    context: o,
    provider: "ollama"
  });
  return console.log("[Agent] Final answer:", r.data), r.data;
}, R = w.Router(), ta = new he(), oe = process.env.AI_CORE_URL || "http://localhost:3000/api", Te = (n) => {
  const e = ta.analyze(n), a = Math.max(-1, Math.min(1, e.score / 10));
  return console.log(a), a;
};
R.post("/chat", x, async (n, e) => {
  const { query: a } = n.body, s = n.user.id;
  if (!a)
    return e.status(400).json({ error: "Missing required field: query" });
  try {
    console.log(`[Chat Route] Handing off query to agent for user ${s}`);
    const i = await oa(a, s);
    e.status(200).json({ answer: i });
  } catch (i) {
    console.error("[Chat Route] Error during agent execution:", i), e.status(500).send("An error occurred while processing your request.");
  }
});
R.post("/", x, async (n, e) => {
  const { title: a, content: s, mood_score: i, mood_tags: o, provider: r } = n.body;
  try {
    const t = Te(s), l = (await c.query(
      `INSERT INTO journal_entries 
       (user_id, title, content, mood_score, sentiment_score, mood_tags)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [n.user.id, a, s, i, t, o]
    )).rows[0].id;
    console.log(`[DB] Saved journal entry with ID: ${l}`), h.post(`${oe}/upsert`, {
      document: s,
      metadata: {
        user_id: n.user.id,
        journal_id: l,
        // Use the primary DB ID for linking
        date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        mood_score: i,
        mood_tags: o,
        full_title: a
      },
      provider: r
    }).catch((u) => {
      console.error(`[AI Core] Failed to upsert journal_id ${l}:`, u.response ? u.response.data : u.message);
    }), e.status(201).json({ journalId: l, userId: n.user.id });
  } catch (t) {
    console.error(t), e.status(500).send("Error saving journal entry");
  }
});
R.get(
  "/recent",
  x,
  async (n, e) => {
    try {
      const a = await c.query(
        "SELECT * FROM journal_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3",
        [n.user.id]
      );
      e.json(a.rows);
    } catch (a) {
      console.error(a), e.status(500).send("Error fetching recent entries");
    }
  }
);
R.get("/upload", x, async (n, e) => {
  const a = n.query.type, s = n.query.postId;
  if (console.log(s), n.user.id, console.log(`[API] 🔐 User ID: ${n.user.id}`), console.log(`[API] 📁 Requested file type: ${a}`), !a) return e.status(400).json({ error: "Missing file type" });
  try {
    const i = await Ee(n.user.id, s, a, posts);
    console.log("[API] ✅ Returning signed URL"), console.log(i, "result"), e.json(i);
  } catch (i) {
    console.error("[API] ❌ Error generating signed URL", i), e.status(500).json({ error: "Failed to generate upload URL" });
  }
});
R.get("/media/:key", x, async (n, e) => {
  const a = decodeURIComponent(n.params.key);
  try {
    const s = new be({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: a
    }), i = await se(ie, s, { expiresIn: 60 });
    e.json({ url: i });
  } catch (s) {
    console.error("❌ Failed to get signed URL", s), e.status(500).json({ error: "Could not generate image URL" });
  }
});
R.get("/", x, async (n, e) => {
  try {
    const a = await c.query("SELECT * FROM journal_entries WHERE user_id = $1 ORDER BY created_at DESC", [n.user.id]);
    console.log(a.rows), e.json(a.rows.map((s) => ({
      ...s,
      mood_tags: JSON.stringify(s.mood_tags)
    })));
  } catch (a) {
    console.error(a), e.status(500).send("Error fetching entries");
  }
});
R.get("/:id", x, async (n, e) => {
  try {
    const a = await c.query(
      "SELECT * FROM journal_entries WHERE id = $1 AND user_id = $2",
      [n.params.id, n.user.id]
    );
    if (a.rows.length === 0) return e.status(404).json({ error: "Not found" });
    e.json(a.rows[0]);
  } catch (a) {
    e.status(500).json({ error: a });
  }
});
R.get("/mood_score/:id", x, async (n, e) => {
  const a = n.user.id, s = n.params.id, i = Number.isInteger(+s) ? parseInt(s) : 7;
  try {
    const o = await c.query(
      `SELECT mood_score, created_at
       FROM journal_entries
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '${i} days'
       ORDER BY created_at ASC`,
      [a]
    );
    e.json(o.rows);
  } catch (o) {
    console.error("Error fetching journal data:", o), e.status(500).json({ error: "Internal server error" });
  }
});
R.put("/:id", x, async (n, e) => {
  const a = n.params.id, { title: s, content: i, mood_score: o, mood_tags: r, provider: t } = n.body;
  try {
    const p = Te(i), l = await c.query(
      `UPDATE journal_entries SET 
         title = $1, content = $2, mood_score = $3, sentiment_score = $4, mood_tags = $5
       WHERE id = $6 AND user_id = $7 RETURNING *`,
      [s, i, o, p, r, a, n.user.id]
    );
    if (l.rows.length === 0)
      return e.status(404).json({ error: "Journal entry not found" });
    console.log(`[DB] Updated journal entry with ID: ${a}`), h.put(`${oe}/edit/${a}`, {
      document: i,
      metadata: {
        user_id: n.user.id,
        journal_id: a,
        date: l.rows[0].created_at.toISOString().split("T")[0],
        mood_score: o,
        mood_tags: r,
        full_title: s
      },
      provider: t
    }).catch((u) => {
      console.error(`[AI Core] Failed to update journal_id ${a}:`, u.response ? u.response.data : u.message);
    }), e.json(l.rows[0]);
  } catch (p) {
    e.status(500).json({ error: p });
  }
});
R.delete("/:id", x, async (n, e) => {
  const a = n.params.id;
  try {
    const s = await c.query(
      "DELETE FROM journal_analysis WHERE journal_id = $1 RETURNING *",
      [a]
    );
    if ((await c.query(
      "DELETE FROM journal_entries WHERE id = $1 AND user_id = $2 RETURNING *",
      [a, n.user.id]
    )).rows.length === 0)
      return e.status(404).json({ error: "Journal entry not found" });
    console.log(`[DB] Deleted journal entry with ID: ${a}`), h.delete(`${oe}/delete/${a}`).catch((o) => {
      console.error(`[AI Core] Failed to delete journal_id ${a}:`, o.response ? o.response.data : o.message);
    }), e.sendStatus(204);
  } catch (s) {
    console.log(s, "Error"), e.status(500).json({ error: "Server error" });
  }
});
const U = (n, e, a) => {
  if (n.headers["x-cron-secret"] !== process.env.CRON_SECRET)
    return e.status(403).json({ error: "Unauthorized" });
  a();
}, _ = w.Router();
_.get("/me", x, async (n, e) => {
  try {
    console.log("Fetching user info for ID:", n.user);
    const a = n.user.id || n.user.userId, s = n.user.username, i = await c.query(
      "SELECT username, email, created_at, full_name, timezone FROM users WHERE id = $1 AND username = $2",
      [a, s]
    ), o = await c.query(
      `SELECT COUNT(*) FROM journal_entries 
       WHERE user_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE
      )`,
      [n.user.id]
    ), r = await c.query(
      `SELECT created_at FROM journal_entries
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [n.user.id]
    ), t = await c.query(
      `SELECT COUNT(*) FROM user_streaks
        WHERE user_id = $1`,
      [n.user.id]
    ), p = Intl.DateTimeFormat().resolvedOptions().timeZone, l = parseInt(o.rows[0].count, 10);
    if (i.rows.length === 0)
      return e.status(404).json({ error: "User not found" });
    const u = i.rows[0];
    u.entriesCount = l, u.lastEntryDate = r.rows.length > 0 ? r.rows[0].created_at : null, console.log("User streaks:", t.rows[0].count), e.json(u);
  } catch (a) {
    console.error("Error fetching user:", a), e.status(500).json({ error: "Internal server error" });
  }
});
_.put("/me", x, async (n, e) => {
  const { username: a, email: s } = n.body;
  try {
    await c.query("UPDATE users SET username = $1, email = $2 WHERE id = $3", [a, s, n.user.id]), e.send("User profile updated");
  } catch (i) {
    console.error(i), e.status(500).send("Server error");
  }
});
_.get("/", U, async (n, e) => {
  try {
    const { rows: a } = await c.query("SELECT id FROM users"), s = a.map((i) => i.id);
    e.json({ userIds: s });
  } catch (a) {
    console.error("Failed to fetch user IDs:", a.message), e.status(500).json({ error: "Internal server error" });
  }
});
_.get("/no-journal-today", U, async (n, e) => {
  try {
    const { rows: a } = await c.query(`
      SELECT id FROM users
      WHERE id NOT IN (
        SELECT DISTINCT user_id
        FROM journal_entries
        WHERE created_at::date = CURRENT_DATE
      )
    `);
    e.json(a.map((s) => s.id));
  } catch (a) {
    console.error("❌ Error fetching inactive users:", a.message), e.status(500).json({ error: "Failed to check user activity" });
  }
});
_.get("/inactive-3-days", U, async (n, e) => {
  try {
    const { rows: a } = await c.query(`
      SELECT id AS user_id
      FROM users
      WHERE id NOT IN (
        SELECT DISTINCT user_id
        FROM journal_entries
        WHERE created_at::date >= CURRENT_DATE - INTERVAL '3 days'
      );
    `);
    e.json(a.map((s) => s.user_id));
  } catch (a) {
    console.error("Error fetching inactive users:", a.message), e.status(500).json({ error: "Failed to fetch inactive users" });
  }
});
_.get("/consistent-3-days", U, async (n, e) => {
  try {
    const { rows: a } = await c.query(`
      SELECT user_id
      FROM (
        SELECT user_id, COUNT(DISTINCT created_at::date) AS days_written
        FROM journal_entries
        WHERE created_at::date >= CURRENT_DATE - INTERVAL '2 days'
        GROUP BY user_id
      ) AS recent
      WHERE days_written = 3;
    `);
    e.json(a.map((s) => s.user_id));
  } catch (a) {
    console.error("Error fetching consistent users:", a.message), e.status(500).json({ error: "Failed to fetch consistent users" });
  }
});
_.get("/monthly-summary/:id", U, async (n, e) => {
  try {
    const a = (/* @__PURE__ */ new Date()).getMonth(), s = new Date((/* @__PURE__ */ new Date()).getFullYear(), a - 1, 1), i = new Date((/* @__PURE__ */ new Date()).getFullYear(), a, 0), { rows: o } = await c.query(`
        SELECT user_id,
             COUNT(*) as entry_count,
             ROUND(AVG(mood_score)) as avg_mood
      FROM journal_entries
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY user_id
    `, [s, i]);
    e.status(200).json({ data: o });
  } catch (a) {
    e.status(500).json({ err: a });
  }
});
_.get("/me/settings", x, async (n, e) => {
  try {
    const { rows: a } = await c.query("SELECT * FROM user_settings WHERE user_id = $1", [n.user.id]);
    e.json(a[0]);
  } catch (a) {
    console.error("Error fetching user settings:", a), e.status(500).json({ error: "Internal server error" });
  }
});
_.put("/me/settings", x, async (n, e) => {
  const s = [
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
  ].map((t) => t.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()), i = [], o = [];
  let r = 1;
  if (s.forEach((t) => {
    n.body.hasOwnProperty(t) && (i.push(`${t} = $${r++}`), o.push(n.body[t]));
  }), o.push(n.user.id), i.length === 0)
    return e.status(400).send("No valid settings provided");
  try {
    await c.query(
      `UPDATE user_settings SET ${i.join(", ")} WHERE user_id = $${r}`,
      o
    );
    const t = await c.query(
      "SELECT * FROM user_settings WHERE user_id = $1",
      [n.user.id]
    );
    e.send(t.rows[0]);
  } catch (t) {
    console.error("Error updating user settings:", t), e.status(500).send("Internal server error");
  }
});
_.delete("/me", x, async (n, e) => {
  const a = await c.query("SELECT password_hash FROM users WHERE id = $1", [n.user.id]).then((o) => o.rows[0].password_hash), { password: s } = n.body;
  if (!await j.compare(s, a))
    return e.status(403).send("Incorrect password");
  try {
    await c.query("DELETE FROM users WHERE id = $1", [n.user.id]), e.status(200).send("User account deleted successfully");
  } catch (o) {
    console.error("Error deleting user account:", o), e.status(500).send("Internal server error");
  }
});
_.put("/me/change-password", x, async (n, e) => {
  console.log("Changing password", n.body, n.user);
  const { old_password: a, new_password: s } = n.body;
  try {
    const o = (await c.query("SELECT * FROM users WHERE id = $1", [n.user.id])).rows[0];
    if (!o) return e.status(404).send("User not found");
    if (!await j.compare(a, o.password_hash)) return e.status(403).send("Incorrect current password");
    const t = await j.hash(s, 10);
    await c.query("UPDATE users SET password_hash = $1 WHERE id = $2", [t, n.user.id]), e.send("Password updated successfully");
  } catch (i) {
    console.error(i), e.status(500).send("Server error");
  }
});
const F = w.Router();
F.post("/:id", U, async (n, e) => {
  try {
    const { title: a, body: s, type: i } = n.body, o = n.params.id;
    await c.query(
      "INSERT INTO notifications (user_id, title, body, type) VALUES ($1, $2, $3, $4)",
      [o, a, s, i]
    ), e.status(201).json({ message: `notification sent to user id: ${o}` });
  } catch (a) {
    e.status(500).send(a);
  }
});
F.post("/", U, async (n, e) => {
  try {
    const { title: a, body: s, type: i, user_id: o } = n.body;
    let r;
    Array.isArray(userid) && userid.length > 0 ? r = userids.map((p) => ({ id: p })) : r = (await c.query("SELECT id FROM users")).rows;
    const t = r.map((p) => (console.log("Notification for user:", p.id), c.query(
      "INSERT INTO notifications (user_id, title, body, type) VALUES ($1, $2, $3, $4)",
      [p.id, a, s, i]
    )));
    await Promise.all(t), e.status(201).json({ message: "Notifications created successfully" });
  } catch (a) {
    console.error("🚨 Error creating notifications:", a.message), e.status(500).json({ error: "Internal Server Error" });
  }
});
F.get("/", x, async (n, e) => {
  try {
    const a = await c.query(
      "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC",
      [n.user.id]
    );
    e.json(a.rows);
  } catch (a) {
    console.error("Error fetching notifications:", a), e.status(500).json({ error: "Internal server error" });
  }
});
F.put("/:id/read", x, async (n, e) => {
  await c.query(
    "UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2",
    [n.params.id, n.user.id]
  ), e.json({ message: "Marked as read" });
});
F.put("/read-all", x, async (n, e) => {
  try {
    await c.query(
      'UPDATE notifications SET "read" = TRUE WHERE user_id = $1',
      [n.user.id]
    ), e.json({
      message: "All notifications marked as read"
    });
  } catch (a) {
    console.error("Error setting all to read:", a.message), e.status(500).json({
      error: "Failed to mark notifications as read"
    });
  }
});
const k = w.Router();
k.get("/today", x, async (n, e) => {
  const { rows: a } = await c.query(
    "SELECT * FROM daily_challenges WHERE challenge_date = CURRENT_DATE"
  );
  if (a.length === 0) return e.status(404).json({ error: "No challenge today" });
  e.json(a[0]);
});
k.post("/accept", x, async (n, e) => {
  const a = n.user.id, { rows: s } = await c.query(
    "SELECT id FROM daily_challenges WHERE challenge_date = CURRENT_DATE"
  );
  if (s.length === 0) return e.status(404).json({ error: "No challenge today" });
  const i = s[0].id;
  try {
    await c.query(
      `INSERT INTO user_challenges (user_id, challenge_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [a, i]
    ), e.json({ message: "Challenge accepted" });
  } catch {
    e.status(500).json({ error: "Could not accept challenge" });
  }
});
k.get(
  "/status",
  x,
  async (n, e) => {
    const a = n.user.id, { rows: s } = await c.query(
      `SELECT dc.*, uc.accepted_at, uc.completed_at, uc.image_key
     FROM daily_challenges dc
     LEFT JOIN user_challenges uc
        ON dc.id = uc.challenge_id AND uc.user_id = $1
      WHERE dc.challenge_date = CURRENT_DATE`,
      [a]
    );
    if (s.length === 0) return e.status(404).json({ error: "No challenge today" });
    e.json(s[0]);
  }
);
k.put("/complete", x, async (n, e) => {
  const { image_key: a, challenge_id: s } = n.body, i = n.user.id;
  try {
    await c.query(
      `UPDATE user_challenges
       SET completed_at = NOW(), image_key = $1
       WHERE user_id = $2 AND challenge_id = $3`,
      [a, i, s]
    ), e.json({ message: "Challenge completed" });
  } catch {
    e.status(500).json({ error: "Failed to mark as completed" });
  }
});
k.get("/user", x, async (n, e) => {
  const a = n.user.id, { rows: s } = await c.query(`
    SELECT dc.*, uc.accepted_at, uc.completed_at, uc.image_key
    FROM daily_challenges dc
    LEFT JOIN user_challenges uc
      ON dc.id = uc.challenge_id AND uc.user_id = $1
    ORDER BY dc.date DESC
  `, [a]);
  e.json(s);
});
k.post("/create", U, async (n, e) => {
  const { title: a, description: s, date: i } = n.body;
  if (!a)
    return e.status(400).json({ error: "Title is required" });
  const o = i || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  try {
    const r = await c.query(
      `INSERT INTO daily_challenges (title, description, challenge_date)
       VALUES ($1, $2, $3)
       ON CONFLICT (challenge_date) DO NOTHING
       RETURNING *`,
      [a, s || "", o]
    );
    if (r.rows.length === 0)
      return e.status(409).json({ message: "Challenge already exists for this date" });
    e.status(201).json({
      message: "Challenge created successfully",
      challenge: r.rows[0]
    });
  } catch (r) {
    console.error("Error creating challenge:", r.message), e.status(500).json({ error: "Failed to create challenge" });
  }
});
k.get("/upload", x, async (n, e) => {
  const a = n.query.type, s = n.query.challengeId;
  if (console.log(s), console.log(`[API] 🔐 User ID: ${n.user.id}`), console.log(`[API] 📁 Requested file type: ${a}`), !a) return e.status(400).json({ error: "Missing file type" });
  try {
    const i = await Ee(n.user.id, s, a, "challenge");
    console.log("[API] ✅ Returning signed URL"), console.log(i, "result"), e.json(i);
  } catch (i) {
    console.error("[API] ❌ Error generating signed URL", i), e.status(500).json({ error: "Failed to generate upload URL" });
  }
});
k.get("/image-url", x, async (n, e) => {
  const { key: a } = n.query;
  if (!a) return e.status(400).json({ error: "Missing image key" });
  try {
    const s = new be({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: a
    }), i = await se(ie, s, { expiresIn: 60 });
    e.json({ url: i });
  } catch (s) {
    console.error("[API] ❌ Error generating signed URL", s), e.status(500).json({ error: "Failed to generate image URL" });
  }
});
W.config();
const ra = new Fe({
  apiKey: process.env.GEMINI_API_KEY
});
async function te(n, e) {
  try {
    const a = await ra.models.generateContent({
      model: e,
      contents: n
    }), s = a.candidates[0].content.parts[0].text, i = a.usageMetadata;
    return { result: s, usageMetadata: i };
  } catch (a) {
    throw console.error("Gemini error:", a), new Error("Failed to generate content");
  }
}
const J = w.Router(), ca = fe(import.meta.url), pa = Ae(ca);
J.post("/text", x, async (n, e) => {
  let { prompt: a, model: s } = n.body;
  if (s || (s = "gemini-2.5-flash"), !a)
    return e.status(400).json({ error: "Prompt is required" });
  try {
    const i = await te(a, s);
    e.json({ data: i });
  } catch (i) {
    e.status(500).json({ error: i.message || "Internal Server Error" });
  }
});
J.post("/analyze-journal", x, async (n, e) => {
  let { content: a } = n.body;
  const s = "gemini-2.5-flash";
  if (!a) return e.status(400).json({ error: "content is required." });
  const i = `
    You are a mental health assistant that extracts structured behavioral insights from journal entries.

    Here’s a journal entry:
    """
${a}
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
    const r = (await te(i, s)).result;
    console.log("Gemini raw output:", r);
    const t = r.indexOf("{"), p = r.lastIndexOf("}") + 1, l = r.slice(t, p), u = JSON.parse(l);
    e.json({ data: u });
  } catch (o) {
    e.status(500).json({ error: o.message || "Internal Server Error" });
  }
});
J.post("/analyze-user-patterns", x, async (n, e) => {
  const a = "gemini-2.5-flash", { file: s } = n.body, i = B.resolve(pa, "journals.json");
  ge.readFileSync(i, "utf8");
  const o = [s, `
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
    const t = (await te(o, a)).result;
    console.log("Gemini raw output:", t);
    const p = t.indexOf("{"), l = t.lastIndexOf("}") + 1, u = t.slice(p, l), f = JSON.parse(u);
    e.json({ data: f });
  } catch (r) {
    e.status(500).json({ error: r.message || "Internal Server Error" });
  }
});
const L = w.Router();
L.get("/types", x, async (n, e) => {
  try {
    const a = n.user.id, i = (await c.query(
      "SELECT DISTINCT pattern_type FROM ai_insights WHERE user_id = $1",
      [a]
    )).rows.map((o) => o.pattern_type);
    e.status(200).json({ types: i });
  } catch (a) {
    e.status(500).json({ error: a.message });
  }
});
L.get("/", x, async (n, e) => {
  try {
    const a = n.user.id, s = await c.query(
      "SELECT * FROM ai_insights WHERE user_id = $1 ORDER BY detected_at DESC",
      [a]
    );
    e.status(200).json(s.rows);
  } catch (a) {
    e.status(500).json({ error: a.message });
  }
});
L.get("/:id", x, async (n, e) => {
  try {
    const { id: a } = n.params, s = await c.query(
      "SELECT * FROM ai_insights WHERE id = $1 AND user_id = $2",
      [a, n.user.id]
    );
    if (s.rows.length === 0)
      return e.status(404).json({ error: "Insight not found" });
    e.status(200).json(s.rows[0]);
  } catch (a) {
    e.status(500).json({ error: a.message });
  }
});
L.post("/", x, async (n, e) => {
  try {
    const a = n.user.id, {
      pattern_type: s,
      pattern_description: i,
      recurring_day: o,
      source_journal_ids: r
    } = n.body, t = await c.query(
      `INSERT INTO ai_insights 
            (user_id, pattern_type, pattern_description, recurring_day, source_journal_ids)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
      [a, s, i, o, r]
    );
    e.status(201).json(t.rows[0]);
  } catch (a) {
    e.status(500).json({ error: a.message });
  }
});
L.put("/:id", x, async (n, e) => {
  try {
    const { id: a } = n.params, s = n.user.id, {
      pattern_type: i,
      pattern_description: o,
      recurring_day: r,
      source_journal_ids: t
    } = n.body, p = await c.query(
      `UPDATE ai_insights SET 
            pattern_type = $1,
            pattern_description = $2,
            recurring_day = $3,
            source_journal_ids = $4
            WHERE id = $5 AND user_id = $6
            RETURNING *`,
      [i, o, r, t, a, s]
    );
    if (p.rows.length === 0)
      return e.status(404).json({ error: "Insight not found or unauthorized" });
    e.status(200).json(p.rows[0]);
  } catch (a) {
    e.status(500).json({ error: a.message });
  }
});
L.delete("/:id", x, async (n, e) => {
  try {
    const { id: a } = n.params, s = n.user.id;
    if ((await c.query(
      "DELETE FROM ai_insights WHERE id = $1 AND user_id = $2 RETURNING *",
      [a, s]
    )).rows.length === 0)
      return e.status(404).json({ error: "Insight not found or unauthorized" });
    e.status(204).send();
  } catch (a) {
    e.status(500).json({ error: a.message });
  }
});
L.get("/by-type/:type", x, async (n, e) => {
  try {
    const a = n.user.id, { type: s } = n.params, i = await c.query(
      "SELECT * FROM ai_insights WHERE user_id = $1 AND pattern_type ILIKE $2",
      [a, s]
    );
    e.status(200).json(i.rows);
  } catch (a) {
    e.status(500).json({ error: a.message });
  }
});
const $ = w.Router();
$.get("/", x, async (n, e) => {
  try {
    const a = await c.query(
      "SELECT * FROM ai_interventions WHERE user_id = $1 ORDER BY recommended_at DESC",
      [n.user.id]
    );
    e.status(200).json(a.rows);
  } catch (a) {
    e.status(500).json({ error: a.message });
  }
});
$.get("/:id", x, async (n, e) => {
  try {
    const a = await c.query(
      "SELECT * FROM ai_interventions WHERE id = $1 AND user_id = $2",
      [n.params.id, n.user.id]
    );
    if (a.rows.length === 0)
      return e.status(404).json({ error: "Intervention not found" });
    e.status(200).json(a.rows[0]);
  } catch (a) {
    e.status(500).json({ error: a.message });
  }
});
$.post("/", x, async (n, e) => {
  const {
    insight_id: a,
    title: s,
    description: i,
    type: o,
    recommended_at: r,
    status: t,
    completed_at: p
  } = n.body;
  try {
    const l = await c.query(
      `INSERT INTO ai_interventions (
        user_id, insight_id, title, description, type,
        recommended_at, status, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        n.user.id,
        a || null,
        s,
        i || null,
        o,
        r || /* @__PURE__ */ new Date(),
        t || "suggested",
        p || null
      ]
    );
    e.status(201).json({ interventionId: l.rows[0].id });
  } catch (l) {
    e.status(500).json({ error: l.message });
  }
});
$.put("/:id", x, async (n, e) => {
  const {
    title: a,
    description: s,
    type: i,
    status: o,
    completed_at: r
  } = n.body;
  try {
    const t = await c.query(
      `UPDATE ai_interventions
       SET title = $1,
           description = $2,
           type = $3,
           status = $4,
           completed_at = $5
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [
        a,
        s,
        i,
        o,
        r,
        n.params.id,
        n.user.id
      ]
    );
    if (t.rows.length === 0)
      return e.status(404).json({ error: "Intervention not found or unauthorized" });
    e.status(200).json({ message: "Updated successfully", intervention: t.rows[0] });
  } catch (t) {
    e.status(500).json({ error: t.message });
  }
});
$.delete("/:id", x, async (n, e) => {
  try {
    if ((await c.query(
      "DELETE FROM ai_interventions WHERE id = $1 AND user_id = $2 RETURNING *",
      [n.params.id, n.user.id]
    )).rows.length === 0)
      return e.status(404).json({ error: "Intervention not found or unauthorized" });
    e.status(200).json({ message: "Deleted successfully" });
  } catch (a) {
    e.status(500).json({ error: a.message });
  }
});
const G = w.Router();
G.get("/:id", x, async (n, e) => {
  const a = n.params.id;
  try {
    const s = await c.query(`
            SELECT * FROM journal_analysis WHERE journal_id = $1;
            `, [a]);
    e.status(200).json(s.rows);
  } catch (s) {
    e.status(500).json({ error: s });
  }
});
G.post("/", x, async (n, e) => {
  const { journal_id: a, sentiment: s, mood: i, topics: o, recurring_thoughts: r, cognitive_distortions: t, suggested_therapy_technique: p, analyzed_at: l } = n.body;
  try {
    const u = await c.query(`
            INSERT INTO journal_analysis 
            (journal_id, sentiment, mood, topics, recurring_thoughts, cognitive_distortions, suggested_therapy_technique, analyzed_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
            `, [a, s, i, o, r, t, p, l]);
    console.log(u);
    const f = u.rows[0].id;
    e.status(200).json({ analysisId: f });
  } catch (u) {
    e.status(500).json({ error: u });
  }
});
G.delete("/:id", x, async (n, e) => {
  const a = n.params.id;
  try {
    if ((await c.query(
      "DELETE FROM journal_analysis WHERE id = $1 RETURNING *;",
      [a]
    )).rows.length === 0)
      return e.status(404).json({ error: "Analysis not found" });
    e.status(200).json({ message: "Deleted successfully" });
  } catch (s) {
    e.status(500).json({ error: s.message });
  }
});
G.get("/user/:userId", x, async (n, e) => {
  const { userId: a } = n.params;
  try {
    const s = await c.query(`
            SELECT ja.*
            FROM journal_analysis ja
            JOIN journal_entries j ON ja.journal_id = j.id
            WHERE j.user_id = $1
            ORDER BY ja.analyzed_at DESC;
        `, [a]);
    e.status(200).json(s.rows);
  } catch (s) {
    e.status(500).json({ error: s.message });
  }
});
const la = fe(import.meta.url), ua = B.dirname(la), da = B.resolve(ua, "../../.env");
W.config({ path: da });
const T = w();
T.use(
  Ne({
    origin: "http://localhost:5173",
    // frontend origin
    credentials: !0,
    // allow cookies
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);
T.use(w.json());
T.use(ke());
T.use("/api/ai/gemini", J);
T.use("/api/ai/insights", L);
T.use("/api/ai/interventions", $);
T.use("/api/auth", N);
T.use("/api/journals", R);
T.use("/api/journal-analysis", G);
T.use("/api/users", _);
T.use("/api/notifications", F);
T.use("/api/challenges", k);
const de = process.env.PORT || 4e3;
function ma() {
  T.listen(de, () => {
    console.log(`Server is running on http://localhost:${de}`);
  });
}
const ye = y.join(process.env.APPDATA || (process.platform == "darwin" ? process.env.HOME + "/Library/Preferences" : process.env.HOME + "/.local/share"), "MindSage", "mind-sage.db");
S.mkdirSync(y.dirname(ye), { recursive: !0 });
const d = new $e(ye);
function xa() {
  d.exec(`
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            full_name TEXT,
            timezone TEXT,
            profile_picture TEXT, -- <-- ADDED column for profile image path
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
  try {
    d.prepare("PRAGMA table_info(users)").all().some((o) => o.name === "profile_picture") || (d.prepare("ALTER TABLE users ADD COLUMN profile_picture TEXT").run(), console.log("Added users.profile_picture column via ALTER TABLE"));
  } catch (s) {
    console.error("Error ensuring profile_picture column exists:", s);
  }
  d.prepare(`
        INSERT OR IGNORE INTO users (id, username, email, password_hash, full_name)
        VALUES (0, 'System', 'system@mindsage.app', 'N/A', 'System User')
    `).run();
  const e = [
    { name: "Health", color: "#FF6B6B" },
    { name: "Work", color: "#4ECDC4" },
    { name: "Finance", color: "#FFD93D" },
    { name: "Personal Growth", color: "#6A4C93" },
    { name: "Leisure", color: "#1A535C" }
  ], a = d.prepare(`
        INSERT OR IGNORE INTO categories (user_id, name, color)
        VALUES (0, ?, ?)
    `);
  for (const s of e)
    a.run(s.name, s.color);
  console.log("Local database with sync columns initialized successfully.");
}
const va = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  db: d,
  initDatabase: xa
}, Symbol.toStringTag, { value: "Module" }));
function fa(n) {
  return d.prepare("SELECT * FROM users WHERE email = ? OR username = ?").get(n, n);
}
function ga(n, e) {
  return d.prepare("SELECT * FROM users WHERE email = ? OR username = ?").get(n, e);
}
function ha(n) {
  const { username: e, email: a, password: s, full_name: i, timezone: o } = n, r = j.hashSync(s, 10), t = d.prepare(`
        INSERT INTO users (username, email, password_hash, full_name, timezone)
        VALUES (?, ?, ?, ?, ?)
    `), p = d.prepare("INSERT INTO user_settings (user_id) VALUES (?)");
  return d.transaction((u) => {
    const b = t.run(u.username, u.email, u.hashedPassword, u.full_name, u.timezone).lastInsertRowid;
    return p.run(b), { id: b, username: u.username };
  })({ username: e, email: a, hashedPassword: r, full_name: i, timezone: o });
}
const ba = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  createUser: ha,
  findUserByIdentifier: fa,
  findUserForCheck: ga
}, Symbol.toStringTag, { value: "Module" }));
function Ea(n) {
  const e = d.prepare("SELECT * FROM users WHERE id = ?").get(n);
  if (!e) return null;
  const a = d.prepare(
    `
        SELECT COUNT(*) as count FROM journal_entries 
        WHERE user_id = ? AND created_at >= date('now', 'start of month') AND is_deleted = 0
    `
  ).get(n), s = d.prepare(`
        SELECT MAX(created_at) as last_entry_
        FROM journal_entries WHERE user_id = ? AND is_deleted = 0
    `).get(n);
  return e.lastEntryDate = s?.last_entry_ || null, e.entriesCount = a?.count || 0, e;
}
function Ta(n, { username: e, email: a, full_name: s }) {
  d.prepare(
    "UPDATE users SET username = ?, email = ?, full_name = ? WHERE id = ?"
  ).run(e, a, s, n);
  const o = d.prepare(
    "SELECT id, username, email, created_at, full_name, timezone FROM users WHERE id = ?"
  ).get(n);
  return o ? (console.log(o, "+++++++++++++++++++++++++++++++++++++++++++++USER"), o) : null;
}
function ya(n) {
  return d.prepare("SELECT * FROM user_settings WHERE user_id = ?").get(n);
}
function _a(n, e) {
  const a = Object.keys(e);
  let s = Object.values(e);
  if (a.length === 0) return;
  s = s.map((r) => typeof r == "boolean" ? r ? 1 : 0 : r);
  const i = a.map((r) => `${r} = ?`).join(", ");
  return d.prepare(`UPDATE user_settings SET ${i}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`).run(...s, n);
}
function wa(n) {
  return d.prepare("DELETE FROM users WHERE id = ?").run(n);
}
function Ra(n, e) {
  const a = j.hashSync(e, 10);
  return d.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(a, n);
}
const ja = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  changePassword: Ra,
  deleteUser: wa,
  getUserById: Ea,
  getUserSettings: ya,
  updateUserProfile: Ta,
  updateUserSettings: _a
}, Symbol.toStringTag, { value: "Module" })), Ia = new he(), _e = (n) => {
  if (!n) return 0;
  const e = Ia.analyze(n);
  return Math.max(-1, Math.min(1, e.score / 10));
};
function Na(n, e) {
  const { title: a, content: s, mood_score: i, mood_tags: o } = e;
  console.log(e);
  const r = _e(s || ""), t = JSON.stringify(o || []), p = (/* @__PURE__ */ new Date()).toISOString(), l = d.prepare(`
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
  return console.log(
    n,
    a,
    s,
    i,
    r,
    t,
    p,
    p,
    0,
    "create",
    "params++++++++++++++++++++"
  ), {
    journalId: l.run({
      userId: n,
      title: a || null,
      content: s || "",
      mood_score: i || null,
      sentiment_score: r,
      mood_tags: t,
      created_at: p,
      updated_at: p
    }).lastInsertRowid,
    userId: n
  };
}
function ka(n) {
  return d.prepare("SELECT * FROM journal_entries WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at DESC LIMIT 3").all(n);
}
function Aa(n, e = 10, a = 0, s, i) {
  console.log(n, e, a, s, i);
  let o = `
    SELECT *
    FROM journal_entries
    WHERE user_id = ?
      AND is_deleted = 0
  `;
  const r = [n];
  return s && i ? (o += " AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)", r.push(s, i)) : s ? (o += " AND DATE(created_at) >= DATE(?)", r.push(s)) : i && (o += " AND DATE(created_at) <= DATE(?)", r.push(i)), o += `
    ORDER BY DATETIME(created_at) DESC
    LIMIT ? OFFSET ?
  `, r.push(a, e), console.log(o), d.prepare(o).all(...r);
}
function Sa(n, e = "top") {
  if (e === "random") {
    const s = d.prepare(
      `SELECT COUNT(*) AS total
       FROM journal_entries
       WHERE user_id = ?
         AND is_deleted = 0
         AND image_key IS NOT NULL`
    ), { total: i } = s.get(n);
    if (i === 0) return [];
    const o = Math.min(10, i), r = /* @__PURE__ */ new Set();
    for (; r.size < o; )
      r.add(Math.floor(Math.random() * i));
    const t = d.prepare(
      `SELECT id, image_key, title
       FROM journal_entries
       WHERE user_id = ?
         AND is_deleted = 0
         AND image_key IS NOT NULL
       LIMIT 1 OFFSET ?`
    ), p = [];
    for (const l of r)
      p.push(t.get(n, l));
    return p;
  }
  return d.prepare(
    `SELECT id, image_key, title
     FROM journal_entries
     WHERE user_id = ?
       AND is_deleted = 0
       AND image_key IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 10`
  ).all(n);
}
function we(n, e) {
  return d.prepare("SELECT * FROM journal_entries WHERE id = ? AND user_id = ? AND is_deleted = 0").get(e, n);
}
function Ua(n, e) {
  const a = parseInt(e, 10) || 7;
  return d.prepare(`
        SELECT mood_score, created_at, sentiment_score FROM journal_entries
        WHERE user_id = ? AND is_deleted = 0 AND created_at >= date('now', '-' || ? || ' days')
        ORDER BY created_at ASC
    `).all(n, a);
}
function La(n, e, a) {
  const { title: s, content: i, mood_score: o, mood_tags: r } = a, t = _e(i || ""), p = JSON.stringify(r || []), l = (/* @__PURE__ */ new Date()).toISOString();
  return d.prepare(`
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
  `).run({
    title: s || null,
    content: i || "",
    mood_score: o || null,
    sentiment_score: t,
    mood_tags: p,
    updated_at: l,
    journalId: e,
    userId: n
  }).changes > 0 ? we(n, e) : null;
}
function Oa(n, e) {
  return d.prepare(`
        UPDATE journal_entries 
        SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP, synced = 0, sync_action = 'delete'
        WHERE id = ? AND user_id = ?
    `).run(e, n).changes;
}
const Da = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  createJournalEntry: Na,
  deleteJournalEntry: Oa,
  getAllEntries: Aa,
  getImageKeysAndIds: Sa,
  getJournalById: we,
  getMoodScores: Ua,
  getRecentEntries: ka,
  updateJournalEntry: La
}, Symbol.toStringTag, { value: "Module" }));
function Ca(n, e, a) {
  let s;
  if (a === "image")
    s = "image_key";
  else if (a === "audio")
    s = "audio_key";
  else
    throw new Error("Invalid media type specified.");
  return d.prepare(`
        UPDATE journal_entries 
        SET ${s} = @mediaKey 
        WHERE id = @journalId
    `).run({ mediaKey: e, journalId: n }).changes > 0;
}
const Fa = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  linkMediaToJournal: Ca
}, Symbol.toStringTag, { value: "Module" })), $a = async (n) => d.prepare("SELECT * FROM categories WHERE user_id = ? OR user_id = 0").all(n), Ma = async (n, e) => {
  let { name: a, color: s } = e;
  return a === void 0 ? { error: "Name is required" } : (s === void 0 && (s = "#000000"), d.prepare("INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)").run(n, a, s));
}, za = async (n, e) => {
  let { name: a, color: s, id: i } = e;
  return a === void 0 ? { error: "Name is required" } : (s === void 0 && (s = "#000000"), d.prepare("UPDATE categories SET name = ?, color = ? WHERE user_id = ? AND categoryId = ?").run(n, a, s, i));
}, Pa = async (n, e) => d.prepare("DELETE FROM categories WHERE user_id = ? AND categoryId = ?").run(n, e), Ga = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  addCategory: Ma,
  deleteCategory: Pa,
  editCategory: za,
  getCategories: $a
}, Symbol.toStringTag, { value: "Module" })), qa = async (n) => d.prepare(`
        SELECT * FROM goals WHERE user_id = ? AND is_completed = 0
    `).all(n), Xa = async (n) => (console.log("USING .all() version of getCompletedGoals"), d.prepare(`
        SELECT * FROM goals WHERE user_id = ? AND is_completed = 1
    `).all(n)), Ha = async (n, e) => {
  console.log("goalData", e);
  const {
    category_id: a,
    title: s,
    description: i,
    parent_goal: o,
    target_value: r,
    unit: t,
    target_date: p
  } = e;
  if (a != null && !d.prepare(`
            SELECT id FROM categories
            WHERE id = ? AND (user_id = ? OR user_id = 0)
        `).get(a, n))
    throw new Error("Invalid category_id: Must belong to user or be a system category.");
  return d.prepare(`
        INSERT INTO goals (
            user_id, category_id, title, description, parent_goal_title,
             target_value, unit, target_date
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
    n,
    a,
    s,
    i,
    o,
    r,
    t,
    p
  );
}, Wa = async (n, e, a) => {
  console.log(a, "goalData");
  const { category_id: s, title: i, description: o, parent_goal: r, current_value: t, target_value: p, unit: l, is_pinned: u, is_completed: f } = a;
  return d.prepare(`
        UPDATE goals SET category_id = ?, title = ?, description = ?, parent_goal_title = ?, current_value = ?, target_value = ?, unit = ?, is_pinned = ?, is_completed = ? WHERE id = ? AND user_id = ?
    `).run(s, i, o, r, t, p, l, u, f, e, n);
}, Ba = async (n, e) => (d.prepare("DELETE FROM progress_logs WHERE goal_id = ?").run(e), d.prepare(`
        DELETE FROM goals WHERE id = ? AND user_id = ?
    `).run(e, n)), Ya = async (n, e) => d.prepare(`
    UPDATE goals
    SET is_pinned = CASE is_pinned WHEN 1 THEN 0 ELSE 1 END
    WHERE user_id = ? AND id = ?
  `).run(n, e), Ka = async (n, e) => d.prepare(`
        UPDATE goals 
        SET is_completed = 1, completed_date = DATE('now'), is_pinned = 0 
        WHERE user_id = ? AND id = ?
    `).run(n, e), Ja = async (n, e, a) => (d.prepare(
  "UPDATE goals SET current_value = ? WHERE id = ? AND user_id = ?"
).run(a, e, n), d.prepare("SELECT * FROM goals WHERE id = ? AND user_id = ?").get(e, n)), Va = async (n) => d.prepare("SELECT * FROM goals WHERE user_id = ? AND is_pinned = 1").all(n), Qa = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  AddGoal: Ha,
  completeGoal: Ka,
  deleteGoal: Ba,
  getActiveGoals: qa,
  getCompletedGoals: Xa,
  getPinnedGoals: Va,
  togglePinGoal: Ya,
  updateGoal: Wa,
  updateProgress: Ja
}, Symbol.toStringTag, { value: "Module" }));
async function Za(n) {
  return d.prepare(`
        SELECT * FROM progress_logs WHERE goal_id = ?
    `).all(n);
}
async function en(n, e, a) {
  return d.prepare(`
        INSERT INTO progress_logs (goal_id, value, description) VALUES (?, ?, ?)
    `).run(n, e, a);
}
const an = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getProgressLogs: Za,
  logProgress: en
}, Symbol.toStringTag, { value: "Module" })), v = {
  ...va,
  ...ba,
  ...ja,
  ...Da,
  ...Fa,
  ...Ga,
  ...Qa,
  ...an
}, nn = "be1e968105e3d8c510625e7ae117d3b376913c6359b5063bc5ff07f1cc43cfa3229405930cdeb7bcc9e9ebf3199c0b85b1a0c2396018eee4985f2d1a0abf6002", sn = (n) => E.sign(n, nn, { expiresIn: "15m" }), on = async (n, e, a) => {
  const { identifier: s, password: i } = a;
  if (console.log(`Login attempt for ${s} in ${e} mode.`), e === "online")
    try {
      return (await h.post("http://localhost:4000/api/auth/login", a)).data;
    } catch (o) {
      throw console.error("Online login error:", o.response?.data || o.message), new Error(o.response?.data.message || "Online login failed");
    }
  else
    try {
      const o = v.findUserByIdentifier(s);
      if (!o) throw new Error("User not found");
      if (!await j.compare(i, o.password_hash)) throw new Error("Incorrect password");
      const t = sn({ id: o.id, username: o.username }), p = {
        id: o.id,
        username: o.username,
        email: o.email,
        full_name: o.full_name || null,
        // Fallback to null if undefined
        created_at: o.created_at,
        profile_picture: o.profile_picture || null
      };
      return { accessToken: t, userInfo: p };
    } catch (o) {
      throw console.error("Offline login error:", o), o;
    }
}, tn = async (n, e, a) => {
  if (console.log(`Registration attempt in ${e} mode.`), e === "online")
    try {
      return (await h.post("http://localhost:4000/api/auth/register", a)).data;
    } catch (s) {
      throw console.error("Online registration error:", s.response?.data || s.message), new Error(s.response?.data.message || "Online registration failed");
    }
  else
    try {
      if (v.findUserForCheck(a.email, a.username))
        throw new Error("Username or email already exists");
      return { user: v.createUser(a) };
    } catch (s) {
      throw console.error("Offline registration error:", s), s;
    }
};
async function rn() {
  return new Promise((n, e) => {
    const a = Me.createServer(async (s, i) => {
      try {
        const { code: o } = Se.parse(s.url, !0).query;
        if (!o)
          throw new Error("No authorization code received.");
        const r = await h.post(
          "https://oauth2.googleapis.com/token",
          {
            code: o,
            client_id: process.env.GOOGLE_CLIENT_ID,
            // <-- PASTE YOUR CLIENT ID HERE
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            // <-- PASTE YOUR CLIENT SECRET HERE
            redirect_uri: `http://localhost:${a.address().port}`,
            grant_type: "authorization_code"
          }
        ), { access_token: t, refresh_token: p } = r.data, l = await h.get("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${t}` }
        });
        i.end("<h1>Authentication successful!</h1><p>You can now close this tab.</p>"), a.close(), n({
          profile: l.data,
          tokens: { access_token: t, refresh_token: p }
        });
      } catch (o) {
        console.error("OAuth Error:", o.response?.data || o.message), i.end("<h1>Authentication failed.</h1>"), a.close(), e(o);
      }
    }).listen(0, () => {
      const { port: s } = a.address(), i = `http://localhost:${s}`, o = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      o.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID), o.searchParams.set("redirect_uri", i), o.searchParams.set("response_type", "code"), o.searchParams.set("scope", "openid profile email"), o.searchParams.set("access_type", "offline"), o.searchParams.set("prompt", "consent"), xe.openExternal(o.toString());
    });
  });
}
function M(n) {
  try {
    return n ? E.decode(n) : null;
  } catch (e) {
    return console.error("Error decoding token:", e), null;
  }
}
const cn = async (n, e, a) => {
  if (e === "online")
    return (await h.get("http://localhost:4000/api/users/me", {
      headers: { Authorization: `Bearer ${a}` }
    })).data;
  {
    const s = M(a).id;
    if (!s) throw new Error("Invalid token for offline mode");
    return v.getUserById(s);
  }
}, pn = async (n, e, a, s) => {
  if (e === "online")
    return (await h.put("http://localhost:4000/api/users/me", s, {
      headers: { Authorization: `Bearer ${a}` }
    })).data;
  {
    const i = M(a).id;
    if (!i) throw new Error("Invalid token");
    return { user: v.updateUserProfile(i, s) };
  }
}, ln = async (n, e, a) => {
  if (e === "online")
    return (await h.get("http://localhost:4000/api/users/me/settings", {
      headers: { Authorization: `Bearer ${a}` }
    })).data;
  {
    const s = M(a).id;
    if (!s) throw new Error("Invalid token");
    return v.getUserSettings(s);
  }
}, un = async (n, e, a, s) => {
  if (e === "online")
    return (await h.put("http://localhost:4000/api/users/me/settings", s, {
      headers: { Authorization: `Bearer ${a}` }
    })).data;
  {
    const i = M(a).id;
    if (!i) throw new Error("Invalid token");
    return v.updateUserSettings(i, s), v.getUserSettings(i);
  }
}, dn = async (n, e, a, s) => {
  const { old_password: i, new_password: o } = s;
  if (e === "online")
    return (await h.put("http://localhost:4000/api/users/me/change-password", s, {
      headers: { Authorization: `Bearer ${a}` }
    })).data;
  {
    const r = M(a);
    if (!r) throw new Error("Invalid token");
    const t = v.findUserByIdentifier(r.username);
    if (!t) throw new Error("User not found");
    if (!await j.compare(i, t.password_hash)) throw new Error("Incorrect current password");
    return v.changePassword(r.id, o), { message: "Password updated successfully" };
  }
}, mn = async (n, e, a, s) => {
  const { password: i } = s;
  if (e === "online")
    return (await h.delete("http://localhost:4000/api/users/me", {
      headers: { Authorization: `Bearer ${a}` },
      data: s
    })).data;
  {
    const o = M(a);
    if (!o) throw new Error("Invalid token");
    const r = v.findUserByIdentifier(o.username);
    if (!r) throw new Error("User not found");
    if (!await j.compare(i, r.password_hash)) throw new Error("Incorrect password");
    return v.deleteUser(o.id), { message: "User account deleted successfully" };
  }
};
function O(n) {
  try {
    if (!n)
      return null;
    const e = E.decode(n);
    return console.log(e), e;
  } catch (e) {
    return console.error("Error decoding token:", e), null;
  }
}
async function xn(n, e, a, s) {
  const i = O(a).id;
  if (!i) throw new Error("Invalid token");
  return console.log(e, s), e === "online" ? (await h.post("http://localhost:4000/api/journals", s, {
    headers: { Authorization: `Bearer ${a}` }
  })).data : v.createJournalEntry(i, s);
}
async function vn(n, e, a, s) {
  const i = O(a).id;
  if (!i) throw new Error("Invalid token");
  return e === "online" ? (await h.get("http://localhost:4000/api/journals/images", {
    headers: { Authorization: `Bearer ${a}` }
  })).data : v.getImageKeysAndIds(i, s);
}
async function fn(n, e, a) {
  const s = O(a).id;
  if (!s) throw new Error("Invalid token");
  return e === "online" ? (await h.get("http://localhost:4000/api/journals/recent", {
    headers: { Authorization: `Bearer ${a}` }
  })).data : v.getRecentEntries(s);
}
async function gn(n, e, a, s, i) {
  console.log("Getting all entries", e, a);
  const o = O(a).id;
  if (!o) throw new Error("Invalid token");
  if (e === "online")
    return (await h.get("http://localhost:4000/api/journals", {
      headers: { Authorization: `Bearer ${a}` }
    })).data;
  {
    console.log("Getting all entries offline");
    const r = v.getAllEntries(o, s, i);
    return console.log(r), r;
  }
}
async function hn(n, e, a, s) {
  const i = O(a).id;
  if (!i) throw new Error("Invalid token");
  return e === "online" ? (await h.get(`http://localhost:4000/api/journals/${s}`, {
    headers: { Authorization: `Bearer ${a}` }
  })).data : v.getJournalById(i, s);
}
async function bn(n, e, a, s, i) {
  const o = O(a).id;
  if (!o) throw new Error("Invalid token");
  return e === "online" ? (await h.put(`http://localhost:4000/api/journals/${s}`, i, {
    headers: { Authorization: `Bearer ${a}` }
  })).data : v.updateJournalEntry(o, s, i);
}
async function En(n, e, a, s) {
  const i = O(a).id;
  if (!i) throw new Error("Invalid token");
  if (e === "online")
    return (await h.delete(`http://localhost:4000/api/journals/${s}`, {
      headers: { Authorization: `Bearer ${a}` }
    })).data;
  if (v.deleteJournalEntry(i, s) === 0) throw new Error("Journal entry not found or permission denied");
  return { message: "Journal entry marked for deletion" };
}
async function Tn(n, e, a, s) {
  return e === "online" ? (await h.post("http://localhost:4000/api/journals/chat", s, {
    headers: { Authorization: `Bearer ${a}` }
  })).data : { answer: "I can only answer questions when you are online. Please connect to the internet to use the chat feature." };
}
async function yn(n, e, a, s) {
  const i = O(a).id;
  if (!i) throw new Error("Invalid token");
  if (e === "online")
    console.log("later");
  else
    return v.getMoodScores(i, s);
}
async function _n(n) {
  try {
    const a = S.readFileSync(n).toString("base64");
    return `data:${wn(n)};base64,${a}`;
  } catch (e) {
    return console.error("Error loading image:", e), null;
  }
}
function wn(n) {
  const e = n.split(".").pop();
  return e === "jpg" || e === "jpeg" ? "image/jpeg" : e === "png" ? "image/png" : "application/octet-stream";
}
async function Rn(n) {
  try {
    return `data:audio/webm;base64,${S.readFileSync(n).toString("base64")}`;
  } catch (e) {
    return console.error("Error reading file:", e), null;
  }
}
const jn = async (n, { journalId: e, mediaType: a, arrayBuffer: s, filename: i }) => {
  try {
    console.log("Received arrayBuffer:", s);
    const o = Buffer.from(s), r = y.join(D.getPath("userData"), "media", String(e));
    S.mkdirSync(r, { recursive: !0 }), console.log(i, "original name");
    const t = `audio-${Date.now()}.webm`, p = `${Date.now()}-${a === "image" ? i : t}`;
    console.log(p, "unique filename");
    const l = y.join(r, p);
    if (S.writeFileSync(l, o), !v.linkMediaToJournal(e, l, a)) throw new Error("Failed to link media to journal entry in the database.");
    return console.log(`Media saved at: ${l}`), { success: !0, key: l };
  } catch (o) {
    return console.error(o), { success: !1, message: o.message };
  }
};
async function In(n, e) {
  try {
    if (!S.existsSync(e))
      throw new Error("File not found at the specified path.");
    return await shell.openPath(e), { success: !0 };
  } catch (a) {
    throw console.error(`Failed to open media file: ${e}`, a), a;
  }
}
async function Nn(n, { arrayBuffer: e, filename: a, userId: s }) {
  try {
    const i = Buffer.from(e), o = y.join(D.getPath("userData"), "media", "profile");
    S.mkdirSync(o, { recursive: !0 });
    const r = `${Date.now()}-${a}`, t = y.join(o, r);
    if (S.writeFileSync(t, i), console.log(`Profile image saved at: ${t}`), s)
      try {
        typeof v.updateUser == "function" ? await v.updateUser(s, { profile_picture: t }) : v.db && typeof v.db.prepare == "function" ? v.db.prepare(
          "UPDATE users SET profile_picture = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(t, s) : console.warn(
          "localDB has no known updateUser helper — caller should update users table separately."
        );
      } catch (p) {
        console.error("Failed to persist profile_picture to users table:", p);
      }
    return { success: !0, path: t };
  } catch (i) {
    return console.error("Error saving profile image:", i), { success: !1, message: String(i) };
  }
}
function V(n) {
  try {
    if (!n)
      return null;
    const e = E.decode(n);
    return console.log(e), e.id;
  } catch (e) {
    return console.error("Error decoding token:", e), null;
  }
}
const kn = async (n, e, a) => {
  const s = V(a);
  if (!s)
    return { error: "Invalid token" };
  if (e === "online")
    console.log("online mode");
  else
    return console.log("userId in handleGetCategories:", s), v.getCategories(s);
}, An = async (n, e, a, s) => {
  const i = V(a);
  if (!i)
    return { error: "Invalid token" };
  if (e === "online")
    console.log("online mode");
  else
    return v.addCategory(i, s);
}, Sn = async (n, e, a, s) => {
  const i = V(a);
  if (!i)
    return { error: "Invalid token" };
  if (e === "online")
    console.log("online mode");
  else
    return v.updateCategory(i, s);
}, Un = async (n, e, a, s) => {
  const i = V(a);
  if (!i)
    return { error: "Invalid token" };
  if (e === "online")
    console.log("online mode");
  else
    return v.deleteCategory(i, s);
};
function A(n) {
  try {
    if (!n)
      return null;
    const e = E.decode(n);
    return console.log(e, "decoded"), e.id;
  } catch (e) {
    return console.error("Error decoding token:", e), null;
  }
}
const Ln = async (n, e, a) => {
  const s = A(a);
  if (!s)
    return { error: "Invalid token" };
  if (e === "online")
    console.log("online mode");
  else
    return v.getActiveGoals(s);
}, On = async (n, e, a) => {
  console.log("calling completed goals");
  const s = A(a);
  if (!s)
    return { error: "Invalid token" };
  if (e === "online")
    console.log("online mode");
  else
    return v.getCompletedGoals(s);
}, Dn = async (n, e, a, s) => {
  console.log("create goal in methods.js", s), console.log("authMode", e), console.log("token", a);
  const i = A(a);
  if (!i)
    return { error: "Invalid token" };
  if (e === "online")
    console.log("online mode");
  else
    return v.AddGoal(i, s);
}, Cn = async (n, e, a, s, i) => {
  const o = A(a);
  if (!o)
    return { error: "Invalid token" };
  if (e === "online")
    console.log("online mode");
  else
    return v.updateGoal(o, s, i);
}, Fn = async (n, e, a, s) => {
  const i = A(a);
  if (!i)
    return { error: "Invalid token" };
  if (e === "online")
    console.log("online mode");
  else
    return v.deleteGoal(i, s);
}, $n = async (n, e, a, s) => {
  console.log("+++++++++++", e, a, s, "++++++++++++++");
  const i = A(a);
  if (!i)
    return { error: "Invalid token" };
  if (e === "online")
    console.log("online mode");
  else
    return console.log("-----", i), v.togglePinGoal(i, s);
}, Mn = async (n, e, a, s) => {
  const i = A(a);
  if (!i)
    return { error: "Invalid token" };
  if (e === "online")
    console.log("online mode");
  else
    return v.completeGoal(i, s);
}, zn = async (n, e, a, s, i) => {
  const o = A(a);
  if (!o)
    return { error: "Invalid token" };
  if (e === "online")
    console.log("online mode");
  else
    return v.updateProgress(o, s, i);
}, Pn = (n, e, a) => {
  const s = A(a);
  if (!s)
    return { error: "Invalid token" };
  if (e === "online")
    console.log("online mode");
  else
    return v.getPinnedGoals(s);
};
function Re(n) {
  try {
    if (!n)
      return null;
    const e = E.decode(n);
    return console.log(e), e.id;
  } catch (e) {
    return console.error("Error decoding token:", e), null;
  }
}
const Gn = async (n, e, a, s) => {
  if (!Re(a))
    return { error: "Invalid token" };
  if (e === "online")
    console.log("online mode");
  else
    return v.getProgressLogs(s);
}, qn = async (n, e, a, s, i, o) => {
  const r = Re(a);
  if (console.log(r, "userID in profgesslofg"), !r)
    return { error: "Invalid token" };
  if (e === "online")
    console.log("online mode");
  else
    return v.logProgress(s, i, o);
};
function je(n) {
  try {
    if (!n)
      return null;
    const e = E.decode(n);
    return console.log(e, "decoded"), e.id;
  } catch (e) {
    return console.error("Error decoding token:", e), null;
  }
}
const Xn = (n, e) => {
  if (!je(e))
    return { error: "Invalid token" };
  try {
    return ze("ollama list", { encoding: "utf-8" }).trim().split(`
`).slice(1).map((r) => {
      const t = r.trim().split(/\s{2,}/);
      return {
        name: t[0],
        size: t[1],
        modified: t[2]
      };
    });
  } catch (s) {
    return console.error("Error fetching Ollama models:", s), [];
  }
}, Hn = async (n, e, a, s, i = !1) => {
  if (!je(e))
    return { error: "Invalid token" };
  if (!a || !s)
    return { error: "Model name and prompt are required." };
  try {
    const r = {
      model: a,
      prompt: s,
      stream: !1,
      // full output as one JSON
      num_predict: 300
      // limit tokens for speed
    };
    i && (r.format = "json");
    const t = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(r)
    });
    if (!t.ok)
      throw new Error(`Ollama HTTP error: ${t.status} ${t.statusText}`);
    return (await t.json()).response;
  } catch (r) {
    return console.error("Ollama error:", r), { error: r.message };
  }
}, Wn = Ie(import.meta.url), H = y.dirname(Wn);
process.env.DIST = y.join(H, "../dist");
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL ? y.join(H, "../public") : process.env.DIST;
let g;
function me() {
  g = new ve({
    width: 1024,
    height: 800,
    minWidth: 1024,
    minHeight: 800,
    show: !1,
    // Don't show until ready
    icon: y.join(H, "../assets/icon.png"),
    frame: !1,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: y.join(H, "preload.mjs"),
      contextIsolation: !0,
      nodeIntegration: !1
    }
  }), g.once("ready-to-show", () => {
    g.isDestroyed() || g.show();
  }), g.webContents.on("did-finish-load", () => {
    g.isDestroyed() || g.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), g.on("maximize", () => {
    g && !g.isDestroyed() && g.webContents.send("window-maximized", !0);
  }), g.on("unmaximize", () => {
    g && !g.isDestroyed() && g.webContents.send("window-maximized", !1);
  }), process.env.VITE_DEV_SERVER_URL ? (g.loadURL(process.env.VITE_DEV_SERVER_URL), g.webContents.openDevTools()) : g.loadFile(y.join(process.env.DIST, "index.html"));
}
D.whenReady().then(async () => {
  v.initDatabase(), m.on("minimize-window", () => {
    g && !g.isDestroyed() && g.minimize();
  }), m.on("maximize-window", () => {
    g && !g.isDestroyed() && (g.isMaximized() ? g.unmaximize() : g.maximize());
  }), m.on("close-window", () => {
    g && !g.isDestroyed() && g.close();
  }), m.handle("media:save", jn), m.handle("media:open", In), m.handle("media:save-profile", Nn), m.handle("media:getImage", (n, e) => _n(e)), m.handle("media:getAudio", (n, e) => Rn(e)), m.on("screen:maximize", () => {
    g && !g.isDestroyed() && g.maximize();
  }), m.handle("open-external", async (n, e) => {
    try {
      return await xe.openExternal(e), { success: !0 };
    } catch (a) {
      return console.error("openExternal failed:", a), { success: !1, error: String(a) };
    }
  }), m.handle("auth:register", tn), m.handle("auth:login", on), m.handle("login:google", rn), m.handle("user:get-me", cn), m.handle("user:update-profile", pn), m.handle("user:get-settings", ln), m.handle("user:update-settings", un), m.handle("user:change-password", dn), m.handle("user:delete-account", mn), m.handle("journal:create", xn), m.handle("journal:get-recent", fn), m.handle("journal:get-all", gn), m.handle("journal:get-by-id", hn), m.handle("journal:update", bn), m.handle("journal:delete", En), m.handle("journal:get-images", vn), m.handle("journal:get-chart-data", yn), m.handle("chat:send", Tn), m.handle("category:get-all", kn), m.handle("category:delete", Un), m.handle("category:add", An), m.handle("category:update", Sn), m.handle("goal:get-active-goals", Ln), m.handle("goal:get-completed-goals", On), m.handle("goal:add", Dn), m.handle("goal:update", Cn), m.handle("goal:delete", Fn), m.handle("goal:toggle-pin", $n), m.handle("goal:complete", Mn), m.handle("goal:update-progress", zn), m.handle("goal:getPinned", Pn), m.handle("logs:getAll", Gn), m.handle("logs:add", qn), m.handle("ollama:models", Xn), m.handle("ollama:get-response", Hn), ma(), me(), D.on("activate", () => {
    ve.getAllWindows().length === 0 && me();
  });
});
D.commandLine.appendSwitch("disable-features", "AutofillServerCommunication");
D.on("window-all-closed", () => {
  g = null, process.platform !== "darwin" && D.quit();
});
