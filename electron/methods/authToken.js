import jwt from "jsonwebtoken";

/**
 * Reads the user id out of a session token.
 *
 * Note this decodes without verifying: neither the signature nor `exp` is
 * checked. That is the existing behaviour across every module under
 * `electron/methods/`, and swapping in `jwt.verify` here alone would log
 * every user out permanently, because the refresh path points at a server
 * that never starts. See docs/AUTH_REVIEW.md section 2.1.
 *
 * Returns the id itself, not the decoded payload. Several sibling modules
 * keep a private copy of this function that returns the whole payload and
 * is called as `getUserIdFromToken(token).id`; the two shapes are not
 * interchangeable.
 */
export function getUserIdFromToken(token) {
  try {
    if (!token) {
      return null;
    }
    const decoded = jwt.decode(token);
    return decoded.id;
  } catch (e) {
    console.error("Error decoding token:", e);
    return null;
  }
}
