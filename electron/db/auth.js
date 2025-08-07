import bcrypt from 'bcryptjs';
import { db } from './connection.js'; // Import the db connection

/**
 * Finds a user by their email or username for login.
 */
export function findUserByIdentifier(identifier) {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?');
    return stmt.get(identifier, identifier);
}

/**
 * Finds a user by email or username to check for uniqueness during registration.
 */
export function findUserForCheck(email, username) {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?');
    return stmt.get(email, username);
}

/**
 * Creates a new user in the local SQLite database.
 */
export function createUser(details) {
    const { username, email, password, full_name, timezone } = details;
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    const userStmt = db.prepare(`
        INSERT INTO users (username, email, password_hash, full_name, timezone)
        VALUES (?, ?, ?, ?, ?)
    `);
    const settingsStmt = db.prepare('INSERT INTO user_settings (user_id) VALUES (?)');

    const runTransaction = db.transaction((user) => {
        const result = userStmt.run(user.username, user.email, user.hashedPassword, user.full_name, user.timezone);
        const userId = result.lastInsertRowid;
        settingsStmt.run(userId);
        return { id: userId, username: user.username };
    });

    return runTransaction({ username, email, hashedPassword, full_name, timezone });
}
