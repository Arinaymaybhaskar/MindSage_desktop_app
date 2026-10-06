import crypto from "node:crypto";
import Store from "electron-store";

/**
 * Per-install signing secret for offline access tokens.
 *
 * This replaces a 128-character constant that was hardcoded in
 * `methods/auth.js` and therefore shipped inside every packaged build, which
 * meant every install on earth shared one signing key.
 *
 * What this does and does not buy you:
 *
 * - It does NOT make the secret confidential. Nothing shipped to a user's
 *   machine can be kept from that user, and the journal database next to it
 *   is plaintext SQLite anyway. Obfuscation here would be theatre.
 * - It DOES make the key unique per install, so a value recovered from one
 *   machine says nothing about any other. That is the property that matters
 *   the moment the handlers start verifying signatures, and it is why
 *   verifying against a repo-visible constant would have been pointless.
 *
 * Rotating is currently free: no code path calls `jwt.verify`, so no existing
 * session breaks when this generates a fresh value on first run. See
 * docs/AUTH_REVIEW.md §2.1, and MASTER_TODO items 16 and 17.
 *
 * Once the database is encrypted (MASTER_TODO item 18), this is worth moving
 * behind Electron's `safeStorage` so it is not the weakest link.
 */
const store = new Store({ name: "auth-secret" });

const SECRET_KEY = "offlineAccessTokenSecret";

/** 64 bytes of entropy, hex-encoded, matching the length of the old constant. */
const SECRET_BYTES = 64;

let cached = null;

/**
 * Returns this install's token-signing secret, generating and persisting one
 * on first call. Lazy rather than module-scoped so importing this file has no
 * side effects and does not need `app` to be ready.
 */
export function getOfflineAccessTokenSecret() {
  if (cached) return cached;

  const stored = store.get(SECRET_KEY);
  if (typeof stored === "string" && stored.length >= SECRET_BYTES) {
    cached = stored;
    return cached;
  }

  cached = crypto.randomBytes(SECRET_BYTES).toString("hex");
  store.set(SECRET_KEY, cached);
  return cached;
}
