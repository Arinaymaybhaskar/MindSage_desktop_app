import jwt from "jsonwebtoken";

export function getUserIdFromToken(token) {
  try {
    // 1. Guard against null or undefined tokens
    if (!token) {
      return null;
    }
    const decoded = jwt.decode(token);
    // 2. Ensure the token was successfully decoded and has an id
    return decoded.id;
  } catch (e) {
    console.error("Error decoding token:", e);
    return null;
  }
}
