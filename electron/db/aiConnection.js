import Database from "better-sqlite3";
import { db } from "./connection.js";
import { currentUserId } from "../session.js";

// The connection Ask's tools use (KAN-454). Until each profile has its own
// database file, it carries temporary triggers that refuse any write to
// another profile's rows, whatever SQL a tool runs. They are TEMP, so they
// live only on this connection: the purge, imports and profile delete on the
// main connection are not affected. Reads are bounded by the tools being
// pre-written queries; better-sqlite3 has no authorizer to deny them here.

/** Tables a tool could change, and how a row names its profile. */
const OWNER = {
  journal_entries: (row) => `${row}.user_id`,
  goals: (row) => `${row}.user_id`,
  tags: (row) => `${row}.user_id`,
  chats: (row) => `${row}.user_id`,
  progress_logs: (row) =>
    `(SELECT user_id FROM main.goals WHERE id = ${row}.goal_id)`,
};

export const GUARD_MESSAGE = "AI tools can only change the signed-in profile";
export const READ_ONLY_MESSAGE = "AI tools cannot change this table";

/**
 * Adds the triggers to `conn`. `getUserId` is read on every write, so a
 * profile switch takes effect at once; signed out (null) refuses every write.
 * Every other table (users, settings, messages, people, the index, ...) is
 * denied by default: no tool needs to change it, so every write is refused.
 * A delete that cascades into a child is refused too, so it fails closed.
 */
export function installProfileGuard(conn, getUserId) {
  conn.function("ms_profile", { deterministic: false }, () => getUserId());
  const other = (expr) => `${expr} IS NOT ms_profile()`;
  const tables = conn
    .prepare(
      `SELECT name FROM main.sqlite_master WHERE type = 'table'
         AND name NOT GLOB 'sqlite_*'
         AND sql NOT LIKE 'CREATE VIRTUAL TABLE%'`,
    )
    .pluck()
    .all();
  for (const table of tables) {
    const owner = OWNER[table];
    const when = owner
      ? {
          INSERT: other(owner("NEW")),
          UPDATE: `${other(owner("OLD"))} OR ${other(owner("NEW"))}`,
          DELETE: other(owner("OLD")),
        }
      : { INSERT: "1", UPDATE: "1", DELETE: "1" };
    const message = owner ? GUARD_MESSAGE : READ_ONLY_MESSAGE;
    for (const [op, cond] of Object.entries(when)) {
      conn.exec(`
        CREATE TEMP TRIGGER IF NOT EXISTS "ai_guard_${table}_${op.toLowerCase()}"
        BEFORE ${op} ON main."${table}" WHEN ${cond}
        BEGIN SELECT RAISE(ABORT, '${message}'); END;`);
    }
  }
  return conn;
}

let conn = null;

/** The guarded connection, opened on first use. */
export function aiDb() {
  if (conn) return conn;
  conn = new Database(db.name);
  conn.pragma("foreign_keys = ON");
  conn.pragma("busy_timeout = 2000");
  // Per connection, like the main one: a deleted row is overwritten.
  conn.pragma("secure_delete = ON");
  return installProfileGuard(conn, currentUserId);
}
