import bcrypt from "bcryptjs";
import { db } from "./connection.js"; // Import the db connection

/**
 * Finds a user by profile name (the username column), for sign-in and the
 * duplicate check. Email is no longer a way in (KAN-67).
 */
export function findUserByName(name) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(name);
}

/**
 * The signed-in user's row, for session restore and password checks.
 */
export function findUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

/**
 * Every account on this install, for the profile picker shown while signed
 * out. Deliberately narrow: no email, no hash, nothing a stranger at the
 * keyboard should learn beyond who has a journal here. User 0 is the seeded
 * system account and never signs in.
 */
export function listProfiles() {
  return db
    .prepare(
      `SELECT id, username, profile_picture
         FROM users WHERE id != 0 ORDER BY id`,
    )
    .all();
}

/**
 * Creates a new user in the local SQLite database.
 */
export function createUser(details) {
  const {
    username,
    email = null,
    password,
    full_name = null,
    timezone,
    profile_picture = null,
  } = details;
  const hashedPassword = bcrypt.hashSync(password, 10);

  const userStmt = db.prepare(`
        INSERT INTO users (username, email, password_hash, full_name, timezone, profile_picture)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
  const settingsStmt = db.prepare(
    "INSERT INTO user_settings (user_id) VALUES (?)",
  );

  const runTransaction = db.transaction((user) => {
    const result = userStmt.run(
      user.username,
      user.email,
      user.hashedPassword,
      user.full_name,
      user.timezone,
      user.profile_picture,
    );
    const userId = result.lastInsertRowid;
    settingsStmt.run(userId);
    return { id: userId, username: user.username };
  });

  return runTransaction({
    username,
    email,
    hashedPassword,
    full_name,
    timezone,
    profile_picture,
  });
}
